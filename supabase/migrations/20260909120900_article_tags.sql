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

-- Tag associations are only public for articles that are themselves public.
-- The visibility test is spelled out rather than leaning on the articles
-- policy, so that this policy stays correct if that one is ever reworded.
create policy "article_tags: public read for published articles"
  on public.article_tags
  for select
  to anon, authenticated
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

create policy "article_tags: editorial read all"
  on public.article_tags
  for select
  to authenticated
  using (app.is_editorial());

-- An author tags their own drafts; editors tag anything.
create policy "article_tags: authors tag own drafts"
  on public.article_tags
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.created_by = (select auth.uid())
        and a.status in ('draft', 'in_review')
    )
  );

create policy "article_tags: authors untag own drafts"
  on public.article_tags
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.created_by = (select auth.uid())
        and a.status in ('draft', 'in_review')
    )
  );

create policy "article_tags: editorial insert"
  on public.article_tags
  for insert
  to authenticated
  with check (app.is_editorial());

create policy "article_tags: editorial delete"
  on public.article_tags
  for delete
  to authenticated
  using (app.is_editorial());
