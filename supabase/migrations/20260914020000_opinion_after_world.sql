-- Move Opinion up the front page, to sit directly after World.
--
-- Sections are ordered by sort_order everywhere they appear — the navigation,
-- the footer and the run of blocks down the front page — so this one value
-- moves all three together. It sits at 25, between World (20) and Business
-- (30), leaving room either side for a section to be slotted in later without
-- renumbering the rest.
--
-- Editors can change this from the sections admin without a deploy; it is set
-- here so a fresh database starts with the intended running order.

update public.categories set sort_order = 25 where slug = 'opinion';
