-- The engine's clock.
--
-- pg_cron fires inside the database and pg_net makes the HTTP call, so the
-- schedule runs every minute without depending on any hosting platform's
-- cron allowance. The bearer token lives in Vault under the name
-- 'engine_cron_secret' and is created out of band, never in a migration:
--
--   select vault.create_secret('<CRON_SECRET>', 'engine_cron_secret',
--                              'Bearer token for the engine endpoints');
--
-- The base URL is a setting, because it changes between environments and is
-- not secret.

insert into public.site_settings (key, value, description) values
  ('engine_base_url', '"https://newswebsite-pi.vercel.app"'::jsonb,
   'Origin the scheduled engine calls are made to. No trailing slash.')
on conflict (key) do nothing;

create or replace function app.engine_call(p_path text, p_timeout_ms integer default 170000)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_base text;
  v_request bigint;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'engine_cron_secret'
    limit 1;

  select trim(both '"' from value::text) into v_base
    from public.site_settings
    where key = 'engine_base_url';

  if v_secret is null or v_base is null then
    raise warning 'engine_call: secret or base url missing; % not called', p_path;
    return null;
  end if;

  select net.http_get(
    url := v_base || p_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := p_timeout_ms
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function app.engine_call(text, integer) from public, anon, authenticated;

-- Every minute: the fast streams. Every fifteen: the slow ones plus learning.
-- Every three: triage and write. The desk is offset from the slow pulse so
-- the two are not competing for the same minute.
select cron.schedule('engine-pulse-fast', '* * * * *',
  $$select app.engine_call('/api/cron/pulse')$$);

select cron.schedule('engine-pulse-slow', '7,22,37,52 * * * *',
  $$select app.engine_call('/api/cron/pulse?cadence=slow')$$);

select cron.schedule('engine-desk', '*/3 * * * *',
  $$select app.engine_call('/api/cron/engine-write', 290000)$$);

-- pg_net keeps every response; a minute-by-minute schedule fills that table
-- quickly. Keep a day.
select cron.schedule('prune-net-responses', '40 * * * *',
  $$delete from net._http_response where created < now() - interval '1 day'$$);
