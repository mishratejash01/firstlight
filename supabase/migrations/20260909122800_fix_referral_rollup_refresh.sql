-- Make app.referral_sources refreshable concurrently.
--
-- REFRESH MATERIALIZED VIEW CONCURRENTLY requires a unique index over plain
-- columns; the original index was built over coalesce() expressions, which does
-- not qualify. Because the refresh function runs every view in one transaction,
-- that single failure rolled back the refreshes that had already succeeded —
-- so trending and article performance silently stayed stale too. One broken
-- index was quietly disabling the entire analytics pipeline.
--
-- The fix moves the coalescing into the view, so the grouping columns are
-- non-null in the stored result and the index can be a plain column index.
-- Absent UTM values become '' rather than NULL; the reader function converts
-- them back so callers still see NULL.

drop materialized view if exists app.referral_sources;

create materialized view app.referral_sources as
select
  date_trunc('day', occurred_at)::date as day,
  coalesce(
    utm_source,
    nullif(regexp_replace(coalesce(referrer, ''), '^https?://(?:www\.)?([^/?#]+).*$', '\1'), ''),
    'direct'
  ) as source,
  coalesce(utm_medium, '') as utm_medium,
  coalesce(utm_campaign, '') as utm_campaign,
  count(*) as events,
  count(distinct coalesce(user_id::text, anonymous_id)) as actors
from public.analytics_events
where event_type in ('page_view', 'user_visited')
  and occurred_at > now() - interval '90 days'
group by 1, 2, 3, 4;

create unique index referral_sources_pk
  on app.referral_sources (day, source, utm_medium, utm_campaign);

-- Restore NULL semantics at the boundary so the dashboard renders a dash for
-- "no campaign" rather than an empty cell that looks like a rendering bug.
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
  select r.source, nullif(r.utm_medium, ''), nullif(r.utm_campaign, ''),
         sum(r.events)::bigint, sum(r.actors)::bigint
  from app.referral_sources r
  where r.day > (now() - make_interval(days => greatest(p_days, 1)))::date
  group by r.source, r.utm_medium, r.utm_campaign
  -- Ordered by views, not distinct readers. Consent-free page views carry no
  -- identifier at all, so the reader count is 0 for most traffic and sorting by
  -- it would rank the busiest sources last.
  order by 4 desc
  limit greatest(p_limit, 1);
end;
$$;

revoke all on function public.dashboard_referral_sources(integer, integer) from public, anon;
grant execute on function public.dashboard_referral_sources(integer, integer) to authenticated;

-- Refresh each view independently so one failure can no longer roll back the
-- others. A view that cannot refresh is reported and the rest still update.
create or replace function app.refresh_analytics_rollups()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  view_name text;
begin
  foreach view_name in array array[
    'app.trending_articles',
    'app.article_performance',
    'app.referral_sources',
    'app.search_gaps',
    'app.follow_counts',
    'app.retention_cohorts'
  ] loop
    begin
      execute format('refresh materialized view concurrently %s', view_name);
    exception when others then
      raise warning 'Could not refresh %: %', view_name, sqlerrm;
    end;
  end loop;
end;
$$;
