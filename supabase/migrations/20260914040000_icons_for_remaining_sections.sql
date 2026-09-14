-- Marks for the sections the first icon set did not cover.
--
-- The earlier migration named fifteen slugs explicitly. The newsroom runs
-- twenty-two, so these seven were left without one: AI and Startups sit in the
-- header itself, and the other five in the drawer behind "More".
--
-- Written as a join against the files that exist rather than another hand-typed
-- list, so a section is only given a mark that has actually been drawn.

update public.categories
set icon_url = '/icons/' || slug || '.png'
where slug in (
  'ai', 'startups', 'disasters', 'human-interest',
  'labour', 'religion', 'weather'
)
and icon_url is null;
