-- Article ↔ tag associations.
--
-- The join that the recommendation query counts over: two articles are related
-- in proportion to the tags they share.

create table public.article_tags (
  article_id uuid not null references public.articles (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  -- Set when the tag came from an AI suggestion an editor accepted, so tag
  -- quality can be audited later.
  ai_suggested boolean not null default false,
  created_at timestamptz not null default now(),

  primary key (article_id, tag_id)
);

-- The forward direction (article -> tags) is served by the primary key; this
-- covers the reverse, which is how tag pages and the recommendation query read.
create index article_tags_tag_id_idx on public.article_tags (tag_id, article_id);

alter table public.article_tags enable row level security;

-- ---------------------------------------------------------------------------
-- Policies. One per role per action; see the articles migration for rationale.
--
-- Tag associations are only public for articles that are themselves public.
-- The visibility test is spelled out rather than leaning on the articles
-- policy, so this stays correct if that one is ever reworded.
-- ---------------------------------------------------------------------------

create policy "article_tags: anon read for published articles"
  on public.article_tags
  for select
  to anon
  using (
    exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.status in ('published', 'scheduled')
        and a.published_at is not null
        and a.published_at <= now()
    )
  );

create policy "article_tags: read"
  on public.article_tags
  for select
  to authenticated
  using (
    app.is_editorial()
    or exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.status in ('published', 'scheduled')
        and a.published_at is not null
        and a.published_at <= now()
    )
  );

-- An author tags their own drafts; editors tag anything.
create policy "article_tags: insert"
  on public.article_tags
  for insert
  to authenticated
  with check (
    app.is_editorial()
    or exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.created_by = (select auth.uid())
        and a.status in ('draft', 'in_review')
    )
  );

create policy "article_tags: delete"
  on public.article_tags
  for delete
  to authenticated
  using (
    app.is_editorial()
    or exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.created_by = (select auth.uid())
        and a.status in ('draft', 'in_review')
    )
  );
