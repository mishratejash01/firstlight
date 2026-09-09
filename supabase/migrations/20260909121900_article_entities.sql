-- Which entities a given article is about, and how centrally.
--
-- The distinction is schema.org's own and it matters for ranking: `about` is
-- the primary subject of the piece, `mentions` is everything else it names.
-- Marking every passing reference as `about` dilutes the signal, which is why
-- the primary set is capped by convention at a handful per article rather than
-- being a free-for-all.

create table public.article_entities (
  article_id uuid not null references public.articles (id) on delete cascade,
  entity_id uuid not null references public.entities (id) on delete cascade,

  -- 'about' -> schema.org about; 'mentions' -> schema.org mentions.
  relation text not null default 'mentions',
  -- Free text describing the entity's part in this story, e.g. 'lead
  -- negotiator'. Rendered as context, not emitted into JSON-LD.
  role_note text,
  -- Set when an AI assist proposed the entity and an editor accepted it, so
  -- suggestion quality can be audited.
  ai_suggested boolean not null default false,
  created_at timestamptz not null default now(),

  primary key (article_id, entity_id),
  constraint article_entities_relation_valid check (relation in ('about', 'mentions'))
);

create index article_entities_entity_idx on public.article_entities (entity_id, article_id);

alter table public.article_entities enable row level security;

create policy "article_entities: anon read"
  on public.article_entities for select to anon
  using (
    exists (
      select 1 from public.articles a
      where a.id = article_id and a.status in ('published', 'scheduled')
        and a.published_at is not null and a.published_at <= now()
    )
  );

create policy "article_entities: read"
  on public.article_entities for select to authenticated
  using (
    app.is_editorial()
    or exists (
      select 1 from public.articles a
      where a.id = article_id and a.status in ('published', 'scheduled')
        and a.published_at is not null and a.published_at <= now()
    )
  );

-- Authors tag entities on their own drafts; editors tag anything.
create policy "article_entities: insert"
  on public.article_entities for insert to authenticated
  with check (
    app.is_editorial()
    or exists (
      select 1 from public.articles a
      where a.id = article_id and a.created_by = (select auth.uid())
        and a.status in ('draft', 'in_review')
    )
  );

create policy "article_entities: delete"
  on public.article_entities for delete to authenticated
  using (
    app.is_editorial()
    or exists (
      select 1 from public.articles a
      where a.id = article_id and a.created_by = (select auth.uid())
        and a.status in ('draft', 'in_review')
    )
  );
