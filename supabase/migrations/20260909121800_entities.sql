-- Named entities: the specific people, organisations and places a story is
-- actually about.
--
-- This is what lets a narrow search match a paragraph rather than a headline.
-- "Officials announced changes" is unindexable; a marked-up Person with a
-- sameAs link to their Wikidata record is not.
--
-- same_as carries authority URLs (Wikidata, Wikipedia, an official site) and
-- becomes schema.org sameAs, which is how a search engine resolves "Smith" to
-- the right Smith.

create table public.entities (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  name text not null,

  -- Mirrors schema.org types so the value can be emitted directly into JSON-LD
  -- with no mapping table.
  entity_type text not null,

  description text,
  -- e.g. ["https://www.wikidata.org/wiki/Q7259", "https://example.gov/minister"]
  same_as jsonb not null default '[]'::jsonb,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint entities_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint entities_name_not_blank check (length(btrim(name)) > 0),
  constraint entities_type_valid check (
    entity_type in ('Person', 'Organization', 'Place', 'Product', 'Event', 'CreativeWork', 'GovernmentOrganization')
  ),
  constraint entities_same_as_is_array check (jsonb_typeof(same_as) = 'array')
);

create index entities_type_idx on public.entities (entity_type) where is_active;

create trigger entities_set_updated_at
  before update on public.entities
  for each row execute function app.set_updated_at();

alter table public.entities enable row level security;

create policy "entities: anon read active"
  on public.entities for select to anon using (is_active);
create policy "entities: read"
  on public.entities for select to authenticated using (is_active or app.is_editorial());
create policy "entities: editorial insert"
  on public.entities for insert to authenticated with check (app.is_editorial());
create policy "entities: editorial update"
  on public.entities for update to authenticated using (app.is_editorial()) with check (app.is_editorial());
create policy "entities: admins delete"
  on public.entities for delete to authenticated using (app.is_admin());
