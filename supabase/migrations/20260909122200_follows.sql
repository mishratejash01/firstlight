-- Topic, author, section and event follows.
--
-- Following requires an account: there is no useful way to deliver a follow to
-- an anonymous browser, so user_id is NOT NULL rather than nullable-and-hoped-
-- for. A polymorphic target keeps one table instead of four near-identical
-- ones; the type is constrained, and the referential integrity that a real
-- foreign key would give is enforced by the trigger below.

create table public.follows (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  target_type text not null,
  target_id uuid not null,

  created_at timestamptz not null default now(),

  unique (user_id, target_type, target_id),
  constraint follows_target_type_valid
    check (target_type in ('tag', 'author', 'category', 'event'))
);

create index follows_target_idx on public.follows (target_type, target_id);

-- A polymorphic column cannot carry a foreign key, so the reference is checked
-- here instead. Without this, a follow can outlive the thing it points at and
-- the "most followed" rollup silently counts ghosts.
create or replace function app.validate_follow_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_exists boolean;
begin
  select case new.target_type
    when 'tag'      then exists (select 1 from public.tags where id = new.target_id)
    when 'author'   then exists (select 1 from public.authors where id = new.target_id)
    when 'category' then exists (select 1 from public.categories where id = new.target_id)
    when 'event'    then exists (select 1 from public.news_events where id = new.target_id)
  end into target_exists;

  if not coalesce(target_exists, false) then
    raise exception 'No % exists with id %', new.target_type, new.target_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger follows_validate_target
  before insert or update on public.follows
  for each row execute function app.validate_follow_target();

alter table public.follows enable row level security;

-- A reader's follow list is their own business. Aggregate "most followed"
-- counts reach the dashboard through the rollup views, never by letting one
-- reader enumerate another's interests.
create policy "follows: read own"
  on public.follows for select to authenticated
  using ((select auth.uid()) = user_id or app.is_admin());

create policy "follows: create own"
  on public.follows for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "follows: delete own"
  on public.follows for delete to authenticated
  using ((select auth.uid()) = user_id);
