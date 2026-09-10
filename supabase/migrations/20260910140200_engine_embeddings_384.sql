-- The engine's embeddings move to gte-small, served from an edge function
-- inside the project: 384 dimensions, no metered quota. The old 768-wide
-- Gemini vectors are not comparable and are dropped with the column type.

drop index if exists public.story_events_centroid_idx;
drop index if exists public.signal_mentions_embedding_idx;

alter table public.story_events
  alter column centroid type extensions.vector(384) using null;

alter table public.signal_mentions
  alter column embedding type extensions.vector(384) using null;

create index story_events_centroid_idx
  on public.story_events using hnsw (centroid extensions.vector_cosine_ops)
  where status in ('candidate', 'newsworthy');
