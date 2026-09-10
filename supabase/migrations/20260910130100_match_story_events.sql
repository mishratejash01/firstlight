-- Nearest live events to a query embedding.
--
-- Served by the HNSW index on story_events.centroid. The status and time
-- filters keep the candidate set to events that could plausibly still be
-- receiving coverage; pgvector 0.8's iterative scans mean a filtered HNSW
-- query still returns the requested number of rows rather than an empty set
-- when the nearest neighbours happen to be filtered out.
--
-- `<=>` is cosine distance, so similarity is 1 minus it. The caller
-- recomputes similarity exactly from the returned vector; this figure is for
-- ordering only.
--
-- The operator is schema-qualified because the function pins search_path to
-- '' — the right thing for SECURITY DEFINER — which means the extensions
-- schema, where pgvector lives, is not searched for operators either.

create or replace function public.match_story_events(
  query_embedding extensions.vector(768),
  window_hours integer default 48,
  match_count integer default 8
)
returns table (
  id uuid,
  title text,
  entities text[],
  centroid extensions.vector(768),
  mention_count integer,
  similarity double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.title, e.entities, e.centroid, e.mention_count,
         1 - (e.centroid operator(extensions.<=>) query_embedding) as similarity
  from public.story_events e
  where e.status in ('candidate', 'newsworthy')
    and e.centroid is not null
    and e.last_seen_at > now() - make_interval(hours => greatest(window_hours, 1))
  order by e.centroid operator(extensions.<=>) query_embedding
  limit greatest(match_count, 1);
$$;

-- Worker-only. Nothing a signed-in user does needs to probe the event space.
revoke all on function public.match_story_events(extensions.vector, integer, integer)
  from public, anon, authenticated;
grant execute on function public.match_story_events(extensions.vector, integer, integer)
  to service_role;
