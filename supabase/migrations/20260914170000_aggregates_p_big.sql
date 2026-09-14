-- The scorer's aggregate rows carry the earliness probability, so momentum
-- (p_big scaled to the 0..10 the other signals use) is computed in the same
-- pass as everything else. Return columns cannot be changed in place; the
-- function is dropped and recreated with p_big appended, the body otherwise
-- as it was.

drop function if exists public.engine_event_aggregates(integer);

create function public.engine_event_aggregates(p_window_hours integer default 48)
returns table (
  event_id uuid, title text, entities text[], status text,
  first_seen_at timestamptz, last_seen_at timestamptz, region_mix jsonb,
  mentions_total integer, mentions_1h integer, mentions_24h integer,
  bucket_0_30 integer, bucket_30_60 integer, bucket_60_90 integer,
  sources jsonb, magnitudes jsonb, p_big numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with live as (
    select e.id, e.title, e.entities, e.status, e.first_seen_at, e.last_seen_at, e.region_mix, e.p_big
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
    coalesce(c.magnitudes, '[]'::jsonb),
    live.p_big
  from live
  left join counts c on c.event_id = live.id;
$$;
revoke all on function public.engine_event_aggregates(integer) from public, anon, authenticated;
