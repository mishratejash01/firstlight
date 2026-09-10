-- Engine statistics: the aggregates the scorer reads and the histories it
-- learns from. All set-based, all in SQL, because each is a group-by over
-- mentions that Postgres does in one pass and a loop in application code
-- would do in hundreds of round trips.

-- ---------------------------------------------------------------------------
-- 1. Per-event feature aggregates for everything currently in play.
--
-- One row per live event with the timing counts, the per-source first-arrival
-- times and the raw magnitudes. The scorer turns these into features; this
-- function only counts.
-- ---------------------------------------------------------------------------
create or replace function public.engine_event_aggregates(p_window_hours integer default 48)
returns table (
  event_id uuid,
  title text,
  entities text[],
  status text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  region_mix jsonb,
  mentions_total integer,
  mentions_1h integer,
  mentions_24h integer,
  bucket_0_30 integer,
  bucket_30_60 integer,
  bucket_60_90 integer,
  -- [{key, kind, first_at}] per distinct source, ordered by arrival.
  sources jsonb,
  -- [{kind, magnitude}] per mention that carried one.
  magnitudes jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with live as (
    select e.id, e.title, e.entities, e.status, e.first_seen_at, e.last_seen_at, e.region_mix
    from public.story_events e
    where e.status in ('candidate', 'newsworthy')
      and e.last_seen_at > now() - make_interval(hours => greatest(p_window_hours, 1))
  ),
  per_source as (
    select m.event_id, m.source_key, m.source_kind, min(m.observed_at) as first_at
    from public.signal_mentions m
    join live on live.id = m.event_id
    group by m.event_id, m.source_key, m.source_kind
  ),
  counts as (
    select
      m.event_id,
      count(*)::integer as mentions_total,
      count(*) filter (where m.observed_at > now() - interval '1 hour')::integer as mentions_1h,
      count(*) filter (where m.observed_at > now() - interval '24 hours')::integer as mentions_24h,
      count(*) filter (where m.observed_at > now() - interval '30 minutes')::integer as bucket_0_30,
      count(*) filter (where m.observed_at <= now() - interval '30 minutes'
                         and m.observed_at > now() - interval '60 minutes')::integer as bucket_30_60,
      count(*) filter (where m.observed_at <= now() - interval '60 minutes'
                         and m.observed_at > now() - interval '90 minutes')::integer as bucket_60_90,
      coalesce(jsonb_agg(jsonb_build_object('kind', m.source_kind, 'magnitude', m.magnitude))
               filter (where m.magnitude is not null), '[]'::jsonb) as magnitudes
    from public.signal_mentions m
    join live on live.id = m.event_id
    group by m.event_id
  )
  select
    live.id, live.title, live.entities, live.status, live.first_seen_at, live.last_seen_at,
    live.region_mix,
    coalesce(c.mentions_total, 0), coalesce(c.mentions_1h, 0), coalesce(c.mentions_24h, 0),
    coalesce(c.bucket_0_30, 0), coalesce(c.bucket_30_60, 0), coalesce(c.bucket_60_90, 0),
    coalesce((
      select jsonb_agg(jsonb_build_object('key', ps.source_key, 'kind', ps.source_kind, 'first_at', ps.first_at)
                       order by ps.first_at)
      from per_source ps where ps.event_id = live.id
    ), '[]'::jsonb),
    coalesce(c.magnitudes, '[]'::jsonb)
  from live
  left join counts c on c.event_id = live.id;
$$;

revoke all on function public.engine_event_aggregates(integer) from public, anon, authenticated;
grant execute on function public.engine_event_aggregates(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Roll the last hour of mentions into the compact entity history.
--
-- Idempotent: re-running for the same hour overwrites rather than double
-- counts, so a pulse that fires twice does no harm.
-- ---------------------------------------------------------------------------
create or replace function public.engine_rollup_entity_hour(p_hour timestamptz default date_trunc('hour', now()))
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.entity_hourly (entity, source_kind, hour, mentions)
  select entity, m.source_kind, date_trunc('hour', p_hour), count(*)
  from public.signal_mentions m
  cross join lateral unnest(m.entities) as entity
  where m.observed_at >= date_trunc('hour', p_hour)
    and m.observed_at < date_trunc('hour', p_hour) + interval '1 hour'
  group by entity, m.source_kind
  on conflict (entity, source_kind, hour) do update set mentions = excluded.mentions;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.engine_rollup_entity_hour(timestamptz) from public, anon, authenticated;
grant execute on function public.engine_rollup_entity_hour(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Baseline rates for a set of entities.
--
-- Mean and variance of hourly mentions over the last 30 days, excluding the
-- most recent 6 hours so that the burst being measured is not also part of the
-- baseline it is measured against. Hours with no row count as zero, which the
-- generate_series join makes explicit rather than leaving to the caller.
-- ---------------------------------------------------------------------------
create or replace function public.engine_entity_baselines(p_entities text[])
returns table (
  entity text,
  source_kind text,
  hourly_mean numeric,
  hourly_var numeric,
  hours_observed integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with hours as (
    select generate_series(
      date_trunc('hour', now() - interval '30 days'),
      date_trunc('hour', now() - interval '6 hours'),
      interval '1 hour'
    ) as hour
  ),
  kinds as (
    select distinct e.entity, h.source_kind
    from unnest(p_entities) as e(entity)
    join public.entity_hourly h on h.entity = e.entity
  ),
  grid as (
    select k.entity, k.source_kind, hours.hour, coalesce(h.mentions, 0) as mentions
    from kinds k
    cross join hours
    left join public.entity_hourly h
      on h.entity = k.entity and h.source_kind = k.source_kind and h.hour = hours.hour
  )
  select entity, source_kind,
         avg(mentions)::numeric as hourly_mean,
         coalesce(var_pop(mentions), 0)::numeric as hourly_var,
         count(*)::integer as hours_observed
  from grid
  group by entity, source_kind;
$$;

revoke all on function public.engine_entity_baselines(text[]) from public, anon, authenticated;
grant execute on function public.engine_entity_baselines(text[]) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Source statistics from settled events.
--
-- Run periodically over events with at least three sources. A source "led" an
-- event if it was in the first quartile of arrivals. Lead score is an
-- exponential moving average so it tracks current behaviour, not history.
--
-- Co-coverage is recorded for every ordered pair present on the same event.
-- ---------------------------------------------------------------------------
create or replace function public.engine_update_source_stats(p_since interval default interval '6 hours')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  processed integer := 0;
  ev record;
begin
  for ev in
    select e.id
    from public.story_events e
    where e.last_seen_at > now() - p_since
      and e.source_count >= 3
  loop
    -- Arrival order per source on this event.
    with arrivals as (
      select m.source_key, m.source_kind, min(m.observed_at) as first_at
      from public.signal_mentions m
      where m.event_id = ev.id
      group by m.source_key, m.source_kind
    ),
    ranked as (
      select *, percent_rank() over (order by first_at) as pr from arrivals
    )
    insert into public.source_stats (source_key, source_kind, events_seen, events_led, lead_score)
    select source_key, source_kind, 1,
           case when pr <= 0.25 then 1 else 0 end,
           case when pr <= 0.25 then 1.0 else 0.0 end
    from ranked
    on conflict (source_key) do update
      set events_seen = public.source_stats.events_seen + 1,
          events_led  = public.source_stats.events_led + excluded.events_led,
          -- EMA with alpha 0.1: a source's reputation moves, but not on one event.
          lead_score  = public.source_stats.lead_score * 0.9 + excluded.lead_score * 0.1,
          updated_at  = now();

    -- Co-coverage for every ordered pair on this event.
    with srcs as (
      select distinct m.source_key from public.signal_mentions m where m.event_id = ev.id
    )
    insert into public.source_pairs (source_a, source_b, events_a, events_both)
    select a.source_key, b.source_key, 1, 1
    from srcs a cross join srcs b
    where a.source_key <> b.source_key
    on conflict (source_a, source_b) do update
      set events_both = public.source_pairs.events_both + 1,
          events_a    = public.source_pairs.events_a + 1,
          updated_at  = now();

    -- Sources present on this event but paired with sources absent from it
    -- still had an event; that keeps the denominator honest.
    update public.source_pairs p
       set events_a = p.events_a + 1
     where p.source_a in (select m.source_key from public.signal_mentions m where m.event_id = ev.id)
       and p.source_b not in (select m.source_key from public.signal_mentions m where m.event_id = ev.id);

    processed := processed + 1;
  end loop;

  return processed;
end;
$$;

revoke all on function public.engine_update_source_stats(interval) from public, anon, authenticated;
grant execute on function public.engine_update_source_stats(interval) to service_role;

-- Keep source_count on events current. A cheap trigger beats recounting on
-- every read.
create or replace function app.refresh_event_source_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_id is not null then
    update public.story_events e
       set source_count = (
         select count(distinct m.source_key) from public.signal_mentions m where m.event_id = new.event_id
       )
     where e.id = new.event_id;
  end if;
  return new;
end;
$$;

create trigger signal_mentions_refresh_source_count
  after insert or update of event_id on public.signal_mentions
  for each row execute function app.refresh_event_source_count();
