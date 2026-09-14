-- The learning loop: what gets recorded, and the labels the engine learns from.
--
-- Design: "The India Front Learning Loop", 14 September 2026. In short:
--   event_snapshots   an event's signals every time its evidence changes and
--                     at least hourly, plus at each decision, so a fit can use
--                     what the engine saw when it decided, not what it sees now
--   desk_decisions    every triage, write, duplicate, stale and hold decision
--   article_reviews   a company member's verdict on a published story
--   event_reviews     a member's verdict on a story the engine chose not to write
--   missed_samples    the daily sample those verdicts are drawn from
--   model_versions    every fit of the weights, with its evaluation, promoted or not
--   event_outcomes    widened: outlet follow-through at +4h and +24h for every
--                     event, reviewer and missed verdicts, each with a weight
--
-- Nothing here changes what the desk does today. The tables fill; the daily
-- fit reads them; a fit is promoted only when it beats the live weights.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
insert into public.site_settings (key, value, description) values
  ('engine_snapshot_retention_days', '14'::jsonb, 'Days of event_snapshots kept. About 15 MB a day at current volume.'),
  ('engine_fast_lane_threshold', '0.5'::jsonb, 'Probability of becoming a big story above which an event gets an immediate corroboration search and triage at the beat threshold.'),
  ('engine_timing_write_now', '0.7'::jsonb, 'Probability of big above which the desk writes as soon as the verification gate is met.'),
  ('engine_timing_wait_minutes', '20'::jsonb, 'For events between the fast-lane and write-now probabilities, minutes to wait after the second independent outlet before writing.'),
  ('engine_missed_sample_top', '10'::jsonb, 'Highest-scoring unwritten events per day put in front of reviewers.'),
  ('engine_missed_sample_random', '5'::jsonb, 'Random unwritten events scoring 6 to 10 per day put in front of reviewers.'),
  ('engine_second_review_every', '7'::jsonb, 'One published story in this many is reviewed by two people, so agreement can be measured.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Weights: anchors, and the momentum signal the earliness model will feed
-- ---------------------------------------------------------------------------
alter table public.signal_weights add column if not exists anchor numeric;
update public.signal_weights set anchor = mean where anchor is null;

insert into public.signal_weights (feature, mean, variance, observations, anchor)
values ('momentum', 0.5, 0.15, 0, 0.5)
on conflict (feature) do nothing;

comment on column public.signal_weights.anchor is
  'The fitted value the daily fit is regularised towards and clamped around (a quarter to four times). Set once from the labelled harness; changed only by hand.';

-- ---------------------------------------------------------------------------
-- Events: the earliness probability and the timing rule''s clock
-- ---------------------------------------------------------------------------
alter table public.story_events
  add column if not exists p_big numeric,
  add column if not exists p_big_at timestamptz,
  add column if not exists fast_lane_at timestamptz,
  add column if not exists second_source_at timestamptz;

comment on column public.story_events.p_big is 'Probability, from the earliness model, that this event reaches five independent outlets within six hours.';
comment on column public.story_events.second_source_at is 'When the second independent outlet arrived; the timing rule counts its wait from here.';

-- ---------------------------------------------------------------------------
-- Outcomes: more label sources, each weighted
-- ---------------------------------------------------------------------------
alter table public.event_outcomes drop constraint if exists event_outcomes_source_valid;
alter table public.event_outcomes add constraint event_outcomes_source_valid
  check (label_source in ('editor', 'reader', 'outlet', 'outlet_4h', 'outlet_24h', 'reviewer', 'missed'));
alter table public.event_outcomes add column if not exists weight numeric not null default 1;
alter table public.event_outcomes add column if not exists details jsonb;

create unique index if not exists event_outcomes_one_per_window
  on public.event_outcomes (event_id, label_source)
  where label_source in ('outlet_4h', 'outlet_24h', 'missed');

-- ---------------------------------------------------------------------------
-- Snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.event_snapshots (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.story_events(id) on delete cascade,
  at timestamptz not null default now(),
  trigger text not null check (trigger in ('change', 'hourly', 'triage', 'write', 'fast_lane')),
  score numeric,
  features jsonb,
  mention_count integer,
  source_count integer,
  independent_sources numeric,
  p_big numeric
);
create index if not exists event_snapshots_event_at_idx on public.event_snapshots (event_id, at desc);
create index if not exists event_snapshots_at_idx on public.event_snapshots (at);

alter table public.event_snapshots enable row level security;
drop policy if exists "event_snapshots: editorial read" on public.event_snapshots;
create policy "event_snapshots: editorial read" on public.event_snapshots
  for select to authenticated using (app.is_editorial());

-- On every scoring pass (once a minute) the score changes a little for every
-- live event. A snapshot is taken only when the evidence moved — the mention
-- count differs from the last snapshot — or an hour has passed. Finer than a
-- minute when a story moves, silent when nothing does.
create or replace function app.snapshot_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_count integer;
  v_last_at timestamptz;
begin
  if new.status not in ('candidate', 'newsworthy', 'writing') then
    return new;
  end if;
  select mention_count, at into v_last_count, v_last_at
    from public.event_snapshots
   where event_id = new.id
   order by at desc
   limit 1;
  if v_last_at is null
     or v_last_count is distinct from new.mention_count
     or v_last_at < now() - interval '60 minutes' then
    insert into public.event_snapshots
      (event_id, trigger, score, features, mention_count, source_count, independent_sources, p_big)
    values
      (new.id,
       case when v_last_at is null or v_last_count is distinct from new.mention_count then 'change' else 'hourly' end,
       new.score, new.score_breakdown->'features', new.mention_count, new.source_count,
       new.independent_sources, new.p_big);
  end if;
  return new;
end;
$$;

drop trigger if exists story_events_snapshot on public.story_events;
create trigger story_events_snapshot
  after update of score on public.story_events
  for each row
  when (old.score is distinct from new.score)
  execute function app.snapshot_event_change();

-- A snapshot at a decision, taken by the code that decides.
create or replace function public.engine_snapshot(p_event_id uuid, p_trigger text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.event_snapshots
    (event_id, trigger, score, features, mention_count, source_count, independent_sources, p_big)
  select e.id, p_trigger, e.score, e.score_breakdown->'features', e.mention_count, e.source_count,
         e.independent_sources, e.p_big
    from public.story_events e
   where e.id = p_event_id;
$$;
revoke all on function public.engine_snapshot(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Decisions
-- ---------------------------------------------------------------------------
create table if not exists public.desk_decisions (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.story_events(id) on delete cascade,
  decided_at timestamptz not null default now(),
  kind text not null check (kind in (
    'triage_accept', 'triage_reject', 'triage_excluded', 'triage_failed',
    'fast_lane', 'timing_wait', 'write_start', 'duplicate', 'stale', 'held',
    'write_failed', 'written'
  )),
  score numeric,
  rank integer,
  reason text,
  model_version integer,
  details jsonb
);
create index if not exists desk_decisions_event_idx on public.desk_decisions (event_id);
create index if not exists desk_decisions_at_idx on public.desk_decisions (decided_at desc);

alter table public.desk_decisions enable row level security;
drop policy if exists "desk_decisions: editorial read" on public.desk_decisions;
create policy "desk_decisions: editorial read" on public.desk_decisions
  for select to authenticated using (app.is_editorial());

-- ---------------------------------------------------------------------------
-- Model versions
-- ---------------------------------------------------------------------------
create table if not exists public.model_versions (
  id integer generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('selection', 'earliness')),
  weights jsonb not null,
  metrics jsonb not null default '{}'::jsonb,
  examples integer,
  promoted boolean not null default false,
  notes text
);
create index if not exists model_versions_kind_idx on public.model_versions (kind, created_at desc);

alter table public.model_versions enable row level security;
drop policy if exists "model_versions: editorial read" on public.model_versions;
create policy "model_versions: editorial read" on public.model_versions
  for select to authenticated using (app.is_editorial());

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
create or replace function app.can_review()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_role('reviewer') or app.is_editorial();
$$;
grant execute on function app.can_review() to authenticated;

create table if not exists public.article_reviews (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  event_id uuid references public.story_events(id) on delete set null,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  importance smallint not null check (importance between 1 and 5),
  timing text not null check (timing in ('early', 'on_time', 'late', 'stale')),
  quality smallint not null check (quality between 1 and 5),
  issues text[] not null default '{}'::text[]
    check (issues <@ array['wrong_facts', 'missing_context', 'wrong_picture', 'wrong_section', 'duplicate',
                           'weak_headline', 'not_news', 'reads_like_pr', 'poor_writing', 'too_short', 'too_long']::text[]),
  better_section_id uuid references public.categories(id) on delete set null,
  would_not_run boolean not null default false,
  seconds_spent integer,
  device text,
  created_at timestamptz not null default now(),
  unique (article_id, reviewer_id)
);
create index if not exists article_reviews_article_idx on public.article_reviews (article_id);
create index if not exists article_reviews_reviewer_idx on public.article_reviews (reviewer_id, created_at desc);

alter table public.article_reviews enable row level security;
drop policy if exists "article_reviews: reviewer insert own" on public.article_reviews;
create policy "article_reviews: reviewer insert own" on public.article_reviews
  for insert to authenticated
  with check (reviewer_id = (select auth.uid()) and app.can_review());
drop policy if exists "article_reviews: read own or editorial" on public.article_reviews;
create policy "article_reviews: read own or editorial" on public.article_reviews
  for select to authenticated
  using (reviewer_id = (select auth.uid()) or app.is_editorial());

create table if not exists public.event_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.story_events(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  should_have_written boolean not null,
  importance smallint check (importance between 1 and 5),
  seconds_spent integer,
  created_at timestamptz not null default now(),
  unique (event_id, reviewer_id)
);
create index if not exists event_reviews_event_idx on public.event_reviews (event_id);

alter table public.event_reviews enable row level security;
drop policy if exists "event_reviews: reviewer insert own" on public.event_reviews;
create policy "event_reviews: reviewer insert own" on public.event_reviews
  for insert to authenticated
  with check (reviewer_id = (select auth.uid()) and app.can_review());
drop policy if exists "event_reviews: read own or editorial" on public.event_reviews;
create policy "event_reviews: read own or editorial" on public.event_reviews
  for select to authenticated
  using (reviewer_id = (select auth.uid()) or app.is_editorial());

create table if not exists public.missed_samples (
  event_id uuid primary key references public.story_events(id) on delete cascade,
  sample_date date not null,
  reason text not null check (reason in ('top', 'random')),
  score numeric,
  created_at timestamptz not null default now()
);
create index if not exists missed_samples_date_idx on public.missed_samples (sample_date desc);

alter table public.missed_samples enable row level security;
drop policy if exists "missed_samples: reviewers read" on public.missed_samples;
create policy "missed_samples: reviewers read" on public.missed_samples
  for select to authenticated using (app.can_review());

-- ---------------------------------------------------------------------------
-- A review becomes a label
-- ---------------------------------------------------------------------------
-- Importance 1..5 maps to 0..1; "would not have run" is a 0 at triple weight.
-- A reviewer's verdict weighs twice an automatic label: it is the paper's own
-- judgement, and there will be far fewer of them.
create or replace function app.label_from_article_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid;
  v_features jsonb;
begin
  v_event := new.event_id;
  if v_event is null then
    select id into v_event from public.story_events where article_id = new.article_id limit 1;
  end if;
  if v_event is null then
    return new;
  end if;
  select coalesce(
           (select s.features from public.event_snapshots s where s.event_id = v_event and s.trigger = 'write' order by s.at desc limit 1),
           (select e.score_breakdown->'features' from public.story_events e where e.id = v_event))
    into v_features;
  insert into public.event_outcomes (event_id, label_source, label, features, weight, applied, details)
  values (v_event, 'reviewer',
          case when new.would_not_run then 0 else (new.importance - 1) / 4.0 end,
          v_features,
          case when new.would_not_run then 3 else 2 end,
          true,
          jsonb_build_object('reviewer_id', new.reviewer_id, 'review_id', new.id,
                             'timing', new.timing, 'quality', new.quality, 'issues', new.issues));
  return new;
end;
$$;

drop trigger if exists article_reviews_label on public.article_reviews;
create trigger article_reviews_label
  after insert on public.article_reviews
  for each row execute function app.label_from_article_review();

-- A missed-story verdict: "should have written" carries the importance; "no"
-- is a 0. These are the only labels the engine ever gets about what it skipped.
create or replace function app.label_from_event_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_features jsonb;
begin
  select coalesce(
           (select s.features from public.event_snapshots s where s.event_id = new.event_id order by s.score desc nulls last limit 1),
           (select e.score_breakdown->'features' from public.story_events e where e.id = new.event_id))
    into v_features;
  insert into public.event_outcomes (event_id, label_source, label, features, weight, applied, details)
  values (new.event_id, 'missed',
          case when new.should_have_written then coalesce((new.importance - 1) / 4.0, 0.75) else 0 end,
          v_features, 2, true,
          jsonb_build_object('reviewer_id', new.reviewer_id, 'review_id', new.id))
  on conflict (event_id, label_source) where label_source in ('outlet_4h', 'outlet_24h', 'missed')
  do update set label = (public.event_outcomes.label + excluded.label) / 2,
                details = public.event_outcomes.details || jsonb_build_object('reviews', coalesce((public.event_outcomes.details->>'reviews')::int, 1) + 1);
  return new;
end;
$$;

drop trigger if exists event_reviews_label on public.event_reviews;
create trigger event_reviews_label
  after insert on public.event_reviews
  for each row execute function app.label_from_event_review();

-- ---------------------------------------------------------------------------
-- Outlet follow-through, for every event
-- ---------------------------------------------------------------------------
-- How many independent outlets (canonical hosts) were on the event p_hours
-- after its first report. Zero others is 0; eight or more is 1; log-shaped
-- between, because the second outlet matters more than the seventh. Computed
-- for written and unwritten events alike: a story the desk skipped that eight
-- outlets carried by evening is exactly the miss the fit must see.
create or replace function public.engine_harvest_outlet_outcomes(p_hours integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text := 'outlet_' || p_hours || 'h';
  v_inserted integer;
begin
  with due as (
    select e.id, e.first_seen_at
      from public.story_events e
     where e.first_seen_at <= now() - make_interval(hours => p_hours)
       and e.first_seen_at >  now() - make_interval(hours => p_hours) - interval '12 hours'
       and not exists (select 1 from public.event_outcomes o where o.event_id = e.id and o.label_source = v_source)
  ),
  counted as (
    select d.id,
           (select count(distinct m.source_key) from public.signal_mentions m
             where m.event_id = d.id and m.observed_at <= d.first_seen_at + make_interval(hours => p_hours)) as outlets
      from due d
  ),
  featured as (
    select c.id, c.outlets,
           coalesce(
             (select s.features from public.event_snapshots s where s.event_id = c.id and s.trigger in ('triage', 'write') order by s.at desc limit 1),
             (select s.features from public.event_snapshots s where s.event_id = c.id order by s.score desc nulls last limit 1),
             (select e.score_breakdown->'features' from public.story_events e where e.id = c.id)) as features
      from counted c
  ),
  ins as (
    insert into public.event_outcomes (event_id, label_source, label, features, weight, applied, details)
    select f.id, v_source,
           least(1, ln(greatest(f.outlets, 1)) / ln(8)),
           f.features, 1, true,
           jsonb_build_object('outlets', f.outlets)
      from featured f
     where f.features is not null
    on conflict do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;
  return v_inserted;
end;
$$;
revoke all on function public.engine_harvest_outlet_outcomes(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The daily missed-story sample
-- ---------------------------------------------------------------------------
create or replace function public.engine_build_missed_sample(p_date date default (current_date - 1))
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_top integer := coalesce((select (value)::int from public.site_settings where key = 'engine_missed_sample_top'), 10);
  v_random integer := coalesce((select (value)::int from public.site_settings where key = 'engine_missed_sample_random'), 5);
  v_inserted integer;
begin
  with pool as (
    select e.id,
           greatest(e.score, coalesce((select max(s.score) from public.event_snapshots s where s.event_id = e.id), 0)) as peak
      from public.story_events e
     where e.first_seen_at >= p_date::timestamptz
       and e.first_seen_at <  (p_date + 1)::timestamptz
       and e.article_id is null
       and e.status <> 'written'
       and not exists (select 1 from public.missed_samples ms where ms.event_id = e.id)
  ),
  top as (
    select id, peak, 'top'::text as reason from pool order by peak desc limit v_top
  ),
  random_pick as (
    select id, peak, 'random'::text as reason from pool
     where peak between 6 and 10 and id not in (select id from top)
     order by random() limit v_random
  ),
  ins as (
    insert into public.missed_samples (event_id, sample_date, reason, score)
    select id, p_date, reason, peak from top
    union all
    select id, p_date, reason, peak from random_pick
    on conflict do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;
  return v_inserted;
end;
$$;
revoke all on function public.engine_build_missed_sample(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Queues for the review pages. Security definer so the count of reviews on a
-- story is complete (reviewers can only read their own rows), while the
-- caller is still identified by auth.uid().
-- ---------------------------------------------------------------------------
create or replace function public.engine_review_queue(p_limit integer default 50)
returns table (
  article_id uuid,
  slug text,
  headline text,
  standfirst text,
  category_slug text,
  category_name text,
  published_at timestamptz,
  event_id uuid,
  reviews integer,
  needed integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as uid),
  every as (select coalesce((select (value)::int from public.site_settings where key = 'engine_second_review_every'), 7) as n)
  select a.id, a.slug, a.headline, a.standfirst, c.slug, c.name, a.published_at,
         (select e.id from public.story_events e where e.article_id = a.id limit 1) as event_id,
         (select count(*)::int from public.article_reviews r where r.article_id = a.id) as reviews,
         1 + case when abs(hashtext(a.id::text)) % (select n from every) = 0 then 1 else 0 end as needed
    from public.articles a
    join public.categories c on c.id = a.category_id
   where app.can_review()
     and a.ai_assisted
     and a.status in ('published', 'scheduled')
     and a.published_at <= now()
     and a.published_at > now() - interval '3 days'
     and not exists (select 1 from public.article_reviews r, me where r.article_id = a.id and r.reviewer_id = me.uid)
     and (select count(*) from public.article_reviews r where r.article_id = a.id)
         < 1 + case when abs(hashtext(a.id::text)) % (select n from every) = 0 then 1 else 0 end
   order by (select count(*) from public.article_reviews r where r.article_id = a.id) asc, a.published_at desc
   limit greatest(p_limit, 1);
$$;
grant execute on function public.engine_review_queue(integer) to authenticated;

create or replace function public.engine_missed_queue(p_limit integer default 30)
returns table (
  event_id uuid,
  title text,
  sample_date date,
  reason text,
  score numeric,
  first_seen_at timestamptz,
  source_count integer,
  triage_reason text,
  outlets text[],
  headlines text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as uid)
  select e.id, e.title, ms.sample_date, ms.reason, ms.score, e.first_seen_at, e.source_count, e.triage_reason,
         (select array_agg(distinct m.source_key) from public.signal_mentions m where m.event_id = e.id) as outlets,
         (select array_agg(m.title order by m.observed_at) from (select title, observed_at from public.signal_mentions where event_id = e.id order by observed_at limit 4) m) as headlines
    from public.missed_samples ms
    join public.story_events e on e.id = ms.event_id
   where app.can_review()
     and ms.sample_date > current_date - 4
     and not exists (select 1 from public.event_reviews r, me where r.event_id = e.id and r.reviewer_id = me.uid)
   order by ms.sample_date desc, ms.score desc
   limit greatest(p_limit, 1);
$$;
grant execute on function public.engine_missed_queue(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Reviewer statistics for the Learning page: throughput, leniency, agreement
-- ---------------------------------------------------------------------------
create or replace function public.engine_reviewer_stats()
returns table (
  reviewer_id uuid,
  email text,
  reviews integer,
  missed_reviews integer,
  avg_importance numeric,
  avg_quality numeric,
  would_not_run_share numeric,
  median_seconds numeric,
  leniency numeric,
  agreement_pairs integer,
  agreement_share numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with all_reviews as (
    select r.reviewer_id, r.article_id, r.importance, r.quality, r.would_not_run, r.seconds_spent
      from public.article_reviews r
  ),
  global as (select avg(importance) as mean_importance from all_reviews),
  pairs as (
    -- Every pair of reviewers on the same story. Agreement: importance within one point.
    select a.reviewer_id, (abs(a.importance - b.importance) <= 1) as agreed
      from all_reviews a join all_reviews b on b.article_id = a.article_id and b.reviewer_id <> a.reviewer_id
  )
  select u.id, u.email::text,
         (select count(*)::int from all_reviews r where r.reviewer_id = u.id),
         (select count(*)::int from public.event_reviews r where r.reviewer_id = u.id),
         (select round(avg(importance)::numeric, 2) from all_reviews r where r.reviewer_id = u.id),
         (select round(avg(quality)::numeric, 2) from all_reviews r where r.reviewer_id = u.id),
         (select round(avg(case when would_not_run then 1 else 0 end)::numeric, 3) from all_reviews r where r.reviewer_id = u.id),
         (select round(percentile_cont(0.5) within group (order by seconds_spent)::numeric) from all_reviews r where r.reviewer_id = u.id and seconds_spent is not null),
         (select round((avg(importance) - (select mean_importance from global))::numeric, 2) from all_reviews r where r.reviewer_id = u.id),
         (select count(*)::int from pairs p where p.reviewer_id = u.id),
         (select round(avg(case when agreed then 1 else 0 end)::numeric, 2) from pairs p where p.reviewer_id = u.id)
    from auth.users u
   where app.is_editorial()
     and (exists (select 1 from all_reviews r where r.reviewer_id = u.id)
          or exists (select 1 from public.event_reviews r where r.reviewer_id = u.id))
   order by 3 desc;
$$;
grant execute on function public.engine_reviewer_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- The daily ledger
-- ---------------------------------------------------------------------------
create or replace function public.engine_learning_ledger(p_days integer default 14)
returns table (
  day date,
  written integer,
  reviewed integer,
  importance_high_share numeric,
  would_not_run_share numeric,
  late_share numeric,
  missed_sampled integer,
  missed_should_have_share numeric,
  triage_considered integer,
  triage_accepted integer,
  median_sighting_to_publish_min numeric,
  median_discovery_lag_min numeric,
  outlet_4h_mean numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select generate_series(current_date - greatest(p_days, 1) + 1, current_date, interval '1 day')::date as day
  )
  select d.day,
         (select count(*)::int from public.articles a where a.ai_assisted and a.created_at::date = d.day) as written,
         (select count(distinct r.article_id)::int from public.article_reviews r join public.articles a on a.id = r.article_id where a.created_at::date = d.day) as reviewed,
         (select round(avg(case when r.importance >= 4 then 1 else 0 end)::numeric, 2) from public.article_reviews r join public.articles a on a.id = r.article_id where a.created_at::date = d.day),
         (select round(avg(case when r.would_not_run then 1 else 0 end)::numeric, 3) from public.article_reviews r join public.articles a on a.id = r.article_id where a.created_at::date = d.day),
         (select round(avg(case when r.timing in ('late', 'stale') then 1 else 0 end)::numeric, 2) from public.article_reviews r join public.articles a on a.id = r.article_id where a.created_at::date = d.day),
         (select count(*)::int from public.missed_samples ms where ms.sample_date = d.day),
         (select round(avg(case when er.should_have_written then 1 else 0 end)::numeric, 2) from public.event_reviews er join public.missed_samples ms on ms.event_id = er.event_id where ms.sample_date = d.day),
         (select count(*)::int from public.desk_decisions dd where dd.decided_at::date = d.day and dd.kind in ('triage_accept', 'triage_reject', 'triage_excluded')),
         (select count(*)::int from public.desk_decisions dd where dd.decided_at::date = d.day and dd.kind = 'triage_accept'),
         (select round(percentile_cont(0.5) within group (order by extract(epoch from (a.created_at - e.created_at)) / 60)::numeric)
            from public.articles a join public.story_events e on e.article_id = a.id where a.ai_assisted and a.created_at::date = d.day),
         (select round(percentile_cont(0.5) within group (order by extract(epoch from (e.created_at - fm.first_report)) / 60)::numeric)
            from public.articles a join public.story_events e on e.article_id = a.id
            join lateral (select min(m.observed_at) as first_report from public.signal_mentions m where m.event_id = e.id) fm on true
           where a.ai_assisted and a.created_at::date = d.day and fm.first_report is not null),
         (select round(avg(o.label)::numeric, 3) from public.event_outcomes o join public.story_events e on e.id = o.event_id
           where o.label_source = 'outlet_4h' and e.first_seen_at::date = d.day)
    from days d
   where app.is_editorial()
   order by d.day desc;
$$;
grant execute on function public.engine_learning_ledger(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Schedules
-- ---------------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname in
  ('engine-outlet-outcomes', 'engine-missed-sample', 'prune-learning-tables', 'engine-learn');

select cron.schedule('engine-outlet-outcomes', '5,35 * * * *',
  $$select public.engine_harvest_outlet_outcomes(4), public.engine_harvest_outlet_outcomes(24)$$);

select cron.schedule('engine-missed-sample', '30 0 * * *',
  $$select public.engine_build_missed_sample()$$);

select cron.schedule('prune-learning-tables', '25 3 * * *',
  $$delete from public.event_snapshots where at < now() - make_interval(days => coalesce((select (value)::int from public.site_settings where key = 'engine_snapshot_retention_days'), 14));
    delete from public.desk_decisions where decided_at < now() - interval '90 days'$$);

select cron.schedule('engine-learn', '15 2 * * *',
  $$select app.engine_call('/api/cron/engine-learn', 290000)$$);
