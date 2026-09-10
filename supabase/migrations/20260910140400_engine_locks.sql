-- Run locks for the engine.
--
-- pg_cron fires on the minute whether or not the previous call has finished,
-- and a cold pulse can take most of a minute. Two pulses clustering the same
-- new story at once would found it twice, so each run takes a lease first
-- and steps aside if the last one is still live. Leases expire, so a run
-- that dies mid-way cannot wedge the engine.

create table if not exists public.engine_locks (
  name text primary key,
  claimed_at timestamptz,
  released_at timestamptz
);

alter table public.engine_locks enable row level security;

create policy "engine_locks: editorial read"
  on public.engine_locks for select
  to authenticated
  using (app.is_editorial());

insert into public.engine_locks (name) values ('pulse'), ('desk')
on conflict (name) do nothing;

create or replace function public.engine_try_lock(p_name text, p_ttl_seconds integer)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.engine_locks
      set claimed_at = now(), released_at = null
      where name = p_name
        and (claimed_at is null
             or released_at is not null
             or claimed_at < now() - make_interval(secs => greatest(p_ttl_seconds, 1)))
      returning 1
  )
  select exists (select 1 from claimed);
$$;

create or replace function public.engine_release_lock(p_name text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.engine_locks set released_at = now() where name = p_name;
$$;

revoke all on function public.engine_try_lock(text, integer) from public, anon, authenticated;
revoke all on function public.engine_release_lock(text) from public, anon, authenticated;
grant execute on function public.engine_try_lock(text, integer) to service_role;
grant execute on function public.engine_release_lock(text) to service_role;
