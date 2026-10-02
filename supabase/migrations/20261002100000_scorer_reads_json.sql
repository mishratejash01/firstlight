-- The scorer's two bulk reads as one JSON document each.
--
-- PostgREST caps a response at a thousand rows. scoreLiveEvents read
-- engine_event_aggregates and engine_entity_baselines through it, so with
-- around 2,800 live events at a time about half were never scored, triaged or
-- labelled at all (the 2026-09-23 audit found a story forty-one outlets carried
-- among the unscored), and most events were scored against a thousand of the
-- 2,300 baselines they needed. Each function here returns its whole result as
-- a single jsonb value, as the training reads already do: one row, however
-- many records inside, and the underlying query runs once.

create or replace function public.engine_event_aggregates_json(p_window_hours integer default 48)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    from public.engine_event_aggregates(p_window_hours) r;
$$;
revoke all on function public.engine_event_aggregates_json(integer) from public, anon, authenticated;
grant execute on function public.engine_event_aggregates_json(integer) to service_role;

create or replace function public.engine_entity_baselines_json(p_entities text[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    from public.engine_entity_baselines(p_entities) r;
$$;
revoke all on function public.engine_entity_baselines_json(text[]) from public, anon, authenticated;
grant execute on function public.engine_entity_baselines_json(text[]) to service_role;
