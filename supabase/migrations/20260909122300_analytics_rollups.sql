-- Scheduled analytics rollups.
--
-- Every dashboard figure comes from one of these. Nothing aggregates raw event
-- rows on page load: analytics_events grows without bound, so a live count(*)
-- over it would get slower every day the site succeeds.
--
-- The views live in the private `app` schema, never `public`. A materialized
-- view cannot carry Row Level Security, so a public one would be readable by
-- anyone holding the publishable key. Dashboards reach them through the
-- role-checked accessor functions in the next migration instead.

create extension if not exists pg_cron with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Trending. Feeds both the editor's "trending right now" panel and the
--    trending term of the recommendation ranking — one signal, one definition,
--    so the desk and the algorithm never disagree about what is hot.
-- ---------------------------------------------------------------------------
create materialized view app.trending_articles as
select
  e.article_id,
  count(*) filter (where e.occurred_at > now() - interval '1 hour')  as views_1h,
  count(*) filter (where e.occurred_at > now() - interval '6 hours') as views_6h,
  count(*) filter (where e.occurred_at > now() - interval '24 hours') as views_24h,
  count(*)                                                            as views_48h,
  -- Velocity with a half-life of roughly six hours. A story doing 100 views an
  -- hour right now outranks one that did 1,000 yesterday, which is the whole
  -- point of a news front page.
  round(
    sum(exp(-extract(epoch from (now() - e.occurred_at)) / 21600.0))::numeric,
    3
  ) as decayed_score,
  max(e.occurred_at) as last_seen_at
from public.analytics_events e
where e.event_type = 'page_view'
  and e.article_id is not null
  and e.occurred_at > now() - interval '48 hours'
group by e.article_id;

create unique index trending_articles_pk on app.trending_articles (article_id);

-- ---------------------------------------------------------------------------
-- 2. Per-article performance: completion and the drop-off curve.
--
--    Sessions are counted distinctly, not events, because one reader bouncing
--    a scroll boundary back and forth would otherwise look like engagement.
-- ---------------------------------------------------------------------------
create materialized view app.article_performance as
with sessions as (
  select
    article_id,
    coalesce(user_id::text, anonymous_id, session_id) as actor,
    max(case when event_type = 'scroll_25'  then 1 else 0 end) as r25,
    max(case when event_type = 'scroll_50'  then 1 else 0 end) as r50,
    max(case when event_type = 'scroll_75'  then 1 else 0 end) as r75,
    max(case when event_type = 'scroll_100' then 1 else 0 end) as r100,
    max(case when event_type = 'article_complete' then 1 else 0 end) as completed,
    min(occurred_at) as first_seen
  from public.analytics_events
  where article_id is not null
  group by 1, 2
)
select
  s.article_id,
  a.category_id,
  count(*) as sessions,
  sum(s.r25) as reached_25,
  sum(s.r50) as reached_50,
  sum(s.r75) as reached_75,
  sum(s.r100) as reached_100,
  sum(s.completed) as completions,
  round(100.0 * sum(s.completed) / nullif(count(*), 0), 1) as completion_rate_pct,
  -- The first milestone at which fewer than half the readers who started are
  -- still present. This is the number an editor acts on: it points at the
  -- paragraph where the piece loses people.
  case
    when sum(s.r25)  < count(*) * 0.5 then 25
    when sum(s.r50)  < count(*) * 0.5 then 50
    when sum(s.r75)  < count(*) * 0.5 then 75
    when sum(s.r100) < count(*) * 0.5 then 100
    else null
  end as median_drop_off_pct,
  max(s.first_seen) as last_activity_at
from sessions s
join public.articles a on a.id = s.article_id
group by s.article_id, a.category_id;

create unique index article_performance_pk on app.article_performance (article_id);

-- ---------------------------------------------------------------------------
-- 3. Where readers come from. Referrer host is extracted rather than stored
--    whole so that query strings — which routinely carry identifiers — never
--    reach the dashboard.
-- ---------------------------------------------------------------------------
create materialized view app.referral_sources as
select
  date_trunc('day', occurred_at)::date as day,
  coalesce(
    utm_source,
    nullif(regexp_replace(coalesce(referrer, ''), '^https?://(?:www\.)?([^/?#]+).*$', '\1'), ''),
    'direct'
  ) as source,
  utm_medium,
  utm_campaign,
  count(*) as events,
  count(distinct coalesce(user_id::text, anonymous_id)) as actors
from public.analytics_events
where event_type in ('page_view', 'user_visited')
  and occurred_at > now() - interval '90 days'
group by 1, 2, 3, 4;

create unique index referral_sources_pk
  on app.referral_sources (day, source, coalesce(utm_medium, ''), coalesce(utm_campaign, ''));

-- ---------------------------------------------------------------------------
-- 4. Internal search, i.e. free commissioning research. A query readers repeat
--    that returns nothing is the clearest possible signal of a content gap.
-- ---------------------------------------------------------------------------
create materialized view app.search_gaps as
select
  lower(btrim(search_query)) as query,
  count(*) as searches,
  count(distinct coalesce(user_id::text, anonymous_id)) as searchers,
  -- Recorded by the search handler in properties->>'result_count'.
  sum(case when coalesce((properties->>'result_count')::int, 0) = 0 then 1 else 0 end) as zero_result_searches,
  max(occurred_at) as last_searched_at
from public.analytics_events
where event_type = 'internal_search'
  and search_query is not null
  and btrim(search_query) <> ''
  and occurred_at > now() - interval '90 days'
group by 1;

create unique index search_gaps_pk on app.search_gaps (query);

-- ---------------------------------------------------------------------------
-- 5. Most-followed topics and authors.
-- ---------------------------------------------------------------------------
create materialized view app.follow_counts as
select target_type, target_id, count(*) as followers, max(created_at) as last_followed_at
from public.follows
group by 1, 2;

create unique index follow_counts_pk on app.follow_counts (target_type, target_id);

-- ---------------------------------------------------------------------------
-- 6. Retention cohorts, D1/D7/D30.
--
--    An actor is a signed-in user where one exists and a rotating anonymous id
--    otherwise, so anonymous retention is necessarily understated. That is the
--    honest cost of not fingerprinting readers, and the dashboard says so
--    rather than quietly presenting the number as complete.
-- ---------------------------------------------------------------------------
create materialized view app.retention_cohorts as
with actors as (
  select
    coalesce(user_id::text, anonymous_id) as actor,
    min(occurred_at)::date as cohort_day
  from public.analytics_events
  where occurred_at > now() - interval '180 days'
  group by 1
),
activity as (
  select distinct
    coalesce(user_id::text, anonymous_id) as actor,
    occurred_at::date as active_day
  from public.analytics_events
  where occurred_at > now() - interval '180 days'
)
select
  a.cohort_day,
  count(distinct a.actor) as cohort_size,
  count(distinct act.actor) filter (where act.active_day = a.cohort_day + 1)  as returned_d1,
  count(distinct act.actor) filter (where act.active_day = a.cohort_day + 7)  as returned_d7,
  count(distinct act.actor) filter (where act.active_day = a.cohort_day + 30) as returned_d30
from actors a
left join activity act on act.actor = a.actor
group by a.cohort_day;

create unique index retention_cohorts_pk on app.retention_cohorts (cohort_day);

-- ---------------------------------------------------------------------------
-- Refresh.
--
-- CONCURRENTLY so the dashboard keeps serving the previous snapshot while the
-- new one is built; each view has the unique index that requires.
-- ---------------------------------------------------------------------------
create or replace function app.refresh_analytics_rollups()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently app.trending_articles;
  refresh materialized view concurrently app.article_performance;
  refresh materialized view concurrently app.referral_sources;
  refresh materialized view concurrently app.search_gaps;
  refresh materialized view concurrently app.follow_counts;
  refresh materialized view concurrently app.retention_cohorts;
end;
$$;

-- Trending drives the front page, so it refreshes far more often than the rest.
select cron.schedule(
  'refresh-trending',
  '*/5 * * * *',
  $$refresh materialized view concurrently app.trending_articles$$
);

select cron.schedule(
  'refresh-analytics-rollups',
  '17 * * * *',
  $$select app.refresh_analytics_rollups()$$
);
