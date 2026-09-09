-- Widen the reader event log into the single analytics pipeline.
--
-- reading_events is renamed rather than replaced, so the table keeps its
-- lineage, indexes and trigger. There is deliberately ONE event table: the
-- recommendation engine's trending signal, the editorial dashboards and
-- retention segmentation all read from here. Three tables would drift.
--
-- PRIVACY: this table stores no IP address and no user agent string. Device
-- type is coarse ('mobile' | 'tablet' | 'desktop'), the session identifier is
-- client-generated and rotates, and anonymous_id is not linkable to a person
-- without a subsequent sign-in. That is a deliberate ceiling on how much is
-- collected, not an oversight — see the privacy note in docs.

alter table public.reading_events rename to analytics_events;

-- Campaign attribution: how the reader arrived. Needed for "top entry points"
-- in the editor dashboard and for win-back segmentation later.
alter table public.analytics_events add column utm_source text;
alter table public.analytics_events add column utm_medium text;
alter table public.analytics_events add column utm_campaign text;

-- Coarse device class only. Derived server-side from client hints; the raw
-- user agent is never stored.
alter table public.analytics_events add column device_type text;

-- The query string for internal_search events. Doubles as content-gap
-- research: a search with no results is a direct signal of what to commission.
alter table public.analytics_events add column search_query text;

-- True when the row was written by the server on render rather than by client
-- JavaScript. Comparing the two is how we measure what ad blockers hide from
-- us, and page_view is logged server-side precisely so blocking JS cannot
-- blind us completely.
alter table public.analytics_events add column is_server_side boolean not null default false;

alter table public.analytics_events
  add constraint analytics_events_device_type_valid
  check (device_type is null or device_type in ('mobile', 'tablet', 'desktop', 'bot'));

-- Replace the event vocabulary with the full instrumentation set.
alter table public.analytics_events drop constraint reading_events_type_valid;
alter table public.analytics_events
  add constraint analytics_events_type_valid check (
    event_type in (
      -- Reach
      'page_view',          -- logged server-side on every article render
      'user_visited',
      -- Engagement depth. Scroll milestones give a drop-off curve per article,
      -- which is what surfaces "where readers stop reading" to editors.
      'scroll_25',
      'scroll_50',
      'scroll_75',
      'scroll_100',
      'article_complete',
      'article_read',       -- client-confirmed read: dwell plus scroll
      -- Outbound and lateral movement
      'click_related',
      'click_source_link',
      'share',
      -- Retention
      'newsletter_signup',
      'topic_followed',
      'author_followed',
      -- Discovery
      'internal_search',
      'search_performed'
    )
  );

-- Rename the remaining inherited constraint so nothing still says "reading".
alter table public.analytics_events rename constraint reading_events_needs_actor
  to analytics_events_needs_actor;

-- Search-gap reporting reads by query and recency.
create index analytics_events_search_idx
  on public.analytics_events (occurred_at desc)
  where event_type = 'internal_search';

-- Referral breakdown and campaign reporting.
create index analytics_events_utm_idx
  on public.analytics_events (utm_source, occurred_at desc)
  where utm_source is not null;

-- ---------------------------------------------------------------------------
-- Trending counter moves to page_view.
--
-- page_view is written server-side on render, so it survives ad blockers and
-- fires exactly once per request. article_read is client-side and now measures
-- genuine engagement rather than reach, so counting it here would conflate the
-- two and double-count a single visit.
-- ---------------------------------------------------------------------------
create or replace function app.bump_read_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_type = 'page_view' and new.article_id is not null then
    update public.articles
       set read_count = read_count + 1
     where id = new.article_id;
  end if;
  return new;
end;
$$;

alter trigger reading_events_bump_read_count on public.analytics_events
  rename to analytics_events_bump_read_count;

-- Policies carry across a rename; rename them too so nothing still reads
-- "reading_events" in a pg_policies listing.
alter policy "reading_events: public append" on public.analytics_events
  rename to "analytics_events: public append";
alter policy "reading_events: admins read" on public.analytics_events
  rename to "analytics_events: admins read";
