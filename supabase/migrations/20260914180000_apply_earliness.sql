-- One statement to write the earliness scores.
--
-- The first version wrote p_big with one PostgREST request per event, two
-- hundred at a time in parallel, every three minutes. Nine hundred requests
-- in a burst filled the connection pool; the public site's own queries
-- queued behind them and the homepage took over a minute to load. This
-- takes the whole batch as one JSON array and updates in a single statement.

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
    returning 1
  )
  select count(*)::int from upd;
$$;
revoke all on function public.engine_apply_earliness(jsonb) from public, anon, authenticated;
