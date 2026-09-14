-- Earliness: touch a row only when something changed.
--
-- Every rewrite of a story_events row copies its 384-number embedding to a
-- new tuple version and adds an entry to the vector index. Rewriting nine
-- hundred rows every three minutes to store a probability that had not moved
-- was pure churn. Now only rows whose probability or second-source time
-- differs are written.

create or replace function public.engine_apply_earliness(p_rows jsonb)
returns integer
language sql
security definer
set search_path = ''
as $$
  with rows as (
    select (r->>'id')::uuid as id,
           nullif(r->>'p_big', '')::numeric as p_big,
           nullif(r->>'second_source_at', '')::timestamptz as second_at
      from jsonb_array_elements(p_rows) as r
  ),
  upd as (
    update public.story_events e
       set p_big = rows.p_big,
           p_big_at = now(),
           second_source_at = rows.second_at
      from rows
     where e.id = rows.id
       and (e.p_big is distinct from rows.p_big
            or e.second_source_at is distinct from rows.second_at)
    returning 1
  )
  select count(*)::int from upd;
$$;
