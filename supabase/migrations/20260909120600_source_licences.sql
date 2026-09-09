-- Licence terms and ingestion config for a source. Never public.
--
-- One row per source, split out so that Row Level Security can hide the whole
-- row from readers while sources.name stays visible for attribution. Nothing
-- in this table is ever selected by the public site.
--
-- allow_full_text is the field that carries legal weight: when false, only a
-- summary and a link may be published from that source. The articles table
-- enforces that with a database constraint rather than trusting the editor UI.

create table public.source_licences (
  source_id uuid primary key references public.sources (id) on delete cascade,

  -- Ingestion. Only meaningful for sources with origin = 'wire'.
  feed_url text,
  feed_format text,
  -- Per-feed knobs: subject-code mappings, poll interval, header names.
  -- Never store credentials here — those belong in environment variables.
  ingest_config jsonb not null default '{}'::jsonb,
  last_ingested_at timestamptz,
  last_ingest_error text,

  -- Contract.
  licence_holder text,
  licence_terms text,
  licence_starts_at timestamptz,
  licence_expires_at timestamptz,
  allow_full_text boolean not null default false,
  attribution_required boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger source_licences_set_updated_at
  before update on public.source_licences
  for each row execute function app.set_updated_at();

alter table public.source_licences enable row level security;

-- No anon policy of any kind: anonymous readers cannot reach this table at all.
-- Editors need to see terms to know what they may publish.
create policy "source_licences: editorial read"
  on public.source_licences
  for select
  to authenticated
  using (app.is_editorial());

-- Signing a licence is an admin act.
create policy "source_licences: admins insert"
  on public.source_licences
  for insert
  to authenticated
  with check (app.is_admin());

create policy "source_licences: admins update"
  on public.source_licences
  for update
  to authenticated
  using (app.is_admin())
  with check (app.is_admin());

create policy "source_licences: admins delete"
  on public.source_licences
  for delete
  to authenticated
  using (app.is_admin());
