-- engine_earliness_rows, set-based.
--
-- The first version answered each horizon with a correlated subquery per
-- event: ten seconds per day of events, and a statement timeout over a
-- training window. This version groups once per (event, outlet) and once per
-- event and joins; the same columns, a few seconds for a week.
--
-- The training window is also capped by fact: signal_mentions keeps seven
-- days, so an event older than that has no mentions left and would look like
-- a story nobody followed. The caller trains on six days.

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
  m as (
    select ev.id as event_id, ev.created_at, sm.source_key, sm.source_kind, sm.observed_at,
           coalesce(sm.created_at, sm.observed_at) as known_at,
           (sm.raw ? 'beat') as is_beat,
           (sm.raw ? 'topStories') as is_top
      from ev join public.signal_mentions sm on sm.event_id = ev.id
  ),
  per_source as (
    select event_id, created_at, source_key,
           min(known_at) as first_known, min(observed_at) as first_observed
      from m group by event_id, created_at, source_key
  ),
  agg_src as (
    select event_id,
           count(*) filter (where first_known <= created_at + interval '10 minutes') as n10,
           count(*) filter (where first_known <= created_at + interval '30 minutes') as n30,
           count(*) filter (where first_observed <= created_at + interval '6 hours') as n6h,
           (array_agg(first_observed order by first_observed))[2] as second_at
      from per_source group by event_id
  ),
  agg_m as (
    select event_id,
           count(*) filter (where known_at <= created_at + interval '30 minutes') as men30,
           bool_or(is_beat) as on_beat,
           bool_or(is_top and known_at <= created_at + interval '30 minutes') as via_top
      from m group by event_id
  ),
  first_m as (
    select distinct on (event_id) event_id, source_kind, source_key
      from m order by event_id, observed_at, known_at
  ),
  mix as (
    select ev.id as event_id,
           sum((t.v)::numeric) as total,
           sum((t.v)::numeric) filter (where t.k = 'IN') as home
      from ev, jsonb_each_text(coalesce(ev.region_mix, '{}'::jsonb)) as t(k, v)
     group by ev.id
  )
  select ev.id,
         ev.created_at,
         coalesce(s.n10, 0)::int,
         coalesce(s.n30, 0)::int,
         coalesce(am.men30, 0)::int,
         f.source_kind,
         coalesce(a.weight, 0.8),
         coalesce(am.on_beat, false),
         coalesce(am.via_top, false),
         case when coalesce(mx.total, 0) > 0 then coalesce(mx.home, 0) / mx.total else 0 end,
         extract(hour from ev.created_at at time zone 'Asia/Kolkata')::int,
         coalesce(array_length(ev.entities, 1), 0),
         s.second_at,
         case when p_with_label then coalesce(s.n6h, 0)::int else null end,
         case when p_with_label then coalesce(s.n6h, 0) >= 5 else null end
    from ev
    left join agg_src s on s.event_id = ev.id
    left join agg_m am on am.event_id = ev.id
    left join first_m f on f.event_id = ev.id
    left join public.source_authority a on a.host = f.source_key
    left join mix mx on mx.event_id = ev.id;
$$;
revoke all on function public.engine_earliness_rows(timestamptz, timestamptz, boolean) from public, anon, authenticated;
