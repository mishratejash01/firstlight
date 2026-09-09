-- Recommendation module.
--
-- Four signals, combined in one query:
--   1. tag similarity  — how much subject matter two articles share
--   2. recency decay   — exponential, so yesterday beats last month
--   3. trending        — live reader interest from the analytics rollup
--   4. editor override — a pinned placement wins outright
--
-- SECURITY DEFINER because it reads app.trending_articles, which is private and
-- unreachable by the anon role. That makes the visibility filter this
-- function's own responsibility rather than RLS's, so the published-status
-- checks below are load-bearing, not belt-and-braces.
--
-- Deliberately a single SQL query rather than a service. At this scale the
-- database already holds every input, and shipping the data elsewhere to rank
-- it would add a network hop, a deployment and a way for the two to disagree.

create or replace function public.related_articles(
  p_article_id uuid,
  p_limit integer default 4
)
returns table (
  id uuid,
  slug text,
  headline text,
  standfirst text,
  hero_image_url text,
  hero_image_alt text,
  published_at timestamptz,
  category_slug text,
  category_name text,
  author_name text,
  author_slug text,
  score numeric
)
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.related_articles(uuid, integer) from public;
grant execute on function public.related_articles(uuid, integer) to anon, authenticated;
