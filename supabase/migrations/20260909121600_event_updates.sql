-- Individual updates within an event hub.
--
-- Each row becomes one liveBlogUpdate in the hub's LiveBlogPosting markup and
-- one deep-linkable block in the page. The anchor is what makes a narrow
-- search land on the specific development rather than the top of the page, so
-- it is stored, stable and unique per event — never derived at render time,
-- which would break every inbound link the moment ordering changed.

create table public.event_updates (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null references public.news_events (id) on delete cascade,

  -- Deep-link fragment, e.g. 'update-14-32' -> /live/<slug>#update-14-32.
  anchor text not null,

  headline text not null,
  body text not null,

  -- Key updates are the ones worth surfacing in a summary rail or a Top
  -- Stories-style card; routine incremental notes are not.
  is_key_update boolean not null default false,

  author_id uuid references public.authors (id) on delete set null,
  published_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (event_id, anchor),
  constraint event_updates_anchor_format check (anchor ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint event_updates_headline_not_blank check (length(btrim(headline)) > 0),
  constraint event_updates_body_not_blank check (length(btrim(body)) > 0)
);

-- The hub renders newest-first and the schema markup oldest-first, so both
-- directions are served by this one index.
create index event_updates_timeline_idx
  on public.event_updates (event_id, published_at desc);

create trigger event_updates_set_updated_at
  before update on public.event_updates
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Anchor assignment.
--
-- Derived from the publication time — 'update-14-32' for 14:32 — because that
-- is what a reader sharing a link expects to see. Two updates in the same
-- minute get a numeric suffix rather than colliding.
-- ---------------------------------------------------------------------------
create or replace function app.assign_event_update_anchor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_anchor text;
  candidate text;
  suffix integer := 1;
begin
  if new.anchor is not null and length(btrim(new.anchor)) > 0 then
    return new;
  end if;

  base_anchor := 'update-' || to_char(new.published_at at time zone 'UTC', 'HH24-MI');
  candidate := base_anchor;

  while exists (
    select 1 from public.event_updates
     where event_id = new.event_id and anchor = candidate
  ) loop
    suffix := suffix + 1;
    candidate := base_anchor || '-' || suffix::text;
  end loop;

  new.anchor := candidate;
  return new;
end;
$$;

-- anchor is NOT NULL, so the trigger has to supply a value before the
-- constraint is checked; a BEFORE trigger runs early enough.
alter table public.event_updates alter column anchor drop not null;

create trigger event_updates_assign_anchor
  before insert on public.event_updates
  for each row execute function app.assign_event_update_anchor();

alter table public.event_updates enable row level security;

-- An update is visible exactly when its hub is, and never before its own
-- timestamp — which is what makes scheduling an embargoed update safe.
create policy "event_updates: anon read published"
  on public.event_updates
  for select
  to anon
  using (
    published_at <= now()
    and exists (
      select 1 from public.news_events e
      where e.id = event_id
        and e.status in ('developing', 'concluded')
        and e.published_at is not null
        and e.published_at <= now()
    )
  );

create policy "event_updates: read"
  on public.event_updates
  for select
  to authenticated
  using (
    app.is_editorial()
    or (
      published_at <= now()
      and exists (
        select 1 from public.news_events e
        where e.id = event_id
          and e.status in ('developing', 'concluded')
          and e.published_at is not null
          and e.published_at <= now()
      )
    )
  );

create policy "event_updates: editorial insert"
  on public.event_updates
  for insert
  to authenticated
  with check (app.is_editorial());

create policy "event_updates: editorial update"
  on public.event_updates
  for update
  to authenticated
  using (app.is_editorial())
  with check (app.is_editorial());

create policy "event_updates: editorial delete"
  on public.event_updates
  for delete
  to authenticated
  using (app.is_editorial());
