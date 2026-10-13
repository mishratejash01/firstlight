-- Case studies: the engine's second format, written by the case desk.
--
-- A case study answers the question people start asking when something
-- happens — how it works, who it affects, what is being done, whether that
-- works — and is kept current rather than written again. It lives in the
-- articles table as format = 'case_study' under its own section, so publishing,
-- caching, feeds and the desk keep working; the writer, the templates and the
-- desk that decides what to write are new (src/lib/engine/case-desk.ts).

-- The section, with its own layout on the front page and the section front.
alter table public.categories drop constraint if exists categories_layout_valid;
alter table public.categories
  add constraint categories_layout_valid
  check (layout in ('standard', 'opinion', 'case_studies'));

insert into public.categories
  (slug, name, description, seo_title, layout, icon_url, sort_order, show_in_nav, is_active)
values (
  'case-studies',
  'Case studies',
  'Explainers built around the question of the moment: how it works, who it affects, what is being done, and whether that works.',
  'Case Studies: How It Works, Explained',
  'case_studies',
  '/icons/case-studies.png',
  27,
  true,
  true
)
on conflict (slug) do update
  set layout = excluded.layout, icon_url = excluded.icon_url, seo_title = excluded.seo_title;

-- The format, the structured block the template renders, the subject (a
-- section slug, deliberately not a foreign key: a second link from articles to
-- categories would make every existing `categories ( … )` embed ambiguous to
-- PostgREST), and when the page was last reviewed.
alter table public.articles
  add column if not exists format text not null default 'story',
  add column if not exists case_study jsonb,
  add column if not exists subject_slug text,
  add column if not exists reviewed_at timestamptz;

alter table public.articles drop constraint if exists articles_format_valid;
alter table public.articles
  add constraint articles_format_valid check (format in ('story', 'case_study'));

create index if not exists articles_case_studies_idx
  on public.articles (published_at desc)
  where format = 'case_study';

-- Every candidate the case desk considered, and its verdict: the record an
-- administrator reads to see why something was or was not written.
create table public.case_candidates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('hot', 'canon', 'admin')),
  story_event_id uuid references public.story_events (id) on delete set null,
  trend_id uuid references public.trending_topics (id) on delete set null,
  question_id uuid,
  title text not null,
  question text,
  subject_slug text,
  verdict text not null check (verdict in ('written', 'updated', 'rejected', 'deferred', 'failed')),
  reasons jsonb not null default '{}'::jsonb,
  viral_score numeric,
  article_id uuid references public.articles (id) on delete set null,
  error text
);

create index case_candidates_created_idx on public.case_candidates (created_at desc);
create index case_candidates_event_idx on public.case_candidates (story_event_id) where story_event_id is not null;
create index case_candidates_trend_idx on public.case_candidates (trend_id) where trend_id is not null;

alter table public.case_candidates enable row level security;

create policy "case_candidates: admin read"
  on public.case_candidates for select to authenticated
  using (app.is_admin());

-- The canon: questions worth a case study whether or not anything is in the
-- news, proposed by the engine or added by an administrator, written one at a
-- time when nothing hot qualifies.
create table public.case_questions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  subject_slug text not null,
  question text not null,
  rationale text,
  demand_score numeric not null default 0,
  status text not null default 'open' check (status in ('open', 'queued', 'written', 'dropped')),
  proposed_by text not null default 'engine' check (proposed_by in ('engine', 'admin')),
  article_id uuid references public.articles (id) on delete set null,
  written_at timestamptz
);

create unique index case_questions_question_key on public.case_questions (lower(question));
create index case_questions_status_idx on public.case_questions (status, demand_score desc);

create trigger case_questions_set_updated_at
  before update on public.case_questions
  for each row execute function app.set_updated_at();

alter table public.case_questions enable row level security;

create policy "case_questions: admin read"
  on public.case_questions for select to authenticated
  using (app.is_admin());

create policy "case_questions: admin insert"
  on public.case_questions for insert to authenticated
  with check (app.is_admin());

create policy "case_questions: admin update"
  on public.case_questions for update to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- The desk's switches, beside the engine's others.
insert into public.site_settings (key, value, description) values
  ('case_studies_enabled', 'true'::jsonb, 'Whether the case desk writes at all.'),
  ('case_studies_daily_cap', '3'::jsonb, 'The most case studies written in a day; updates to existing ones do not count.'),
  ('case_studies_canon_days', '7'::jsonb, 'Days between case studies written from the question bank when nothing in the news qualifies.')
on conflict (key) do nothing;

-- Related coverage on a story page is news; the case study has its own box.
CREATE OR REPLACE FUNCTION public.related_articles(p_article_id uuid, p_limit integer DEFAULT 4)
 RETURNS TABLE(id uuid, slug text, headline text, standfirst text, hero_image_url text, hero_image_alt text, published_at timestamp with time zone, category_slug text, category_name text, author_name text, author_slug text, score numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with source_article as (
    select a.id, a.category_id
    from public.articles a
    where a.id = p_article_id
  ),
  source_tags as (
    select at.tag_id from public.article_tags at where at.article_id = p_article_id
  ),
  -- An editor pinning a story to this article's section overrides ranking
  -- entirely. Judgement beats arithmetic.
  pinned as (
    select hp.article_id
    from public.homepage_placements hp
    join source_article sa on sa.category_id = hp.category_id
    where hp.zone = 'section'
      and hp.starts_at <= now()
      and (hp.expires_at is null or hp.expires_at > now())
  ),
  candidates as (
    select
      a.id, a.slug, a.headline, a.standfirst, a.hero_image_url, a.hero_image_alt,
      a.published_at, a.category_id, a.author_id,
      -- Shared tags, the strongest relatedness signal we have.
      (select count(*) from public.article_tags t
        where t.article_id = a.id and t.tag_id in (select tag_id from source_tags)
      )::numeric as shared_tags,
      -- Same section is a weaker signal than a shared tag, but not nothing.
      (case when a.category_id = (select category_id from source_article) then 1 else 0 end)::numeric as same_section,
      -- Half-life of roughly three days. Related coverage should feel current.
      exp(-extract(epoch from (now() - a.published_at)) / 259200.0)::numeric as recency,
      coalesce(t.decayed_score, 0)::numeric as trending,
      (case when a.id in (select article_id from pinned) then 1 else 0 end)::numeric as is_pinned
    from public.articles a
    left join app.trending_articles t on t.article_id = a.id
    where a.id <> p_article_id
      and a.status in ('published', 'scheduled')
      -- Case studies have their own box on a story page (see the article route).
      and a.format <> 'case_study'
      and a.published_at is not null
      and a.published_at <= now()
  )
  select
    c.id, c.slug, c.headline, c.standfirst, c.hero_image_url, c.hero_image_alt,
    c.published_at, cat.slug, cat.name, au.display_name, au.slug,
    round(
      -- Weights: subject overlap dominates, then editorial pin, then freshness.
      -- Trending is scaled down because it is client-reported and therefore the
      -- least trustworthy of the four.
      c.shared_tags * 10.0
      + c.is_pinned * 25.0
      + c.same_section * 3.0
      + c.recency * 5.0
      + least(c.trending, 50.0) * 0.1,
      3
    ) as score
  from candidates c
  join public.categories cat on cat.id = c.category_id
  left join public.authors au on au.id = c.author_id
  order by score desc, c.published_at desc
  limit greatest(p_limit, 1);
$function$;

-- The desk's lease, so two passes cannot write at once (engine_try_lock only
-- updates a row that exists).
insert into public.engine_locks (name) values ('case-desk') on conflict (name) do nothing;

-- The case desk: every two hours, looking at the last three days of news and
-- the trend feeds, writing at most one case study a pass.
select cron.schedule(
  'engine-case-desk',
  '23 */2 * * *',
  $$select app.engine_call('/api/cron/case-desk', 290000)$$
);
