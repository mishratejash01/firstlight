-- The publication date a source page declares about itself, kept with the
-- cached extraction so the desk can tell a fresh story from a stale one.
alter table public.source_documents add column if not exists published_at timestamptz;
