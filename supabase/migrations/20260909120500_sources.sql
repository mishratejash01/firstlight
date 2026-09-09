-- Content sources: the registry of where copy comes from.
--
-- This table is public-readable, because the front end has to credit a wire
-- story by name. Everything commercially sensitive — licence terms, expiry,
-- feed endpoints, ingestion config — lives in source_licences instead.
--
-- The split is deliberate. Row Level Security is row-level, so a single table
-- would force a choice between hiding the source name from readers and
-- exposing licence terms to anyone with an account. Column-level grants cannot
-- resolve it either: 'authenticated' covers every signed-in user, editors and
-- ordinary readers alike, so a grant wide enough for the desk is wide enough
-- for everyone. Two tables, two row policies, no leak.

create table public.sources (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  name text not null,
  origin public.content_origin not null,
  homepage_url text,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sources_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint sources_name_not_blank check (length(btrim(name)) > 0)
);

create index sources_origin_idx on public.sources (origin) where is_active;

create trigger sources_set_updated_at
  before update on public.sources
  for each row execute function app.set_updated_at();

alter table public.sources enable row level security;

create policy "sources: public read active"
  on public.sources
  for select
  to anon, authenticated
  using (is_active);

create policy "sources: editorial read all"
  on public.sources
  for select
  to authenticated
  using (app.is_editorial());

create policy "sources: admins insert"
  on public.sources
  for insert
  to authenticated
  with check (app.is_admin());

create policy "sources: admins update"
  on public.sources
  for update
  to authenticated
  using (app.is_admin())
  with check (app.is_admin());

create policy "sources: admins delete"
  on public.sources
  for delete
  to authenticated
  using (app.is_admin());
