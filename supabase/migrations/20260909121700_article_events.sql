-- Article ↔ event hub links.
--
-- The navigational structure that concentrates ranking signal: every
-- sub-development piece points back at its hub, and the hub lists each deeper
-- piece. This is real structure between substantive pages, which is why it is
-- not the thin-page pattern the hub exists to avoid.

create table public.article_events (
  article_id uuid not null references public.articles (id) on delete cascade,
  event_id uuid not null references public.news_events (id) on delete cascade,

  -- primary         — the main explainer or wrap for this event
  -- sub_development — a substantive piece on one strand of it
  -- background      — context published before or beside the event
  relation text not null default 'sub_development',
  position integer not null default 0,
  created_at timestamptz not null default now(),

  primary key (article_id, event_id),
  constraint article_events_relation_valid
    check (relation in ('primary', 'sub_development', 'background'))
);

create index article_events_event_idx on public.article_events (event_id, position);

alter table public.article_events enable row level security;

create policy "article_events: anon read"
  on public.article_events
  for select
  to anon
  using (
    exists (
      select 1 from public.articles a
      where a.id = article_id
        and a.status in ('published', 'scheduled')
        and a.published_at is not null
        and a.published_at <= now()
    )
  );

create policy "article_events: read"
  on public.article_events
  for select
  to authenticated
  using (
    app.is_editorial()
    or exists (
      select 1 from public.articles a
      where a.id = article_id
        and a.status in ('published', 'scheduled')
        and a.published_at is not null
        and a.published_at <= now()
    )
  );

create policy "article_events: editorial insert"
  on public.article_events for insert to authenticated with check (app.is_editorial());
create policy "article_events: editorial update"
  on public.article_events for update to authenticated using (app.is_editorial()) with check (app.is_editorial());
create policy "article_events: editorial delete"
  on public.article_events for delete to authenticated using (app.is_editorial());
