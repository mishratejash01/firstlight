-- Expiry judged from when the engine last touched the event, not from the
-- publication time of its mentions. A wire item republished days late founds
-- an event whose last_seen_at is already old, and the previous rule rejected
-- it in the same breath as "expired".

select cron.unschedule('close-stale-events');

select cron.schedule('close-stale-events', '*/30 * * * *',
  $$update public.story_events
      set status = 'rejected', triage_reason = 'Expired without being written.'
      where status in ('candidate', 'newsworthy')
        and greatest(last_seen_at, updated_at) < now() - interval '72 hours'$$);
