-- Version history.
--
-- Written by a trigger rather than by the editor UI, so history is complete by
-- construction: a change made by a script, an ingestion worker or a direct SQL
-- fix is recorded exactly like one made in the dashboard. A newsroom needs to
-- be able to say who changed a published sentence and when.

create table public.article_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,
  version_number integer not null,

  -- Extracted for cheap display in the history list without parsing json.
  headline text,
  standfirst text,
  body text,
  summary text,
  status public.article_status,

  -- The complete previous row, so a version can be restored in full even after
  -- columns are added to articles.
  snapshot jsonb not null,

  -- Who made the change that produced this version, and why.
  changed_by uuid references auth.users (id) on delete set null,
  change_note text,
  created_at timestamptz not null default now(),

  unique (article_id, version_number)
);

create index article_versions_article_idx
  on public.article_versions (article_id, version_number desc);

-- ---------------------------------------------------------------------------
-- Snapshot trigger.
--
-- Fires BEFORE UPDATE and stores the row as it was, so version N is the state
-- prior to the Nth edit. SECURITY DEFINER because an author has no insert
-- rights on this table and must not be able to file without leaving a trail.
--
-- Edits that touch none of the editorial fields — a read_count bump, for
-- instance — are skipped, so the history is not drowned in traffic noise.
-- ---------------------------------------------------------------------------
create or replace function app.snapshot_article_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
begin
  if old.headline is not distinct from new.headline
     and old.standfirst is not distinct from new.standfirst
     and old.body is not distinct from new.body
     and old.summary is not distinct from new.summary
     and old.status is not distinct from new.status
     and old.category_id is not distinct from new.category_id
     and old.hero_image_url is not distinct from new.hero_image_url
  then
    return new;
  end if;

  select coalesce(max(version_number), 0) + 1
    into next_version
    from public.article_versions
   where article_id = old.id;

  insert into public.article_versions (
    article_id, version_number, headline, standfirst, body, summary, status,
    snapshot, changed_by
  )
  values (
    old.id, next_version, old.headline, old.standfirst, old.body, old.summary,
    old.status, to_jsonb(old), (select auth.uid())
  );

  return new;
end;
$$;

create trigger articles_snapshot_version
  before update on public.articles
  for each row execute function app.snapshot_article_version();

alter table public.article_versions enable row level security;

-- History is an editorial record, never public. Authors may review the history
-- of their own copy so they can see what the desk changed.
create policy "article_versions: read"
  on public.article_versions
  for select
  to authenticated
  using (
    app.is_editorial()
    or exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.created_by = (select auth.uid())
    )
  );

-- No insert, update or delete policy at all. The trigger is the only writer,
-- and it is SECURITY DEFINER, so history cannot be forged or rewritten from
-- the API by anyone — editors and admins included.
