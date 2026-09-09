-- Bylines.
--
-- Deliberately separate from auth.users: not every byline has an account. Wire
-- copy arrives credited to a correspondent who will never log in, and a staff
-- writer who leaves keeps their byline on everything they filed after their
-- account is deleted. user_id is therefore nullable, and set null on delete.

create table public.authors (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,

  slug text not null unique,
  display_name text not null,
  -- Job title as it appears under the byline, e.g. 'Health correspondent'.
  title text,
  bio text,
  avatar_url text,
  -- Public contact points, e.g. {"email": "...", "x": "...", "site": "..."}.
  -- Free-form because what a newsroom publishes about a writer changes often
  -- and should never require a migration.
  links jsonb not null default '{}'::jsonb,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint authors_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint authors_display_name_not_blank check (length(btrim(display_name)) > 0)
);

create index authors_user_id_idx on public.authors (user_id);

create trigger authors_set_updated_at
  before update on public.authors
  for each row execute function app.set_updated_at();

alter table public.authors enable row level security;

-- Author bio pages are public.

-- ---------------------------------------------------------------------------
-- Policies. One per role per action; see user_roles for the rationale.
-- ---------------------------------------------------------------------------

-- Author bio pages are public.
create policy "authors: anon read active"
  on public.authors
  for select
  to anon
  using (is_active);

create policy "authors: read"
  on public.authors
  for select
  to authenticated
  using (is_active or app.is_editorial());

create policy "authors: editorial insert"
  on public.authors
  for insert
  to authenticated
  with check (app.is_editorial());

-- A writer maintains their own bio; editors maintain anyone's. USING and
-- WITH CHECK are both pinned: without WITH CHECK a writer could repoint
-- user_id at someone else and take over their byline.
create policy "authors: update"
  on public.authors
  for update
  to authenticated
  using ((select auth.uid()) = user_id or app.is_editorial())
  with check ((select auth.uid()) = user_id or app.is_editorial());

-- Deleting a byline would orphan published work, so it is admin-only and
-- expected to be rare; deactivating is the normal path.
create policy "authors: admins delete"
  on public.authors
  for delete
  to authenticated
  using (app.is_admin());
