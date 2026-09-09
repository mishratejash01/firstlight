-- Wire ingestion staging.
--
-- Ingested items land here, never in `articles`. That separation is the whole
-- point of the pipeline: nothing a machine fetched can be sitting in the table
-- the public site reads from, however the promotion logic is later changed or
-- broken. An editor promotes an item and, in doing so, creates the article.
--
-- Every row keeps the raw payload it came from, so a mis-parsed field can be
-- diagnosed months later without re-fetching a feed that has since rolled over.

create table public.wire_items (
  id uuid primary key default extensions.gen_random_uuid(),
  source_id uuid not null references public.sources (id) on delete cascade,

  -- The feed's own identifier for the item. Feeds are re-fetched constantly and
  -- most republish the same entries every poll, so this is what stops one story
  -- arriving in the queue fifty times.
  external_id text not null,
  -- Hash of the content itself. An item whose guid is unchanged but whose text
  -- has been corrected upstream is a genuine update worth surfacing, and this
  -- is how that is told apart from a plain re-poll.
  content_hash text not null,

  title text not null,
  summary text,
  body text,
  link text,
  author_name text,
  published_at timestamptz,

  -- Subject codes as the feed expressed them, before mapping. Kept verbatim so
  -- a bad mapping can be re-run against the original.
  raw_categories text[] not null default '{}',
  -- Section this was routed to, by IPTC qcode where the feed supplies one.
  suggested_category_id uuid references public.categories (id) on delete set null,

  raw_payload jsonb not null default '{}'::jsonb,

  status text not null default 'pending',
  -- Set when an editor promotes the item, linking staging row to published work.
  promoted_article_id uuid references public.articles (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,

  -- Populated by the AI assist, never applied automatically.
  ai_summary text,
  ai_suggested_tags text[],

  ingested_at timestamptz not null default now(),

  unique (source_id, external_id),
  constraint wire_items_status_valid
    check (status in ('pending', 'promoted', 'rejected', 'duplicate'))
);

create index wire_items_queue_idx
  on public.wire_items (status, ingested_at desc);
create index wire_items_source_idx on public.wire_items (source_id, ingested_at desc);
create index wire_items_promoted_idx on public.wire_items (promoted_article_id);

alter table public.wire_items enable row level security;

-- No anon policy of any kind. Unreviewed wire copy is not public, and treating
-- it as merely "not yet linked to" would be relying on obscurity.
create policy "wire_items: editorial read"
  on public.wire_items for select to authenticated
  using (app.is_editorial());

create policy "wire_items: editorial update"
  on public.wire_items for update to authenticated
  using (app.is_editorial()) with check (app.is_editorial());

create policy "wire_items: admins delete"
  on public.wire_items for delete to authenticated
  using (app.is_admin());

-- There is deliberately no INSERT policy. Ingestion runs as the service role
-- from a scheduled worker; no signed-in user, editor or otherwise, can inject
-- rows into the wire queue through the API and have them appear to have come
-- off a licensed feed.
