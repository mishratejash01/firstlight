-- Sections. The single source of truth for site navigation.
--
-- The navbar renders whatever this table says: adding a row with
-- show_in_nav = true puts a new section in the header with no code change and
-- no deploy. Nothing about navigation is hardcoded in a component.
--
-- Each row carries its IPTC Media Topics qcode where one exists, so licensed
-- wire content can be routed to a section by matching the feed's own subject
-- codes instead of by guessing from the headline.

create table public.categories (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,

  -- Canonical IPTC identifiers. Null for house sections that are genuinely not
  -- IPTC media topics — 'Opinion' is a genre, 'World' is a geographic scope —
  -- rather than inventing fake qcodes for them.
  iptc_qcode text unique,
  iptc_label text,

  sort_order integer not null default 0,
  -- is_active takes a section out of circulation entirely; show_in_nav keeps it
  -- addressable but out of the header, which is how the long-tail IPTC sections
  -- stay available to wire ingestion without cluttering navigation.
  is_active boolean not null default true,
  show_in_nav boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index categories_nav_idx
  on public.categories (sort_order)
  where is_active and show_in_nav;

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function app.set_updated_at();

alter table public.categories enable row level security;

-- Sections are public information: the navbar has to render for logged-out
-- readers. Inactive sections stay hidden from the public.
create policy "categories: public read active"
  on public.categories
  for select
  to anon, authenticated
  using (is_active);

-- The desk needs to see inactive sections to bring them back.
create policy "categories: editorial read all"
  on public.categories
  for select
  to authenticated
  using (app.is_editorial());

-- Changing the shape of the site is an admin action, not an editor one.
create policy "categories: admins insert"
  on public.categories
  for insert
  to authenticated
  with check (app.is_admin());

create policy "categories: admins update"
  on public.categories
  for update
  to authenticated
  using (app.is_admin())
  with check (app.is_admin());

create policy "categories: admins delete"
  on public.categories
  for delete
  to authenticated
  using (app.is_admin());
