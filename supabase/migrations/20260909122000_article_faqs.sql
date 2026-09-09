-- Explainer questions attached to an article, emitted as FAQPage structured
-- data and rendered as a sidebar.
--
-- Deliberately optional and deliberately not the default. FAQPage markup on a
-- routine three-paragraph story is noise that invites a manual action; it
-- earns its place only on a major or complex event where readers really are
-- searching the sub-questions separately. The editor UI reflects that: adding
-- FAQs is an explicit choice, never a template that arrives pre-filled.

create table public.article_faqs (
  id uuid primary key default extensions.gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,

  -- Phrased the way a reader would actually type it, not as a section label.
  question text not null,
  answer text not null,
  position integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint article_faqs_question_not_blank check (length(btrim(question)) > 0),
  constraint article_faqs_answer_not_blank check (length(btrim(answer)) > 0)
);

create index article_faqs_article_idx on public.article_faqs (article_id, position);

create trigger article_faqs_set_updated_at
  before update on public.article_faqs
  for each row execute function app.set_updated_at();

alter table public.article_faqs enable row level security;

create policy "article_faqs: anon read"
  on public.article_faqs for select to anon
  using (
    exists (
      select 1 from public.articles a
      where a.id = article_id and a.status in ('published', 'scheduled')
        and a.published_at is not null and a.published_at <= now()
    )
  );

create policy "article_faqs: read"
  on public.article_faqs for select to authenticated
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

create policy "article_faqs: insert"
  on public.article_faqs for insert to authenticated
  with check (
    app.is_editorial()
    or exists (
      select 1 from public.articles a
      where a.id = article_id and a.created_by = (select auth.uid())
        and a.status in ('draft', 'in_review')
    )
  );

create policy "article_faqs: update"
  on public.article_faqs for update to authenticated
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

create policy "article_faqs: delete"
  on public.article_faqs for delete to authenticated
  using (
    app.is_editorial()
    or exists (
      select 1 from public.articles a
      where a.id = article_id and a.created_by = (select auth.uid())
        and a.status in ('draft', 'in_review')
    )
  );
