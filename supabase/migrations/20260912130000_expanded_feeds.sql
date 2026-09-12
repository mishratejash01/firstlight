-- Expanded direct feeds, behind a master switch.
--
-- Until now the engine polled twelve feeds and discovered most stories
-- second-hand, through Google News, hours after the first report. Measured on
-- the 47 stories written after the wire schedule was fixed: median 4.3 hours
-- between the world's first report and our first sighting, and only 5 of the
-- 47 were seen first by one of our own feeds.
--
-- This wave adds the major outlets that publish a working public feed, plus
-- primary sources (regulators, the AI labs themselves). Every one is flagged
-- `expanded` so a single setting, engine_expanded_feeds_enabled, can stop the
-- whole wave at once if it brings noise. The founding twelve are not touched
-- by that switch; each feed also keeps its own is_active switch.
--
-- Same licence position as the founding feeds: allow_full_text = false. A feed
-- is not a licence to republish; the desk writes its own story and attributes.

alter table public.sources
  add column if not exists expanded boolean not null default false;

comment on column public.sources.expanded is
  'Part of the expanded direct-feed wave. Polled only while the engine_expanded_feeds_enabled setting is true, in addition to its own is_active switch. The founding feeds carry false and answer only to is_active.';

insert into public.site_settings (key, value, description) values
  ('engine_expanded_feeds_enabled', 'true'::jsonb,
   'Master switch for the expanded direct feeds (sources.expanded = true). Off: those feeds are not polled and their fetched items stop entering the engine at the next pulse. Founding feeds, Google streams and published stories are unaffected.')
on conflict (key) do nothing;

-- The outlets. homepage_url is what the engine keys the outlet by, so several
-- feeds from one paper share a host and count as one source in corroboration.
insert into public.sources (slug, name, origin, homepage_url, expanded) values
  ('bloomberg-markets',      'Bloomberg Markets',        'wire', 'https://www.bloomberg.com',                true),
  ('bloomberg-politics',     'Bloomberg Politics',       'wire', 'https://www.bloomberg.com',                true),
  ('bloomberg-technology',   'Bloomberg Technology',     'wire', 'https://www.bloomberg.com',                true),
  ('bloomberg-economics',    'Bloomberg Economics',      'wire', 'https://www.bloomberg.com',                true),
  ('ft-home',                'Financial Times',          'wire', 'https://www.ft.com',                       true),
  ('ft-world',               'Financial Times World',    'wire', 'https://www.ft.com',                       true),
  ('nyt-world',              'New York Times World',     'wire', 'https://www.nytimes.com',                  true),
  ('nyt-business',           'New York Times Business',  'wire', 'https://www.nytimes.com',                  true),
  ('nyt-technology',         'New York Times Technology','wire', 'https://www.nytimes.com',                  true),
  ('al-jazeera',             'Al Jazeera',               'wire', 'https://www.aljazeera.com',                true),
  ('washington-post-world',  'Washington Post World',    'wire', 'https://www.washingtonpost.com',           true),
  ('washington-post-politics','Washington Post Politics','wire', 'https://www.washingtonpost.com',           true),
  ('cnbc-top',               'CNBC',                     'wire', 'https://www.cnbc.com',                     true),
  ('the-economist',          'The Economist',            'wire', 'https://www.economist.com',                true),
  ('the-information',        'The Information',          'wire', 'https://www.theinformation.com',           true),
  ('bbc-world',              'BBC World',                'wire', 'https://www.bbc.co.uk/news',               true),
  ('bbc-business',           'BBC Business',             'wire', 'https://www.bbc.co.uk/news',               true),
  ('bbc-technology',         'BBC Technology',           'wire', 'https://www.bbc.co.uk/news',               true),
  ('guardian-world',         'The Guardian World',       'wire', 'https://www.theguardian.com',              true),
  ('guardian-business',      'The Guardian Business',    'wire', 'https://www.theguardian.com',              true),
  ('guardian-technology',    'The Guardian Technology',  'wire', 'https://www.theguardian.com',              true),
  ('the-hindu-world',        'The Hindu World',          'wire', 'https://www.thehindu.com',                 true),
  ('the-hindu-business',     'The Hindu Business',       'wire', 'https://www.thehindu.com',                 true),
  ('times-of-india-top',     'Times of India',           'wire', 'https://timesofindia.indiatimes.com',      true),
  ('times-of-india-india',   'Times of India India',     'wire', 'https://timesofindia.indiatimes.com',      true),
  ('hindustan-times-india',  'Hindustan Times India',    'wire', 'https://www.hindustantimes.com',           true),
  ('economic-times-top',     'Economic Times',           'wire', 'https://economictimes.indiatimes.com',     true),
  ('economic-times-markets', 'Economic Times Markets',   'wire', 'https://economictimes.indiatimes.com',     true),
  ('mint-news',              'Mint',                     'wire', 'https://www.livemint.com',                 true),
  ('mint-markets',           'Mint Markets',             'wire', 'https://www.livemint.com',                 true),
  ('india-today',            'India Today',              'wire', 'https://www.indiatoday.in',                true),
  ('rbi-press-releases',     'Reserve Bank of India',    'wire', 'https://www.rbi.org.in',                   true),
  ('sebi-press-releases',    'SEBI',                     'wire', 'https://www.sebi.gov.in',                  true),
  ('openai-news',            'OpenAI',                   'wire', 'https://openai.com',                       true),
  ('deepmind-blog',          'Google DeepMind',          'wire', 'https://deepmind.google',                  true),
  ('google-blog',            'Google',                   'wire', 'https://blog.google',                      true),
  ('hugging-face-blog',      'Hugging Face',             'wire', 'https://huggingface.co',                   true)
on conflict (slug) do nothing;

insert into public.source_licences (source_id, feed_url, feed_format, allow_full_text, licence_terms)
select s.id, v.feed_url, 'rss', false,
       'Public RSS feed. No syndication agreement in place: summary and attribution link only. Do not enable full text without a signed contract.'
from (values
  ('bloomberg-markets',       'https://feeds.bloomberg.com/markets/news.rss'),
  ('bloomberg-politics',      'https://feeds.bloomberg.com/politics/news.rss'),
  ('bloomberg-technology',    'https://feeds.bloomberg.com/technology/news.rss'),
  ('bloomberg-economics',     'https://feeds.bloomberg.com/economics/news.rss'),
  ('ft-home',                 'https://www.ft.com/rss/home'),
  ('ft-world',                'https://www.ft.com/world?format=rss'),
  ('nyt-world',               'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'),
  ('nyt-business',            'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml'),
  ('nyt-technology',          'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml'),
  ('al-jazeera',              'https://www.aljazeera.com/xml/rss/all.xml'),
  ('washington-post-world',   'https://feeds.washingtonpost.com/rss/world'),
  ('washington-post-politics','https://feeds.washingtonpost.com/rss/politics'),
  ('cnbc-top',                'https://www.cnbc.com/id/100003114/device/rss/rss.html'),
  ('the-economist',           'https://www.economist.com/latest/rss.xml'),
  ('the-information',         'https://www.theinformation.com/feed'),
  ('bbc-world',               'https://feeds.bbci.co.uk/news/world/rss.xml'),
  ('bbc-business',            'https://feeds.bbci.co.uk/news/business/rss.xml'),
  ('bbc-technology',          'https://feeds.bbci.co.uk/news/technology/rss.xml'),
  ('guardian-world',          'https://www.theguardian.com/world/rss'),
  ('guardian-business',       'https://www.theguardian.com/uk/business/rss'),
  ('guardian-technology',     'https://www.theguardian.com/uk/technology/rss'),
  ('the-hindu-world',         'https://www.thehindu.com/news/international/feeder/default.rss'),
  ('the-hindu-business',      'https://www.thehindu.com/business/feeder/default.rss'),
  ('times-of-india-top',      'https://timesofindia.indiatimes.com/rssfeedstopstories.cms'),
  ('times-of-india-india',    'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms'),
  ('hindustan-times-india',   'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml'),
  ('economic-times-top',      'https://economictimes.indiatimes.com/rssfeedstopstories.cms'),
  ('economic-times-markets',  'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms'),
  ('mint-news',               'https://www.livemint.com/rss/news'),
  ('mint-markets',            'https://www.livemint.com/rss/markets'),
  ('india-today',             'https://www.indiatoday.in/rss/1206578'),
  ('rbi-press-releases',      'https://www.rbi.org.in/pressreleases_rss.xml'),
  ('sebi-press-releases',     'https://www.sebi.gov.in/sebirss.xml'),
  ('openai-news',             'https://openai.com/news/rss.xml'),
  ('deepmind-blog',           'https://deepmind.google/blog/rss.xml'),
  ('google-blog',             'https://blog.google/rss/'),
  ('hugging-face-blog',       'https://huggingface.co/blog/feed.xml')
) as v(slug, feed_url)
join public.sources s on s.slug = v.slug
on conflict (source_id) do nothing;

-- Hosts the authority table did not know. Unknown hosts default to 0.8, which
-- would have ranked the central bank below a tabloid.
insert into public.source_authority (host, name, weight, note) values
  ('economictimes.indiatimes.com', 'Economic Times', 1.3, null),
  ('rbi.org.in', 'Reserve Bank of India', 1.8, 'Primary source for its own releases; newsworthiness is for triage to judge.'),
  ('sebi.gov.in', 'SEBI', 1.5, 'Primary source for its own orders and circulars; many are routine.'),
  ('huggingface.co', 'Hugging Face', 1.0, 'Primary source for model releases on its hub.')
on conflict (host) do update set weight = excluded.weight, name = excluded.name, note = excluded.note;

-- One paper, one key. BBC arrived as bbc.co.uk and bbc.com and counted as two
-- independent sources; Economic Times as m.economictimes.com and its full
-- host. The engine now canonicalises on the way in (src/lib/engine/hosts.ts);
-- this repairs what is already stored so corroboration counts stay honest.
with aliases(alias, canonical) as (values
  ('bbc.com', 'bbc.co.uk'),
  ('m.economictimes.com', 'economictimes.indiatimes.com'),
  ('m.timesofindia.com', 'timesofindia.indiatimes.com'),
  ('edition.cnn.com', 'cnn.com'),
  ('amp.theguardian.com', 'theguardian.com'),
  ('m.hindustantimes.com', 'hindustantimes.com')
)
update public.signal_mentions m
   set source_key = a.canonical
  from aliases a
 where m.source_key = a.alias;

update public.story_events e
   set source_keys = (
     select array_agg(distinct coalesce(a.canonical, k))
       from unnest(e.source_keys) as k
       left join (values
         ('bbc.com', 'bbc.co.uk'),
         ('m.economictimes.com', 'economictimes.indiatimes.com'),
         ('m.timesofindia.com', 'timesofindia.indiatimes.com'),
         ('edition.cnn.com', 'cnn.com'),
         ('amp.theguardian.com', 'theguardian.com'),
         ('m.hindustantimes.com', 'hindustantimes.com')
       ) as a(alias, canonical) on a.alias = k
   )
 where e.source_keys && array['bbc.com','m.economictimes.com','m.timesofindia.com','edition.cnn.com','amp.theguardian.com','m.hindustantimes.com'];

-- Per-feed figures for the switch page: what each feed fetched, how many
-- events it touched, how many it was first to report, and how many of those
-- became stories. Joined through the wire item id each RSS mention records,
-- so four Bloomberg desks are counted separately even though they share a host.
create index if not exists signal_mentions_wire_item_idx
  on public.signal_mentions ((raw->>'wireItemId'))
  where source_kind = 'rss';

create or replace function public.engine_feed_stats(p_hours integer default 24)
returns table (
  source_id uuid,
  items bigint,
  events_touched bigint,
  events_started bigint,
  stories_written bigint
)
language sql
stable
set search_path = public
as $$
  with items as (
    select w.id, w.source_id
      from public.wire_items w
     where w.ingested_at > now() - make_interval(hours => p_hours)
  ),
  linked as (
    select i.source_id, m.event_id, m.observed_at
      from items i
      join public.signal_mentions m
        on m.source_kind = 'rss' and (m.raw->>'wireItemId') = i.id::text
     where m.event_id is not null
  ),
  firsts as (
    select l.event_id, min(m.observed_at) as first_at
      from linked l
      join public.signal_mentions m on m.event_id = l.event_id
     group by l.event_id
  )
  select s.id as source_id,
         (select count(*) from items i where i.source_id = s.id) as items,
         (select count(distinct l.event_id) from linked l where l.source_id = s.id) as events_touched,
         (select count(distinct l.event_id)
            from linked l join firsts f on f.event_id = l.event_id
           where l.source_id = s.id and l.observed_at <= f.first_at) as events_started,
         (select count(distinct e.article_id)
            from linked l join public.story_events e on e.id = l.event_id
           where l.source_id = s.id and e.article_id is not null) as stories_written
    from public.sources s
   where s.origin = 'wire';
$$;

grant execute on function public.engine_feed_stats(integer) to authenticated;
