-- What the country is searching for right now.
--
-- Google Trends is polled for the currently rising search terms, each of which
-- arrives with the news coverage Google has matched to it. That coverage is the
-- point: it turns "people are searching for this" into "people are searching
-- for this, and here is what is being reported about it", which is the
-- difference between a prompt the model must invent around and one it can work
-- from.
--
-- Raw trends are emphatically not all news. A representative sample from one
-- poll: a football fixture, a film's box-office total, and a horoscope. Left
-- unfiltered this table would fill the paper with astrology, so every row is
-- triaged before anything is written from it.

create table public.trending_topics (
  id uuid primary key default extensions.gen_random_uuid(),

  term text not null,
  -- ISO country code the trend was observed in. The same term can trend in one
  -- market and mean nothing in another.
  region text not null default 'IN',

  -- Google reports search volume as a band ('2000+'), not a number.
  approx_traffic text,
  -- Parsed to an integer for ordering and thresholds; null when unparseable.
  traffic_rank integer,

  -- The coverage Google matched to the term: headline, outlet and link. This is
  -- what a generated article is grounded in and attributed to.
  news_items jsonb not null default '[]'::jsonb,

  -- pending    — ingested, not yet triaged
  -- newsworthy — passed triage, eligible to be written about
  -- rejected   — triaged out (not news, or on the excluded list)
  -- written    — an article has been produced from it
  status text not null default 'pending',

  -- Why triage decided what it decided, so a bad call can be understood rather
  -- than guessed at.
  triage_reason text,
  triage_category text,

  article_id uuid references public.articles (id) on delete set null,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  unique (term, region),
  constraint trending_topics_status_valid
    check (status in ('pending', 'newsworthy', 'rejected', 'written'))
);

create index trending_topics_queue_idx
  on public.trending_topics (status, traffic_rank desc nulls last, last_seen_at desc);

alter table public.trending_topics enable row level security;

-- Not public. What the newsroom is considering writing about is not something
-- readers need, and exposing it would advertise coverage before it exists.
create policy "trending_topics: editorial read"
  on public.trending_topics for select to authenticated
  using (app.is_editorial());

create policy "trending_topics: editorial update"
  on public.trending_topics for update to authenticated
  using (app.is_editorial()) with check (app.is_editorial());

create policy "trending_topics: admins delete"
  on public.trending_topics for delete to authenticated
  using (app.is_admin());

-- No insert policy: rows arrive only from the scheduled worker, which runs as
-- the service role.

-- ---------------------------------------------------------------------------
-- Terms the paper will not chase.
--
-- A standing exclusion list, editable without a deploy. Horoscopes, betting
-- odds and lottery numbers trend constantly and reliably; none of them is
-- reporting, and a general news title that starts publishing them has changed
-- what it is.
-- ---------------------------------------------------------------------------
create table public.trend_exclusions (
  id uuid primary key default extensions.gen_random_uuid(),
  pattern text not null unique,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.trend_exclusions enable row level security;

create policy "trend_exclusions: editorial read"
  on public.trend_exclusions for select to authenticated
  using (app.is_editorial());

create policy "trend_exclusions: editorial insert"
  on public.trend_exclusions for insert to authenticated
  with check (app.is_editorial());

create policy "trend_exclusions: editorial delete"
  on public.trend_exclusions for delete to authenticated
  using (app.is_editorial());

insert into public.trend_exclusions (pattern, reason) values
  ('horoscope',      'Astrology is not reporting.'),
  ('rashifal',       'Astrology is not reporting.'),
  ('राशि',            'Astrology is not reporting.'),
  ('kundli',         'Astrology is not reporting.'),
  ('zodiac',         'Astrology is not reporting.'),
  ('lottery',        'Lottery results are a data feed, not a story.'),
  ('lucky number',   'Lottery results are a data feed, not a story.'),
  ('satta',          'Gambling results.'),
  ('betting odds',   'Gambling promotion.'),
  ('bet of the day', 'Gambling promotion.'),
  ('dream11',        'Fantasy sport line-ups are not news.'),
  ('prediction today', 'Fantasy sport line-ups are not news.'),
  ('xxx',            'Adult content.'),
  ('viral video',    'Usually unverifiable and rarely reporting.'),
  ('leaked',         'Usually unverifiable and often an invasion of privacy.')
on conflict (pattern) do nothing;

-- Settings governing the trends pipeline.
insert into public.site_settings (key, value, description) values
  (
    'trending_regions',
    '["IN"]'::jsonb,
    'ISO country codes polled for trending searches. Add more to widen coverage.'
  ),
  (
    'trending_min_traffic',
    '1000'::jsonb,
    'Minimum approximate search volume before a trend is considered at all. Filters the long tail of local noise.'
  ),
  (
    'trending_auto_write',
    'false'::jsonb,
    'When true, trends that pass triage are written up automatically. Off by default.'
  )
on conflict (key) do nothing;
