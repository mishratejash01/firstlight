-- Major news feeds, as wire sources.
--
-- All of these are public RSS feeds the publishers offer for syndication.
-- Every one is seeded with allow_full_text = FALSE, which is not a placeholder:
-- offering a feed is not a licence to republish the articles behind it. With
-- the flag off the database physically refuses to store body copy from these
-- sources, so a promoted item can only ever become our own summary plus a link
-- to the original.
--
-- If a real syndication contract is later signed with any of them, an
-- administrator flips the flag for that source and only that source.

insert into public.sources (slug, name, origin, homepage_url) values
  ('bbc-news',         'BBC News',         'wire', 'https://www.bbc.co.uk/news'),
  ('the-guardian',     'The Guardian',     'wire', 'https://www.theguardian.com'),
  ('npr',              'NPR',              'wire', 'https://www.npr.org'),
  ('the-hindu',        'The Hindu',        'wire', 'https://www.thehindu.com'),
  ('indian-express',   'The Indian Express','wire','https://indianexpress.com'),
  ('ndtv',             'NDTV',             'wire', 'https://www.ndtv.com')
on conflict (slug) do nothing;

insert into public.source_licences (source_id, feed_url, feed_format, allow_full_text, licence_terms)
select s.id, v.feed_url, 'rss', false,
       'Public RSS feed. No syndication agreement in place: summary and attribution link only. Do not enable full text without a signed contract.'
from (values
  ('bbc-news',       'https://feeds.bbci.co.uk/news/rss.xml'),
  ('the-guardian',   'https://www.theguardian.com/uk/rss'),
  ('npr',            'https://feeds.npr.org/1001/rss.xml'),
  ('the-hindu',      'https://www.thehindu.com/news/national/feeder/default.rss'),
  ('indian-express', 'https://indianexpress.com/section/india/feed/'),
  ('ndtv',           'https://feeds.feedburner.com/ndtvnews-top-stories')
) as v(slug, feed_url)
join public.sources s on s.slug = v.slug
on conflict (source_id) do nothing;
