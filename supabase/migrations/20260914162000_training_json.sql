-- Training rows as one JSON document.
--
-- PostgREST caps a response at a thousand rows. The first fit trained the
-- earliness model on 460 events and evaluated the selection weights on the
-- wrong thousand labels because of it. Each function here returns its whole
-- result as a single jsonb value: one row, however many records inside, read
-- once a night.

create or replace function public.engine_earliness_json(
  p_from timestamptz,
  p_to timestamptz,
  p_with_label boolean default true
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    from public.engine_earliness_rows(p_from, p_to, p_with_label) r;
$$;
revoke all on function public.engine_earliness_json(timestamptz, timestamptz, boolean) from public, anon, authenticated;

create or replace function public.engine_training_outcomes_json(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'label', o.label, 'label_source', o.label_source, 'features', o.features,
           'weight', o.weight, 'created_at', o.created_at)), '[]'::jsonb)
    from public.event_outcomes o
   where o.label_source in ('reviewer', 'missed', 'outlet_4h', 'outlet_24h', 'editor')
     and o.created_at >= now() - make_interval(days => greatest(p_days, 1));
$$;
revoke all on function public.engine_training_outcomes_json(integer) from public, anon, authenticated;
