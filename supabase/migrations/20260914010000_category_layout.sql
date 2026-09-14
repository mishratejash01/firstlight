-- How a section presents itself on the front page.
--
-- Opinion is not a subject, it is a genre: the reader needs to know who is
-- arguing before they read what is argued, so an opinion block leads with the
-- columnist rather than with a photograph of an event. That is a presentation
-- difference, and presentation for a section belongs on the section row — not
-- in a component checking for the slug 'opinion', which would break the moment
-- a newsroom renamed the section or added a second one like it.
--
-- 'standard' is the picture-led block every news section uses.
-- 'opinion' leads with the writer.

alter table public.categories
  add column layout text not null default 'standard';

alter table public.categories
  add constraint categories_layout_valid
  check (layout in ('standard', 'opinion'));

-- Seed the one section that ships with the opinion treatment. Editors can move
-- any other section onto it from the sections admin without a deploy.
update public.categories set layout = 'opinion' where slug = 'opinion';

-- RLS is already enabled on categories and its policies are column-agnostic,
-- so this column inherits them; no policy change is needed or wanted here.
