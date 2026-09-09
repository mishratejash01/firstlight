-- News events: the persistent hub for a developing story.
--
-- One URL per event, updated continuously. This is the deliberate alternative
-- to spinning up a thin new page for every incremental detail, which splits
-- the ranking signal across near-duplicates and risks tripping Google's
-- scaled-content-abuse policy. Substantive sub-developments still get their
-- own article; they are linked to the hub through article_events rather than
-- replacing it.
--
-- Rendered with LiveBlogPosting structured data while is_live is true.

create table public.news_events (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text,

  category_id uuid references public.categories (id) on delete set null,

  -- is_live drives the LiveBlogPosting markup and the "updating" treatment in
  -- the UI. coverage_ends_at is required by that schema type, so it is stored
  -- explicitly rather than inferred: an open-ended live blog is a crawl
  -- liability.
  is_live boolean not null default true,
  coverage_starts_at timestamptz not null default now(),
  coverage_ends_at timestamptz,

  status text not null default 'developing',

  hero_image_url text,
  hero_image_alt text,

  meta_title text,
  meta_description text,

  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint news_events_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint news_events_title_not_blank check (length(btrim(title)) > 0),
  constraint news_events_status_valid check (status in ('draft', 'developing', 'concluded', 'archived')),
  constraint news_events_published_needs_timestamp check (
    status = 'draft' or published_at is not null
  ),
  -- A concluded event is not live, and a live event has not ended.
  constraint news_events_live_coherent check (
    (is_live and coverage_ends_at is null) or (not is_live)
  ),
  constraint news_events_coverage_window check (
    coverage_ends_at is null or coverage_ends_at > coverage_starts_at
  )
);

create index news_events_live_idx
  on public.news_events (published_at desc)
  where status in ('developing', 'concluded');

create trigger news_events_set_updated_at
  before update on public.news_events
  for each row execute function app.set_updated_at();

alter table public.news_events enable row level security;

create policy "news_events: anon read published"
  on public.news_events
  for select
  to anon
  using (
    status in ('developing', 'concluded')
    and published_at is not null
    and published_at <= now()
  );

create policy "news_events: read"
  on public.news_events
  for select
  to authenticated
  using (
    app.is_editorial()
    or (
      status in ('developing', 'concluded')
      and published_at is not null
      and published_at <= now()
    )
  );

create policy "news_events: editorial insert"
  on public.news_events
  for insert
  to authenticated
  with check (app.is_editorial());

create policy "news_events: editorial update"
  on public.news_events
  for update
  to authenticated
  using (app.is_editorial())
  with check (app.is_editorial());

create policy "news_events: admins delete"
  on public.news_events
  for delete
  to authenticated
  using (app.is_admin());
