-- Outlet identity on events, and a record of when each was last searched.
--
-- Two findings drove this. Every Google News search hit had been stored
-- under the single key "news.google.com", so corroboration never raised an
-- event's source count; the outlet is now taken from the feed's source tag.
-- And an outlet rarely files forty pieces on one story in a day: a mention
-- from an outlet already on the event must be a near-duplicate to join, or
-- it founds its own event. That needs the event to know its outlets.

alter table public.story_events
  add column if not exists source_keys text[] not null default '{}',
  add column if not exists corroborated_at timestamptz;

update public.story_events e
   set source_keys = coalesce((select array_agg(distinct m.source_key) from public.signal_mentions m where m.event_id = e.id), '{}')
 where e.status in ('candidate', 'newsworthy', 'writing');

-- The return shape changes, which Postgres will not do in place.
drop function if exists public.match_story_events(extensions.vector, integer, integer);

create function public.match_story_events(
  query_embedding extensions.vector,
  window_hours integer default 48,
  match_count integer default 5
)
returns table (
  id uuid,
  title text,
  entities text[],
  source_keys text[],
  mention_count integer,
  centroid extensions.vector,
  similarity double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.title, e.entities, e.source_keys, e.mention_count, e.centroid,
         1 - (e.centroid operator(extensions.<=>) query_embedding) as similarity
  from public.story_events e
  where e.status in ('candidate', 'newsworthy')
    and e.centroid is not null
    and e.last_seen_at > now() - make_interval(hours => greatest(window_hours, 1))
  order by e.centroid operator(extensions.<=>) query_embedding
  limit greatest(match_count, 1);
$$;

revoke all on function public.match_story_events(extensions.vector, integer, integer) from public, anon, authenticated;
grant execute on function public.match_story_events(extensions.vector, integer, integer) to service_role;

insert into public.site_settings (key, value, description) values
  ('engine_triage_hourly_budget', '40'::jsonb,
   'Maximum triage model calls per hour. Above this, candidates wait for the next hour rather than exhausting the model quota.')
on conflict (key) do nothing;
