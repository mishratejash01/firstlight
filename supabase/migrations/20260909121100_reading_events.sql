-- Behavioural event log.
--
-- One append-only table for every reader signal, shaped so it can be exported
-- to a marketing automation tool later without reshaping: a type, an actor, a
-- subject, a timestamp, and a free-form properties bag.
--
-- Write-only from the public's point of view. Readers can append events but
-- cannot read the log back, so it never becomes a way to profile other people.

create table public.reading_events (
  id bigint primary key generated always as identity,

  event_type text not null,

  -- The subject of the event. Which of these is populated depends on the type:
  -- article_read sets article_id, topic_followed sets tag_id, and so on.
  article_id uuid references public.articles (id) on delete cascade,
  category_id uuid references public.categories (id) on delete cascade,
  tag_id uuid references public.tags (id) on delete cascade,
  author_id uuid references public.authors (id) on delete cascade,

  -- The actor. Signed-in readers get user_id; everyone else gets a
  -- client-generated anonymous_id so a session can be stitched together
  -- without identifying anybody.
  user_id uuid references auth.users (id) on delete set null,
  anonymous_id text,
  session_id text,

  path text,
  referrer text,
  properties jsonb not null default '{}'::jsonb,

  occurred_at timestamptz not null default now(),

  constraint reading_events_type_valid check (
    event_type in (
      'article_read',
      'user_visited',
      'topic_followed',
      'author_followed',
      'newsletter_signup',
      'search_performed'
    )
  ),
  -- Every event needs an actor of some kind, or it cannot be sessionised.
  constraint reading_events_needs_actor check (
    user_id is not null or anonymous_id is not null
  )
);

create index reading_events_occurred_at_idx on public.reading_events (occurred_at desc);
create index reading_events_article_idx
  on public.reading_events (article_id, occurred_at desc)
  where article_id is not null;
create index reading_events_user_idx
  on public.reading_events (user_id, occurred_at desc)
  where user_id is not null;
-- Foreign key covering indexes. This table grows without bound, so an
-- uncovered cascade delete on a tag or author would be a long lock.
create index reading_events_category_idx
  on public.reading_events (category_id)
  where category_id is not null;
create index reading_events_tag_idx
  on public.reading_events (tag_id)
  where tag_id is not null;
create index reading_events_author_idx
  on public.reading_events (author_id)
  where author_id is not null;

alter table public.reading_events enable row level security;

-- Anyone may append. The WITH CHECK stops a caller attributing an event to
-- another account: either it carries their own user_id, or none at all.
create policy "reading_events: public append"
  on public.reading_events
  for insert
  to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- The log is not readable by the people writing to it.
create policy "reading_events: admins read"
  on public.reading_events
  for select
  to authenticated
  using (app.is_admin());

-- ---------------------------------------------------------------------------
-- Trending counter.
--
-- Keeps articles.read_count in step with article_read events. SECURITY DEFINER
-- because the reader inserting the event has no update rights on articles.
--
-- This figure is deliberately approximate — it is client-reported and therefore
-- inflatable. It feeds the trending term of the recommendation ranking and
-- nothing else; anything needing a defensible number should aggregate
-- reading_events directly.
-- ---------------------------------------------------------------------------
create or replace function app.bump_read_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_type = 'article_read' and new.article_id is not null then
    update public.articles
       set read_count = read_count + 1
     where id = new.article_id;
  end if;
  return new;
end;
$$;

create trigger reading_events_bump_read_count
  after insert on public.reading_events
  for each row execute function app.bump_read_count();
