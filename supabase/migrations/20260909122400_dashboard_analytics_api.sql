-- Role-gated read API over the analytics rollups.
--
-- The materialized views cannot carry Row Level Security, so access control
-- lives here instead: every function is SECURITY DEFINER, checks the caller's
-- role as its first statement, and raises rather than returning an empty set
-- when the check fails — an editor seeing zero rows should mean zero rows, not
-- "you are not allowed".
--
-- EXECUTE is revoked from PUBLIC on each one. Postgres grants it by default,
-- which would otherwise make every function here callable by anonymous readers
-- through /rest/v1/rpc/.

-- ---------------------------------------------------------------------------
-- Trending right now. Editor dashboard panel and the front-page ranking input.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_trending(p_limit integer default 20)
returns table (
  article_id uuid,
  headline text,
  category_name text,
  status public.article_status,
  published_at timestamptz,
  views_1h bigint,
  views_24h bigint,
  decayed_score numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_editorial() then
    raise exception 'Editorial role required' using errcode = 'insufficient_privilege';
  end if;

  return query
  select t.article_id, a.headline, c.name, a.status, a.published_at,
         t.views_1h, t.views_24h, t.decayed_score
  from app.trending_articles t
  join public.articles a on a.id = t.article_id
  join public.categories c on c.id = a.category_id
  order by t.decayed_score desc
  limit greatest(p_limit, 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Content performance, sliced by section and window. Powers both the "top this
-- week" and "underperforming this week" panels — same query, opposite sort, so
-- the two panels can never disagree about how a figure was computed.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_content_performance(
  p_days integer default 7,
  p_category_id uuid default null,
  p_order text default 'top',
  p_limit integer default 20
)
returns table (
  article_id uuid,
  headline text,
  category_name text,
  published_at timestamptz,
  sessions bigint,
  completions bigint,
  completion_rate_pct numeric,
  median_drop_off_pct integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_editorial() then
    raise exception 'Editorial role required' using errcode = 'insufficient_privilege';
  end if;

  return query
  select p.article_id, a.headline, c.name, a.published_at,
         p.sessions, p.completions, p.completion_rate_pct, p.median_drop_off_pct
  from app.article_performance p
  join public.articles a on a.id = p.article_id
  join public.categories c on c.id = a.category_id
  where a.published_at is not null
    and a.published_at > now() - make_interval(days => greatest(p_days, 1))
    and (p_category_id is null or a.category_id = p_category_id)
  order by
    -- 'under' surfaces published work that readers are not finishing, which is
    -- the actionable direction: a weak headline, a slow top, a mismatch.
    case when p_order = 'under' then p.completion_rate_pct end asc nulls last,
    case when p_order = 'under' then null else p.sessions end desc nulls last
  limit greatest(p_limit, 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Top entry points: what is bringing new readers in.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_referral_sources(
  p_days integer default 30,
  p_limit integer default 25
)
returns table (
  source text,
  utm_medium text,
  utm_campaign text,
  events bigint,
  actors bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_editorial() then
    raise exception 'Editorial role required' using errcode = 'insufficient_privilege';
  end if;

  return query
  select r.source, r.utm_medium, r.utm_campaign,
         sum(r.events)::bigint, sum(r.actors)::bigint
  from app.referral_sources r
  where r.day > (now() - make_interval(days => greatest(p_days, 1)))::date
  group by r.source, r.utm_medium, r.utm_campaign
  order by 4 desc
  limit greatest(p_limit, 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- What readers looked for and did not find. Commissioning research.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_search_gaps(p_limit integer default 50)
returns table (
  query text,
  searches bigint,
  searchers bigint,
  zero_result_searches bigint,
  last_searched_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_editorial() then
    raise exception 'Editorial role required' using errcode = 'insufficient_privilege';
  end if;

  return query
  select g.query, g.searches, g.searchers, g.zero_result_searches, g.last_searched_at
  from app.search_gaps g
  -- Ordered by unmet demand rather than raw volume: a query nobody can be
  -- served is worth more to an editor than a popular one already covered.
  order by g.zero_result_searches desc, g.searches desc
  limit greatest(p_limit, 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Most-followed topics and authors.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_follow_counts(
  p_target_type text default null,
  p_limit integer default 25
)
returns table (
  target_type text,
  target_id uuid,
  target_name text,
  followers bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_editorial() then
    raise exception 'Editorial role required' using errcode = 'insufficient_privilege';
  end if;

  return query
  select f.target_type, f.target_id,
         coalesce(t.name, au.display_name, c.name, e.title) as target_name,
         f.followers
  from app.follow_counts f
  left join public.tags t        on f.target_type = 'tag'      and t.id  = f.target_id
  left join public.authors au    on f.target_type = 'author'   and au.id = f.target_id
  left join public.categories c  on f.target_type = 'category' and c.id  = f.target_id
  left join public.news_events e on f.target_type = 'event'    and e.id  = f.target_id
  where p_target_type is null or f.target_type = p_target_type
  order by f.followers desc
  limit greatest(p_limit, 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention cohorts. Admin only: it describes the business, not the copy.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_retention(p_days integer default 30)
returns table (
  cohort_day date,
  cohort_size bigint,
  returned_d1 bigint,
  returned_d7 bigint,
  returned_d30 bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Admin role required' using errcode = 'insufficient_privilege';
  end if;

  return query
  select r.cohort_day, r.cohort_size, r.returned_d1, r.returned_d7, r.returned_d30
  from app.retention_cohorts r
  where r.cohort_day > (now() - make_interval(days => greatest(p_days, 1)))::date
  order by r.cohort_day desc;
end;
$$;

-- Lock every accessor down to signed-in callers.
--
-- Revoking from PUBLIC is not sufficient on its own: Supabase's default
-- privileges grant EXECUTE to anon and authenticated explicitly, and an
-- explicit grant survives a revoke aimed at PUBLIC. Both are revoked here, then
-- authenticated is granted back. Without the anon revoke these functions stay
-- callable by anyone holding the publishable key — the role check inside would
-- still refuse them, but an unauthenticated caller should not reach the
-- function body at all.
revoke all on function public.dashboard_trending(integer) from public, anon;
revoke all on function public.dashboard_content_performance(integer, uuid, text, integer) from public, anon;
revoke all on function public.dashboard_referral_sources(integer, integer) from public, anon;
revoke all on function public.dashboard_search_gaps(integer) from public, anon;
revoke all on function public.dashboard_follow_counts(text, integer) from public, anon;
revoke all on function public.dashboard_retention(integer) from public, anon;

grant execute on function public.dashboard_trending(integer) to authenticated;
grant execute on function public.dashboard_content_performance(integer, uuid, text, integer) to authenticated;
grant execute on function public.dashboard_referral_sources(integer, integer) to authenticated;
grant execute on function public.dashboard_search_gaps(integer) to authenticated;
grant execute on function public.dashboard_follow_counts(text, integer) to authenticated;
grant execute on function public.dashboard_retention(integer) to authenticated;
