-- Uploaded media.
--
-- Cloudinary holds the file; this table holds the record of it. Without one,
-- the only inventory of what the newsroom has uploaded lives in a third-party
-- account, which makes "who added this image, to which story, and may we still
-- use it?" unanswerable — and deleting an orphaned asset guesswork.
--
-- public_id is Cloudinary's handle for the file and is what deletion and
-- transformation are addressed by, so it is stored rather than parsed back out
-- of the URL later.

create table public.media_assets (
  id uuid primary key default extensions.gen_random_uuid(),

  public_id text not null unique,
  secure_url text not null,
  resource_type text not null,
  format text,
  width integer,
  height integer,
  bytes bigint,
  duration numeric,

  -- Editorial metadata. alt_text matters: an image published without it is
  -- inaccessible, and the editor UI asks for it at upload time rather than
  -- hoping someone adds it later.
  alt_text text,
  credit text,
  caption text,

  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint media_assets_resource_type_valid
    check (resource_type in ('image', 'video', 'raw'))
);

create index media_assets_uploaded_by_idx on public.media_assets (uploaded_by, created_at desc);
create index media_assets_recent_idx on public.media_assets (created_at desc);

alter table public.media_assets enable row level security;

-- Anyone may read the record: these files are already served publicly from
-- Cloudinary, so hiding the row would protect nothing while breaking captions
-- and credits on published pages.
create policy "media_assets: anon read"
  on public.media_assets for select to anon using (true);

create policy "media_assets: read"
  on public.media_assets for select to authenticated using (true);

-- Uploading is for people who write. A reader account cannot put files into the
-- newsroom's media account.
create policy "media_assets: contributors insert"
  on public.media_assets for insert to authenticated
  with check (
    (app.is_editorial() or app.has_role('author'))
    and uploaded_by = (select auth.uid())
  );

create policy "media_assets: update"
  on public.media_assets for update to authenticated
  using (app.is_editorial() or uploaded_by = (select auth.uid()))
  with check (app.is_editorial() or uploaded_by = (select auth.uid()));

create policy "media_assets: editorial delete"
  on public.media_assets for delete to authenticated
  using (app.is_editorial());
