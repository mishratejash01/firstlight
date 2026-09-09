-- Topic tags.
--
-- Finer-grained than sections: an article sits in exactly one section but
-- carries many tags. The recommendation query in Phase 4 scores relatedness by
-- shared tags, so this table is what makes "more on this story" work.

create table public.tags (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,

  -- Populated when a tag corresponds to an IPTC media topic below the section
  -- level, so wire subject codes can be mapped straight onto tags.
  iptc_qcode text unique,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tags_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint tags_name_not_blank check (length(btrim(name)) > 0)
);

create trigger tags_set_updated_at
  before update on public.tags
  for each row execute function app.set_updated_at();

alter table public.tags enable row level security;

create policy "tags: public read active"
  on public.tags
  for select
  to anon, authenticated
  using (is_active);

create policy "tags: editorial read all"
  on public.tags
  for select
  to authenticated
  using (app.is_editorial());

-- Editors coin tags in the course of filing, so this is not admin-gated.
create policy "tags: editorial insert"
  on public.tags
  for insert
  to authenticated
  with check (app.is_editorial());

create policy "tags: editorial update"
  on public.tags
  for update
  to authenticated
  using (app.is_editorial())
  with check (app.is_editorial());

create policy "tags: admins delete"
  on public.tags
  for delete
  to authenticated
  using (app.is_admin());
