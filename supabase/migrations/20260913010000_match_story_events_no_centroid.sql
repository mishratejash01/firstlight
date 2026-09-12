-- match_story_events stops returning the centroid.
--
-- The cluster step calls this for every incoming mention and got back the
-- full 384-number vector of each of the ten nearest events: about 52 KB per
-- call, 39,000 calls a day, two gigabytes a day of egress. The client used
-- those vectors for two things. It recomputed the similarity, which this
-- function already returns exactly (measured on four thousand real pairs,
-- the two figures never differed by more than 3e-7 and no clustering
-- decision changed). And it updated the winning event's running average,
-- for which it needs one vector, which it now reads by id on the join.
--
-- A function's return columns cannot be changed in place, so drop and
-- recreate. Arguments, body, ordering and limits are unchanged.

drop function if exists public.match_story_events(vector, integer, integer);

create function public.match_story_events(
  query_embedding vector,
  window_hours integer default 48,
  match_count integer default 5
)
returns table (
  id uuid,
  title text,
  entities text[],
  source_keys text[],
  mention_count integer,
  similarity double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.title, e.entities, e.source_keys, e.mention_count,
         1 - (e.centroid operator(extensions.<=>) query_embedding) as similarity
    from public.story_events e
   where e.status in ('candidate', 'newsworthy')
     and e.centroid is not null
     and e.last_seen_at > now() - make_interval(hours => greatest(window_hours, 1))
   order by e.centroid operator(extensions.<=>) query_embedding
   limit greatest(match_count, 1);
$$;

revoke all on function public.match_story_events(vector, integer, integer) from public, anon, authenticated;
