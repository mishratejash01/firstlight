-- News is perishable. Nothing older than eight hours at first sighting is
-- written, and the queue is trimmed on the same clock, so the desk is always
-- choosing among what came in recently rather than what has waited longest.

insert into public.site_settings (key, value, description) values
  ('engine_max_story_age_hours', '8'::jsonb,
   'Oldest an event may be, from first sighting, and still be written. Zero means no limit.')
on conflict (key) do nothing;

select cron.unschedule('close-stale-events');
select cron.schedule('close-stale-events', '*/15 * * * *',
  $$update public.story_events
      set status = 'rejected', triage_reason = 'Expired without being written.'
      where (status = 'candidate' and first_seen_at < now() - interval '24 hours')
         or (status = 'newsworthy' and first_seen_at < now() - interval '8 hours')$$);
