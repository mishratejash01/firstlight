-- The earliness model's data, and the label-drift monitor.
--
-- Earliness asks, at an event's first half hour, whether it will reach five
-- independent outlets within six hours. The mention table already knows the
-- answer for every past event, so the labels are free and there are
-- thousands of them. Measured before this was built: three or more outlets in
-- the first thirty minutes meant a 31 per cent chance of becoming big, one
-- outlet 1.5 per cent; the first outlet's authority meant nothing.
--
-- One honesty note. A mention's observed_at is when the outlet published,
-- and a corroboration search can attach a mention hours after that, so
-- "known by thirty minutes" was not knowable for older rows. Mentions now
-- record when they arrived, and the rows use arrival where it exists.

alter table public.signal_mentions add column if not exists created_at timestamptz;
alter table public.signal_mentions alter column created_at set default now();

create or replace function public.engine_earliness_rows(
  p_from timestamptz,
  p_to timestamptz,
  p_with_label boolean default true
)
returns table (
  event_id uuid,
  created_at timestamptz,
  n_out_10 integer,
  n_out_30 integer,
  n_men_30 integer,
  first_kind text,
  first_authority numeric,
  on_beat boolean,
  via_top boolean,
  home_share numeric,
  hour_ist integer,
  entity_count integer,
  second_source_at timestamptz,
  n_out_6h integer,
  big boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with ev as (
    select e.id, e.created_at, e.entities, e.region_mix
      from public.story_events e
     where e.created_at >= p_from and e.created_at < p_to
  ),
  known as (
    -- What the engine had by each horizon: arrival time where recorded,
    -- else the outlet's own time.
    select ev.id as event_id, ev.created_at, m.source_key, m.source_kind, m.observed_at, m.raw,
           coalesce(m.created_at, m.observed_at) as known_at
      from ev join public.signal_mentions m on m.event_id = ev.id
  ),
  per_source as (
    select event_id, source_key, min(known_at) as first_known, min(observed_at) as first_observed
      from known group by event_id, source_key
  ),
  ordered as (
    select event_id, source_key, first_observed,
           row_number() over (partition by event_id order by first_observed) as rn
      from per_source
  ),
  first_mention as (
    select distinct on (event_id) event_id, source_kind, source_key
      from known order by event_id, observed_at, known_at
  )
  select ev.id,
         ev.created_at,
         (select count(*)::int from per_source p where p.event_id = ev.id and p.first_known <= ev.created_at + interval '10 minutes'),
         (select count(*)::int from per_source p where p.event_id = ev.id and p.first_known <= ev.created_at + interval '30 minutes'),
         (select count(*)::int from known k where k.event_id = ev.id and k.known_at <= ev.created_at + interval '30 minutes'),
         fm.source_kind,
         coalesce((select a.weight from public.source_authority a where a.host = fm.source_key), 0.8),
         exists (select 1 from known k where k.event_id = ev.id and k.raw ? 'beat'),
         exists (select 1 from known k where k.event_id = ev.id and k.raw ? 'topStories' and k.known_at <= ev.created_at + interval '30 minutes'),
         case when (select sum((v)::numeric) from jsonb_each_text(coalesce(ev.region_mix, '{}'::jsonb)) as t(k, v)) > 0
              then coalesce((ev.region_mix->>'IN')::numeric, 0) / (select sum((v)::numeric) from jsonb_each_text(ev.region_mix) as t(k, v))
              else 0 end,
         extract(hour from ev.created_at at time zone 'Asia/Kolkata')::int,
         coalesce(array_length(ev.entities, 1), 0),
         (select o.first_observed from ordered o where o.event_id = ev.id and o.rn = 2),
         case when p_with_label then (select count(*)::int from per_source p where p.event_id = ev.id and p.first_observed <= ev.created_at + interval '6 hours') else null end,
         case when p_with_label then (select count(*) from per_source p where p.event_id = ev.id and p.first_observed <= ev.created_at + interval '6 hours') >= 5 else null end
    from ev
    left join first_mention fm on fm.event_id = ev.id;
$$;
revoke all on function public.engine_earliness_rows(timestamptz, timestamptz, boolean) from public, anon, authenticated;

-- Per label source: the last day against the week before it.
create or replace function public.engine_label_drift()
returns table (
  label_source text,
  n_24h integer,
  mean_24h numeric,
  n_7d integer,
  mean_7d numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.label_source,
         count(*) filter (where o.created_at >= now() - interval '24 hours')::int,
         round(avg(o.label) filter (where o.created_at >= now() - interval '24 hours')::numeric, 3),
         count(*) filter (where o.created_at < now() - interval '24 hours')::int,
         round(avg(o.label) filter (where o.created_at < now() - interval '24 hours')::numeric, 3)
    from public.event_outcomes o
   where app.is_editorial()
     and o.created_at >= now() - interval '8 days'
   group by o.label_source
   order by o.label_source;
$$;
grant execute on function public.engine_label_drift() to authenticated;
