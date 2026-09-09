-- Fetched source articles.
--
-- Google Trends supplies headlines and links, not article text. Writing 400
-- words from a two-sentence headline produces something thin or padded — which
-- is exactly what the first test run produced. This table holds the readable
-- text extracted from the linked pages, so the model has actual material to
-- work from.
--
-- The cache is the point as much as the storage: the same story trends for
-- hours and appears under several terms, and re-fetching a publisher's page
-- every fifteen minutes to read the same article would be both wasteful and
-- rude.
--
-- What is stored is extracted text for the newsroom to read and summarise from,
-- with attribution. It is never published: the articles table takes our own
-- prose, and the licence trigger already refuses wire body copy that is not
-- licensed for reproduction.

create table public.source_documents (
  id uuid primary key default extensions.gen_random_uuid(),

  url text not null unique,
  -- Host is stored separately so per-publisher rate limiting and robots
  -- decisions can be made without re-parsing every URL.
  host text not null,

  title text,
  byline text,
  excerpt text,
  -- Readable body text, plain. Capped by the extractor; long-form pieces are
  -- truncated rather than stored whole.
  content text,
  word_count integer,
  published_at timestamptz,

  -- ok            — fetched and extracted
  -- blocked       — robots.txt disallows it
  -- failed        — network, timeout, or non-200
  -- unextractable — fetched, but no readable article found (paywall, JS-only)
  status text not null default 'ok',
  error text,

  fetched_at timestamptz not null default now(),

  constraint source_documents_status_valid
    check (status in ('ok', 'blocked', 'failed', 'unextractable'))
);

create index source_documents_host_idx on public.source_documents (host, fetched_at desc);
create index source_documents_fetched_idx on public.source_documents (fetched_at desc);

alter table public.source_documents enable row level security;

-- Editorial only. This is other publishers' text held for reference; there is
-- no reader-facing reason to expose it, and every reason not to.
create policy "source_documents: editorial read"
  on public.source_documents for select to authenticated
  using (app.is_editorial());

create policy "source_documents: admins delete"
  on public.source_documents for delete to authenticated
  using (app.is_admin());

-- No insert or update policy: written only by the fetcher, as the service role.

-- ---------------------------------------------------------------------------
-- robots.txt decisions, cached per host.
--
-- Fetching robots.txt before every article would triple the request count. It
-- changes rarely, so it is cached and re-checked daily.
-- ---------------------------------------------------------------------------
create table public.robots_cache (
  host text primary key,
  -- The raw rules that applied to our user agent, kept so a surprising block
  -- can be understood rather than guessed at.
  rules jsonb not null default '[]'::jsonb,
  crawl_delay_seconds numeric,
  fetched_at timestamptz not null default now(),
  fetch_failed boolean not null default false
);

alter table public.robots_cache enable row level security;

create policy "robots_cache: editorial read"
  on public.robots_cache for select to authenticated
  using (app.is_editorial());

insert into public.site_settings (key, value, description) values
  (
    'source_fetch_enabled',
    'true'::jsonb,
    'Whether linked source articles are fetched and read before writing. With this off the model has only headlines, which produces thin copy.'
  ),
  (
    'source_fetch_max_per_trend',
    '3'::jsonb,
    'How many linked articles to read per trend. More material means a better piece and more requests to other publishers.'
  )
on conflict (key) do nothing;
