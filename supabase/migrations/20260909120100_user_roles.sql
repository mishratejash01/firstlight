-- Role assignments — the authorisation backbone.
--
-- Roles live in their own table rather than in auth.users.raw_user_meta_data
-- because that column is writable by the user it describes. Anyone able to
-- edit their own metadata could otherwise grant themselves 'admin'.

create table public.user_roles (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  -- A user holds a given role at most once. Holding several distinct roles is
  -- allowed: an editor who also files copy is both editor and author.
  unique (user_id, role)
);

create index user_roles_user_id_idx on public.user_roles (user_id);

alter table public.user_roles enable row level security;

-- ---------------------------------------------------------------------------
-- Role helpers.
--
-- SECURITY DEFINER so that policies on user_roles can consult user_roles
-- without recursing. They read auth.uid() internally and expose no user_id
-- parameter, so a caller can only ever ask about themselves.
-- ---------------------------------------------------------------------------
create or replace function app.has_role(_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = _role
  );
$$;

-- "May act on the editorial desk" — editors and admins. Used by most policies
-- so that adding a future desk role means changing one function, not thirty
-- policies.
create or replace function app.is_editorial()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role in ('admin', 'editor')
  );
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

grant execute on function app.has_role(public.app_role) to authenticated;
grant execute on function app.is_editorial() to authenticated;
grant execute on function app.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
--
-- Note there is intentionally no INSERT policy for ordinary users: role grants
-- are an admin-only operation. The very first admin is seeded out-of-band with
-- the service key, because at that point no admin exists to grant it.
-- ---------------------------------------------------------------------------

-- A user can see which roles they hold, so the UI can route them to the right
-- dashboard. They cannot see anyone else's.
create policy "user_roles: read own"
  on public.user_roles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_roles: admins read all"
  on public.user_roles
  for select
  to authenticated
  using (app.is_admin());

create policy "user_roles: admins grant"
  on public.user_roles
  for insert
  to authenticated
  with check (app.is_admin());

create policy "user_roles: admins revoke"
  on public.user_roles
  for delete
  to authenticated
  using (app.is_admin());
