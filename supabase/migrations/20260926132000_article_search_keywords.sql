-- The searches a story was written to be found for.
--
-- Before drafting, the writing engine researches how each story is being
-- searched for: the searches rising in India that match it (Google Trends)
-- and the headlines ranking for it in Google News (lib/seo/search-research).
-- The drafter words the headline and opening from that and returns the three
-- to eight search phrases the piece answers. They are kept with the story so
-- an editor can see them, so they can be added to the article's structured
-- data, and so they can later be checked against the searches that actually
-- bring readers.
--
-- A column rather than a table: the phrases belong to one story, are written
-- with it and read with it. The articles table's existing RLS policies cover
-- the new column; it exposes nothing the published page does not already
-- show in its structured data.

alter table public.articles
  add column if not exists search_keywords text[] not null default '{}';

comment on column public.articles.search_keywords is
  'Search phrases the story was written to be found for, most important first. Set by the drafting step.';
