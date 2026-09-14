-- The small mark shown beside a section's name.
--
-- Stored per section rather than picked by a component matching on slug: a
-- newsroom that renames a section, adds one, or wants a different mark should
-- not need a deploy to get it. Null is fine and means no mark is drawn, which
-- is what every section starts as until an editor sets one.
--
-- Paths are site-relative into /public/icons. A full URL works too, for a mark
-- served from Cloudinary alongside the rest of the newsroom's media.

alter table public.categories
  add column icon_url text;

update public.categories set icon_url = '/icons/' || slug || '.png'
where slug in (
  'politics', 'world', 'opinion', 'business', 'technology', 'science',
  'health', 'environment', 'sport', 'culture', 'society', 'justice',
  'conflict', 'education', 'lifestyle'
);

-- RLS is already enabled on categories and its policies are column-agnostic,
-- so this column inherits them; no policy change is needed or wanted here.
