-- Development seed data.
--
-- NOT production content. Every row here hangs off the source
-- 'sample-development-content', so the whole set can be removed with one
-- delete once real copy exists:
--
--   delete from public.articles
--    where source_id = (select id from public.sources where slug = 'sample-development-content');
--
-- The subjects are deliberately invented — Valmara, Rhoswen, the Coastal
-- Authority — so that nothing in here can ever be mistaken for real reporting
-- if it leaks into a screenshot or a search index. Realistic *shape*, plainly
-- fictional *substance*.
--
-- This exists because the design cannot be judged against an empty database
-- and the homepage must render from real queries. It is seeded through the
-- database precisely so that swapping in the wire feed is a data change, not a
-- code rewrite.

begin;

-- ---------------------------------------------------------------------------
-- Source
-- ---------------------------------------------------------------------------
insert into public.sources (slug, name, origin, homepage_url)
values ('sample-development-content', 'Sample content (development)', 'original', null)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Bylines
-- ---------------------------------------------------------------------------
insert into public.authors (slug, display_name, title, bio) values
  ('anna-whitfield',  'Anna Whitfield',  'Chief political correspondent', 'Covers government, elections and the machinery of the state.'),
  ('marcus-reed',     'Marcus Reed',     'Economics editor',              'Writes on markets, public finance and the cost of living.'),
  ('priya-nair',      'Priya Nair',      'Science correspondent',         'Reports on research, climate and public health.'),
  ('tomas-lindqvist', 'Tomas Lindqvist', 'Technology correspondent',      'Covers computing, infrastructure and the industry behind them.'),
  ('grace-obi',       'Grace Obi',       'Culture writer',                'Writes about film, publishing and the arts.'),
  ('daniel-hart',     'Daniel Hart',     'Sports reporter',               'Follows domestic leagues and international competition.')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------
insert into public.tags (slug, name) values
  ('valmara','Valmara'), ('public-finance','Public finance'), ('elections','Elections'),
  ('coastal-flooding','Coastal flooding'), ('housing','Housing'), ('semiconductors','Semiconductors'),
  ('public-health','Public health'), ('energy','Energy'), ('transport','Transport'),
  ('climate','Climate'), ('data-protection','Data protection'), ('football','Football'),
  ('publishing','Publishing'), ('local-government','Local government')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Entities. sameAs is empty here because these subjects are invented; on real
-- copy it carries Wikidata and official-site URLs.
-- ---------------------------------------------------------------------------
insert into public.entities (slug, name, entity_type, description) values
  ('elena-marchetti','Elena Marchetti','Person','Finance minister of Valmara.'),
  ('coastal-authority','Coastal Authority','GovernmentOrganization','Agency responsible for flood defence in Valmara.'),
  ('rhoswen','Rhoswen','Place','Port city on the western Valmaran coast.'),
  ('northgate-semiconductor','Northgate Semiconductor','Organization','Contract chip manufacturer headquartered in Rhoswen.')
on conflict (slug) do nothing;

commit;
