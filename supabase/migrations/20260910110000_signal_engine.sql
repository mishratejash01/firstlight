-- The discovery engine: scoring candidate stories rather than merely filtering
-- them.
--
-- What existed before was a threshold and a yes/no judgement, which answers
-- "may we write about this?" but not "of everything available right now, what
-- should we write about first?" On a schedule with a daily cap, the second
-- question is the one that decides what the paper looks like.
--
-- Six independent signals, combined into one score:
--
--   volume        how many people are searching for it
--   velocity      whether that number is climbing or already spent
--   corroboration how many distinct outlets are covering it — one outlet with
--                 a story is a claim, five is an event
--   authority     who those outlets are; a wire service is not a content farm
--   demand        whether our own readers searched for it and found nothing
--   freshness     how long it has been sitting there
--
-- minus a saturation penalty, so the front page does not become five versions
-- of the same story.

alter table public.trending_topics add column previous_traffic_rank integer;
alter table public.trending_topics add column velocity numeric;
alter table public.trending_topics add column corroboration integer not null default 0;
alter table public.trending_topics add column authority_score numeric not null default 0;
alter table public.trending_topics add column demand_score numeric not null default 0;
alter table public.trending_topics add column signal_score numeric not null default 0;

-- Two search terms pointing at the same article are the same story. Clustering
-- on the primary link is cruder than semantic matching and far more reliable:
-- if two trends cite the same URL, there is nothing to argue about.
alter table public.trending_topics add column cluster_key text;

create index trending_topics_score_idx
  on public.trending_topics (signal_score desc, last_seen_at desc)
  where status = 'newsworthy';
create index trending_topics_cluster_idx on public.trending_topics (cluster_key);

-- ---------------------------------------------------------------------------
-- Outlet authority.
--
-- A story carried by three wire services is a different proposition from one
-- carried by three aggregators recycling the same press release. Weights are
-- editable, because this is an editorial judgement rather than a fact.
-- ---------------------------------------------------------------------------
create table public.source_authority (
  host text primary key,
  name text not null,
  -- 1.0 is an ordinary outlet. Above that is a wire service or a paper of
  -- record; below it is an aggregator, a blog, or a site that mostly rewrites.
  weight numeric not null default 1.0,
  note text,
  created_at timestamptz not null default now(),
  constraint source_authority_weight_sane check (weight >= 0 and weight <= 3)
);

alter table public.source_authority enable row level security;

create policy "source_authority: editorial read"
  on public.source_authority for select to authenticated
  using (app.is_editorial());
create policy "source_authority: admins write"
  on public.source_authority for insert to authenticated
  with check (app.is_admin());
create policy "source_authority: admins update"
  on public.source_authority for update to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy "source_authority: admins delete"
  on public.source_authority for delete to authenticated
  using (app.is_admin());

insert into public.source_authority (host, name, weight, note) values
  -- Wire services and papers of record.
  ('reuters.com',        'Reuters',            2.0, 'Wire service.'),
  ('apnews.com',         'Associated Press',   2.0, 'Wire service.'),
  ('afp.com',            'AFP',                2.0, 'Wire service.'),
  ('bbc.com',            'BBC',                1.8, null),
  ('bbc.co.uk',          'BBC',                1.8, null),
  ('theguardian.com',    'The Guardian',       1.7, null),
  ('nytimes.com',        'The New York Times', 1.7, null),
  ('ft.com',             'Financial Times',    1.7, null),
  ('washingtonpost.com', 'The Washington Post',1.6, null),
  ('economist.com',      'The Economist',      1.6, null),
  ('npr.org',            'NPR',                1.5, null),
  ('aljazeera.com',      'Al Jazeera',         1.5, null),
  ('bloomberg.com',      'Bloomberg',          1.6, null),
  -- Indian national press.
  ('thehindu.com',       'The Hindu',          1.7, null),
  ('indianexpress.com',  'The Indian Express', 1.6, null),
  ('livemint.com',       'Mint',               1.5, null),
  ('business-standard.com','Business Standard',1.5, null),
  ('ndtv.com',           'NDTV',               1.3, null),
  ('hindustantimes.com', 'Hindustan Times',    1.3, null),
  ('timesofindia.indiatimes.com','The Times of India', 1.2, null),
  ('indiatoday.in',      'India Today',        1.2, null),
  ('news18.com',         'News18',             1.1, null),
  -- Aggregators and rewrite-heavy sites: real coverage, lower weight.
  ('indiatv.in',         'India TV',           0.8, 'Heavy on rewrites and price tables.'),
  ('abplive.com',        'ABP Live',           0.8, 'Heavy on rewrites and price tables.'),
  ('livehindustan.com',  'Hindustan',          0.9, null),
  ('jagran.com',         'Dainik Jagran',      0.9, null),
  ('onefootball.com',    'OneFootball',        0.6, 'Aggregator.'),
  ('msn.com',            'MSN',                0.4, 'Syndication surface, not an outlet.'),
  ('news.google.com',    'Google News',        0.3, 'Aggregation surface.')
on conflict (host) do nothing;

-- ---------------------------------------------------------------------------
-- The scoring function.
--
-- Kept in the database because every input already lives here, and because a
-- score computed in one place cannot drift between the ranking used to pick
-- stories and the one shown to editors.
-- ---------------------------------------------------------------------------
create or replace function app.score_trend(p_trend_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t record;
  volume_score numeric := 0;
  velocity_score numeric := 0;
  corroboration_score numeric := 0;
  authority numeric := 0;
  demand numeric := 0;
  freshness numeric := 0;
  saturation numeric := 0;
  total numeric := 0;
begin
  select * into t from public.trending_topics where id = p_trend_id;
  if not found then return 0; end if;

  -- Volume, compressed. The gap between 200 and 2,000 searches matters far
  -- more than the gap between 200,000 and 2,000,000, and a linear term would
  -- let one viral term drown out everything else permanently.
  volume_score := least(ln(greatest(coalesce(t.traffic_rank, 1), 1)) * 1.2, 12);

  -- Velocity. A term climbing is a story breaking; a term falling has already
  -- been covered by everyone. Null on first sighting, which is treated as
  -- mildly positive rather than unknown-and-therefore-zero.
  velocity_score := case
    when t.velocity is null then 1.5
    when t.velocity > 2 then 6
    when t.velocity > 1.2 then 4
    when t.velocity > 0.9 then 2
    else 0
  end;

  -- Corroboration. One outlet reporting something is a claim. Several
  -- independent outlets reporting it is an event. Capped so a swarm of
  -- syndicated copies does not outweigh everything else.
  corroboration_score := least(coalesce(t.corroboration, 0) * 2.0, 8);

  -- Who is carrying it.
  authority := least(coalesce(t.authority_score, 0) * 2.5, 10);

  -- Our own readers asked for this and we had nothing. The strongest signal
  -- available, because it is demand we have already failed to meet.
  demand := least(coalesce(t.demand_score, 0), 8);

  -- Freshness, decaying over roughly half a day.
  freshness := 4 * exp(-extract(epoch from (now() - t.first_seen_at)) / 43200.0);

  -- Saturation: have we published something from this cluster recently? Five
  -- takes on one story is how an automated site starts looking like one.
  select count(*) * 3.0 into saturation
  from public.trending_topics other
  where other.cluster_key is not null
    and other.cluster_key = t.cluster_key
    and other.id <> t.id
    and other.status = 'written'
    and other.last_seen_at > now() - interval '24 hours';

  total := volume_score + velocity_score + corroboration_score
         + authority + demand + freshness - saturation;

  return greatest(round(total, 2), 0);
end;
$$;

grant execute on function app.score_trend(uuid) to service_role;

-- Recomputes every pending or queued candidate. Called after each ingest.
create or replace function public.rescore_trends()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated integer := 0;
begin
  update public.trending_topics t
     set signal_score = app.score_trend(t.id)
   where t.status in ('pending', 'newsworthy');

  get diagnostics updated = row_count;
  return updated;
end;
$$;

revoke all on function public.rescore_trends() from public, anon, authenticated;
grant execute on function public.rescore_trends() to service_role;
