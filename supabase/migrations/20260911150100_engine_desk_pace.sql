-- The desk runs every two minutes and writes up to two stories a run; the
-- hourly and daily limits in site_settings govern the actual pace. Events
-- that passed triage but sat unwritten for twelve hours are no longer news
-- and leave the queue, so fresh stories are not competing with the morning.

select cron.unschedule('engine-desk');
select cron.schedule('engine-desk', '*/2 * * * *',
  $$select app.engine_call('/api/cron/engine-write', 290000)$$);

select cron.unschedule('close-stale-events');
select cron.schedule('close-stale-events', '*/30 * * * *',
  $$update public.story_events
      set status = 'rejected', triage_reason = 'Expired without being written.'
      where (status = 'candidate' and greatest(last_seen_at, updated_at) < now() - interval '72 hours')
         or (status = 'newsworthy' and greatest(first_seen_at, triaged_at) < now() - interval '12 hours')$$);
