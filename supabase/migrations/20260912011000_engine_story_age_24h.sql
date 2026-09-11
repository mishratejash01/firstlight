-- Twenty-four hours, not eight. The queue is written newest-first, so the
-- ceiling only decides what happens to a story that took a long time to
-- gather its sources: it is still written, after the fresher ones, rather
-- than thrown away.
update public.site_settings set value = '24'::jsonb where key = 'engine_max_story_age_hours';

select cron.unschedule('close-stale-events');
select cron.schedule('close-stale-events', '*/15 * * * *',
  $$update public.story_events
      set status = 'rejected', triage_reason = 'Expired without being written.'
      where (status = 'candidate' and first_seen_at < now() - interval '36 hours')
         or (status = 'newsworthy' and first_seen_at < now() - interval '24 hours')$$);
