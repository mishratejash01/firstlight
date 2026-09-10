-- The wire and the trends poll move onto the database clock.
--
-- GitHub's scheduler ran the wire ingest every four to five hours in practice,
-- not the every-thirty-minutes it was asked for, which left the engine reading
-- a stale wire for most of the day. pg_cron has not missed a minute. Both
-- workflows can stay; the ingest deduplicates by item, so overlap is harmless.

select cron.schedule('engine-wire', '*/5 * * * *',
  $$select app.engine_call('/api/cron/ingest-wire', 280000)$$);

select cron.schedule('engine-trends-poll', '4,34 * * * *',
  $$select app.engine_call('/api/cron/trends', 280000)$$);
