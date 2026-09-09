-- Records that a topic was written about.
--
-- A single statement rather than a read-modify-write from the worker: two
-- overlapping scheduled runs would otherwise both read the same count and both
-- write count+1, losing one of the increments. Doing it in the database makes
-- that impossible.

create or replace function public.record_topic_generation(p_topic_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_topics
     set last_generated_at = now(),
         times_generated = times_generated + 1,
         last_error = null
   where id = p_topic_id;
$$;

-- Called only by the scheduled worker, which runs as the service role. No
-- signed-in role has any reason to reach it.
revoke all on function public.record_topic_generation(uuid) from public, anon, authenticated;
grant execute on function public.record_topic_generation(uuid) to service_role;
