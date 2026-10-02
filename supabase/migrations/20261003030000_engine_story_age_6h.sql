-- Six hours, not twenty-four. The owner wants only fresh news written: a
-- story first seen more than six hours ago, or whose newest source is older
-- than that, is no longer triaged or written. Breaking stays at three hours.
-- Set after the 3 Oct outage left a day of unwritten stories in the queue.
update public.site_settings set value = '6'::jsonb where key = 'engine_max_story_age_hours';
