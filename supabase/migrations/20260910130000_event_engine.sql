-- The event engine.
--
-- Everything before this scored *search terms*. That is the wrong unit: a
-- story is not a string people typed, it is an event that several sources are
-- describing in different words. This migration introduces the event as the
-- thing that gets found, scored, verified and written.
--
-- Shape, following the systems that do this at scale (Reuters Tracer, Google
-- News clustering, Event Registry):
--
--   signal_mentions   every observation from every stream, embedded
--   story_events      mentions clustered into events, each carrying a score
--   entity_hourly     compact per-entity rate history for burst detection
--   source_stats      per-source lead authority, measured not seeded
--   source_pairs      co-coverage between sources, for independence weighting
--   signal_weights    the learned scoring weights
--   event_outcomes    the labels the weights are learned from
--
-- Embeddings are 768-dimensional (Gemini, CLUSTERING task type). HNSW rather
-- than IVFFlat: IVFFlat needs a representative sample to build its lists and
-- degrades badly on an empty table that then grows; HNSW builds incrementally.

create extension if not exists vector with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create table public.story_events (
  id uuid primary key default extensions.gen_random_uuid(),

  -- Canonical title: the headline from the highest-authority mention so far.
  title text not null,
  summary text,
  -- Union of entity keys across member mentions. What the event is "about".
  entities text[] not null default '{}',
  -- Running mean of member embeddings. New mentions are matched against this.
  centroid extensions.vector(768),

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  mention_count integer not null default 0,
  -- Distinct sources, and the same figure after discounting for correlation.
  source_count integer not null default 0,
  independent_sources numeric not null default 0,
  -- Which regions the signal came from, e.g. {"IN": 4, "US": 2}.
  region_mix jsonb not null default '{}'::jsonb,

  -- Score components. Each is recomputed on every pulse; the breakdown is kept
  -- so an editor can see why something ranked where it did.
  burst numeric not null default 0,
  surprise numeric not null default 0,
  corroboration numeric not null default 0,
  lead_authority numeric not null default 0,
  acceleration numeric not null default 0,
  magnitude numeric not null default 0,
  relevance numeric not null default 0,
  novelty numeric not null default 1,
  freshness numeric not null default 1,
  score numeric not null default 0,
  score_breakdown jsonb not null default '{}'::jsonb,

  -- candidate   — clustered, not yet judged
  -- newsworthy  — passed triage, eligible for verification and writing
  -- rejected    — triaged out
  -- written     — an article exists
  status text not null default 'candidate',
  triage_reason text,
  triage_category text,

  -- Verification. Severity decides how much corroboration is needed before a
  -- word is written: a death toll is not held to the same bar as a transfer
  -- rumour.
  severity text,
  verification jsonb,

  article_id uuid references public.articles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint story_events_status_valid
    check (status in ('candidate', 'newsworthy', 'rejected', 'written')),
  constraint story_events_severity_valid
    check (severity is null or severity in ('low', 'medium', 'high'))
);

create index story_events_active_idx
  on public.story_events (last_seen_at desc)
  where status in ('candidate', 'newsworthy');
create index story_events_score_idx
  on public.story_events (score desc)
  where status in ('candidate', 'newsworthy');
create index story_events_entities_idx on public.story_events using gin (entities);
-- Nearest-neighbour matching of new mentions against live events.
create index story_events_centroid_idx
  on public.story_events using hnsw (centroid extensions.vector_cosine_ops);

create trigger story_events_set_updated_at
  before update on public.story_events
  for each row execute function app.set_updated_at();

alter table public.story_events enable row level security;

create policy "story_events: editorial read"
  on public.story_events for select to authenticated using (app.is_editorial());
create policy "story_events: editorial update"
  on public.story_events for update to authenticated
  using (app.is_editorial()) with check (app.is_editorial());
create policy "story_events: admins delete"
  on public.story_events for delete to authenticated using (app.is_admin());

-- ---------------------------------------------------------------------------
-- Mentions
-- ---------------------------------------------------------------------------
create table public.signal_mentions (
  id bigint primary key generated always as identity,

  -- trends | gnews | rss | bluesky | wikipedia_views | wikipedia_edits | usgs
  -- | polymarket | hn | reddit | youtube | search
  source_kind text not null,
  -- The specific source within the kind: a host, a handle, a feed.
  source_key text not null,
  external_id text not null,

  title text not null,
  body text,
  url text,
  region text,
  entities text[] not null default '{}',
  -- Source-native intensity, whatever that means for the source: search
  -- volume, upvotes, pageviews, earthquake magnitude. Normalised at scoring.
  magnitude numeric,

  observed_at timestamptz not null default now(),
  event_id uuid references public.story_events (id) on delete set null,
  embedding extensions.vector(768),
  raw jsonb not null default '{}'::jsonb,

  unique (source_kind, external_id),
  constraint signal_mentions_title_not_blank check (length(btrim(title)) > 0)
);

create index signal_mentions_observed_idx on public.signal_mentions (observed_at desc);
create index signal_mentions_event_idx on public.signal_mentions (event_id, observed_at desc);
create index signal_mentions_source_idx on public.signal_mentions (source_key, observed_at desc);
create index signal_mentions_entities_idx on public.signal_mentions using gin (entities);

alter table public.signal_mentions enable row level security;

create policy "signal_mentions: editorial read"
  on public.signal_mentions for select to authenticated using (app.is_editorial());
create policy "signal_mentions: admins delete"
  on public.signal_mentions for delete to authenticated using (app.is_admin());

-- ---------------------------------------------------------------------------
-- Entity rate history, for burst detection.
--
-- One row per entity per source kind per hour. Compact enough to keep for 30
-- days, which is the baseline window; raw mentions are pruned after 7.
-- ---------------------------------------------------------------------------
create table public.entity_hourly (
  entity text not null,
  source_kind text not null,
  hour timestamptz not null,
  mentions integer not null default 0,
  primary key (entity, source_kind, hour)
);

create index entity_hourly_hour_idx on public.entity_hourly (hour desc);

alter table public.entity_hourly enable row level security;
create policy "entity_hourly: editorial read"
  on public.entity_hourly for select to authenticated using (app.is_editorial());

-- ---------------------------------------------------------------------------
-- Source statistics: lead authority, measured.
--
-- The seeded source_authority table says what we *think* of an outlet. This
-- records what it actually does: how often it is among the first to carry a
-- story that others later pick up. A source that is consistently early is
-- worth more as a signal than one that is consistently last, whatever its
-- reputation.
-- ---------------------------------------------------------------------------
create table public.source_stats (
  source_key text primary key,
  source_kind text not null,
  events_seen integer not null default 0,
  -- Times this source was in the first quartile of arrivals on a multi-source
  -- event.
  events_led integer not null default 0,
  -- Exponential moving average of leading, 0..1.
  lead_score numeric not null default 0.25,
  updated_at timestamptz not null default now()
);

alter table public.source_stats enable row level security;
create policy "source_stats: editorial read"
  on public.source_stats for select to authenticated using (app.is_editorial());

-- ---------------------------------------------------------------------------
-- Source co-coverage, for independence weighting.
--
-- Five outlets carrying the same wire copy are one source, not five. This
-- table records, for each ordered pair, how often B covered an event that A
-- covered, within the same window. High co-coverage means B's confirmation is
-- worth little once A has been counted.
-- ---------------------------------------------------------------------------
create table public.source_pairs (
  source_a text not null,
  source_b text not null,
  events_a integer not null default 0,
  events_both integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (source_a, source_b)
);

alter table public.source_pairs enable row level security;
create policy "source_pairs: editorial read"
  on public.source_pairs for select to authenticated using (app.is_editorial());

-- ---------------------------------------------------------------------------
-- Learned weights.
--
-- A Bayesian linear model over the score components: each feature carries a
-- mean and a variance. Scoring samples from the posterior (Thompson sampling),
-- so the engine keeps exploring signals it is unsure about rather than locking
-- onto whatever worked first. Outcomes update the posterior.
-- ---------------------------------------------------------------------------
create table public.signal_weights (
  feature text primary key,
  mean numeric not null,
  variance numeric not null,
  observations integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.signal_weights enable row level security;
create policy "signal_weights: editorial read"
  on public.signal_weights for select to authenticated using (app.is_editorial());
create policy "signal_weights: admins update"
  on public.signal_weights for update to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Priors. These encode the hand-tuned weights the previous engine used, as a
-- starting point the data will move away from. Variance is deliberately wide.
insert into public.signal_weights (feature, mean, variance) values
  ('burst',          1.00, 0.50),
  ('surprise',       0.80, 0.50),
  ('corroboration',  1.20, 0.50),
  ('lead_authority', 1.00, 0.50),
  ('acceleration',   0.60, 0.50),
  ('magnitude',      0.80, 0.50),
  ('relevance',      0.70, 0.50),
  ('novelty',        0.90, 0.50),
  ('freshness',      0.50, 0.50)
on conflict (feature) do nothing;

-- ---------------------------------------------------------------------------
-- Outcomes: the labels.
--
-- Three independent sources of truth about whether the engine chose well:
--   editor   — accepted or rejected on the desk
--   reader   — completion rate once published
--   outlet   — major outlets covered it after we did (we were right and early)
-- Each row snapshots the features at decision time, so the model learns from
-- what it saw, not from what the event later became.
-- ---------------------------------------------------------------------------
create table public.event_outcomes (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null references public.story_events (id) on delete cascade,
  label_source text not null,
  -- 0..1. Editor accept = 1, reject = 0; reader completion rate; outlet
  -- follow-on = 1.
  label numeric not null,
  features jsonb not null,
  created_at timestamptz not null default now(),

  constraint event_outcomes_source_valid
    check (label_source in ('editor', 'reader', 'outlet')),
  constraint event_outcomes_label_range check (label >= 0 and label <= 1)
);

create index event_outcomes_event_idx on public.event_outcomes (event_id);
create index event_outcomes_recent_idx on public.event_outcomes (created_at desc);

alter table public.event_outcomes enable row level security;
create policy "event_outcomes: editorial read"
  on public.event_outcomes for select to authenticated using (app.is_editorial());

-- ---------------------------------------------------------------------------
-- Engine settings.
-- ---------------------------------------------------------------------------
insert into public.site_settings (key, value, description) values
  ('engine_cluster_threshold', '0.80'::jsonb,
   'Cosine similarity above which a new mention joins an existing event. Lower merges more aggressively.'),
  ('engine_event_window_hours', '48'::jsonb,
   'How long an event stays open to new mentions after its last one.'),
  ('engine_min_independent_sources_high', '3'::jsonb,
   'Independent authoritative sources required before writing a high-severity story (deaths, crimes, named accusations).'),
  ('engine_min_independent_sources_medium', '2'::jsonb,
   'Independent sources required for medium-severity stories.'),
  ('engine_exploration', '1.0'::jsonb,
   'Thompson sampling temperature. 0 disables exploration and scores with posterior means only.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Retention. Mentions are working data; the compact hourly table is the
-- history.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'prune-signal-mentions',
  '15 3 * * *',
  $$delete from public.signal_mentions where observed_at < now() - interval '7 days'$$
);
select cron.schedule(
  'prune-entity-hourly',
  '20 3 * * *',
  $$delete from public.entity_hourly where hour < now() - interval '35 days'$$
);
select cron.schedule(
  'close-stale-events',
  '*/30 * * * *',
  $$update public.story_events set status = 'rejected', triage_reason = 'Expired without being written.'
     where status = 'candidate' and last_seen_at < now() - interval '72 hours'$$
);
