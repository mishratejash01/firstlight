-- Breaking is a state, not a label a story keeps for life.
--
-- The desk now flags a story it triaged as breaking (src/lib/engine/write.ts),
-- and the flag is what runs a story in the breaking banner and prints
-- "Breaking" on its cards and its page. Left set, every such story would call
-- itself breaking for ever. This clears the flag six hours after a story went
-- live, the banner's window (BREAKING_BANNER_HOURS in
-- src/lib/queries/articles.ts), for stories an editor flagged as well.
--
-- Clearing the flag is not an edit: content_updated_at and the version history
-- watch only the text, so the story does not show as updated.

select cron.schedule(
  'expire-breaking',
  '*/10 * * * *',
  $$update public.articles
       set is_breaking = false
     where is_breaking
       and published_at < now() - interval '6 hours'$$
);
