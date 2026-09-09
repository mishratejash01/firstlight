-- The "Key numbers" block: the specific figures and quotes inside a story.
--
-- Stored as rows rather than left in prose for two reasons. It gives Google a
-- clean, extractable block for a narrow numeric query, and it forces the
-- discipline the SEO brief asks for — you cannot file a key fact without
-- attributing where the figure came from.

create table public.article_key_facts (
  id uuid primary key default extensions.gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,

  -- 'Reported deaths', 'Budget shortfall', 'Turnout'
  label text not null,
  -- '1,240', '£3.2bn', '61%' — kept as text because units and qualifiers
  -- ('at least', 'approximately') are part of the fact.
  value text not null,
  -- Where the figure came from. Required by constraint: an unsourced number is
  -- not a key fact.
  attribution text not null,
  -- Optional entity the fact concerns, so a figure can be pivoted on later.
  entity_id uuid references public.entities (id) on delete set null,

  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint article_key_facts_label_not_blank check (length(btrim(label)) > 0),
  constraint article_key_facts_value_not_blank check (length(btrim(value)) > 0),
  constraint article_key_facts_attribution_not_blank check (length(btrim(attribution)) > 0)
);

create index article_key_facts_article_idx on public.article_key_facts (article_id, position);

create trigger article_key_facts_set_updated_at
  before update on public.article_key_facts
  for each row execute function app.set_updated_at();

alter table public.article_key_facts enable row level security;

create policy "article_key_facts: anon read"
  on public.article_key_facts for select to anon
  using (
    exists (
      select 1 from public.articles a
      where a.id = article_id and a.status in ('published', 'scheduled')
        and a.published_at is not null and a.published_at <= now()
    )
  );

create policy "article_key_facts: read"
  on public.article_key_facts for select to authenticated
  using (
    app.is_editorial()
    or exists (
      select 1 from public.articles a
      where a.id = article_id and a.created_by = (select auth.uid())
    )
    or exists (
      select 1 from public.articles a
      where a.id = article_id and a.status in ('published', 'scheduled')
        and a.published_at is not null and a.published_at <= now()
    )
  );

create policy "article_key_facts: insert"
  on public.article_key_facts for insert to authenticated
  with check (
    app.is_editorial()
    or exists (
      select 1 from public.articles a
      where a.id = article_id and a.created_by = (select auth.uid())
        and a.status in ('draft', 'in_review')
    )
  );

create policy "article_key_facts: update"
  on public.article_key_facts for update to authenticated
  using (
    app.is_editorial()
    or exists (
      select 1 from public.articles a
      where a.id = article_id and a.created_by = (select auth.uid())
        and a.status in ('draft', 'in_review')
    )
  )
  with check (
    app.is_editorial()
    or exists (
      select 1 from public.articles a
      where a.id = article_id and a.created_by = (select auth.uid())
        and a.status in ('draft', 'in_review')
    )
  );

create policy "article_key_facts: delete"
  on public.article_key_facts for delete to authenticated
  using (
    app.is_editorial()
    or exists (
      select 1 from public.articles a
      where a.id = article_id and a.created_by = (select auth.uid())
        and a.status in ('draft', 'in_review')
    )
  );
