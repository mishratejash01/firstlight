-- The model key pool.
--
-- Several keys per provider, rotated when one is refused. Vercel runs many
-- function instances at once, so which keys are cooling has to live here
-- rather than in memory, or every instance rediscovers the same exhausted
-- key one refusal at a time. Keys themselves never enter this table: a key
-- is identified by its provider and a short hash.

create table if not exists public.ai_key_health (
  key_id text primary key,
  provider text not null,
  label text not null,
  cooling_until timestamptz,
  last_error text,
  last_error_at timestamptz,
  calls integer not null default 0,
  errors integer not null default 0,
  last_used_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.ai_key_health enable row level security;

create policy "ai_key_health: admins read"
  on public.ai_key_health for select
  to authenticated
  using (app.is_admin());

-- One call to record an outcome, so the write is a single statement.
create or replace function public.ai_key_record(
  p_key_id text,
  p_provider text,
  p_label text,
  p_ok boolean,
  p_error text default null,
  p_cooldown_seconds integer default 0
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ai_key_health as h (key_id, provider, label, calls, errors, last_error, last_error_at, cooling_until, last_used_at, updated_at)
  values (
    p_key_id, p_provider, p_label,
    case when p_ok then 1 else 0 end,
    case when p_ok then 0 else 1 end,
    case when p_ok then null else p_error end,
    case when p_ok then null else now() end,
    case when p_ok or p_cooldown_seconds <= 0 then null else now() + make_interval(secs => p_cooldown_seconds) end,
    now(), now()
  )
  on conflict (key_id) do update set
    calls = h.calls + excluded.calls,
    errors = h.errors + excluded.errors,
    last_error = coalesce(excluded.last_error, h.last_error),
    last_error_at = coalesce(excluded.last_error_at, h.last_error_at),
    cooling_until = case when p_ok then null else coalesce(excluded.cooling_until, h.cooling_until) end,
    last_used_at = now(),
    updated_at = now();
$$;

revoke all on function public.ai_key_record(text, text, text, boolean, text, integer) from public, anon, authenticated;
grant execute on function public.ai_key_record(text, text, text, boolean, text, integer) to service_role;

insert into public.site_settings (key, value, description) values
  ('autonomous_hourly_limit', '10'::jsonb,
   'Maximum stories the engine publishes in any rolling hour. The daily limit still applies as a ceiling.')
on conflict (key) do nothing;

update public.site_settings set value = '150'::jsonb where key = 'autonomous_daily_limit';
update public.site_settings set value = '120'::jsonb where key = 'engine_triage_hourly_budget';
