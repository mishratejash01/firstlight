-- Editorial control of the front page.
--
-- The homepage is ranked algorithmically by default. A row here overrides that
-- ranking for one slot: it is how an editor says "this is the splash, whatever
-- the numbers say". Judgement beats the recommendation query, always.
--
-- Placements expire. An editor pinning a story at 6am should not still be
-- holding the hero slot at midnight because they forgot, so expires_at is part
-- of the shape rather than an afterthought.

create table public.homepage_placements (
  id uuid primary key default extensions.gen_random_uuid(),

  -- 'hero'    — the dominant story, position 1 only
  -- 'rail'    — the secondary headline rail beside the hero
  -- 'section' — a slot on one category shelf; category_id is then required
  zone text not null,
  category_id uuid references public.categories (id) on delete cascade,
  position integer not null default 1,

  article_id uuid not null references public.articles (id) on delete cascade,

  pinned_by uuid references auth.users (id) on delete set null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint homepage_placements_zone_valid check (zone in ('hero', 'rail', 'section')),
  constraint homepage_placements_position_positive check (position >= 1),
  constraint homepage_placements_hero_single_slot check (zone <> 'hero' or position = 1),
  -- A section slot without a section is meaningless; a hero or rail slot with
  -- one is ambiguous.
  constraint homepage_placements_section_scope check (
    (zone = 'section' and category_id is not null)
    or (zone <> 'section' and category_id is null)
  ),
  constraint homepage_placements_window check (
    expires_at is null or expires_at > starts_at
  )
);

-- One article per slot. category_id is coalesced because SQL nulls do not
-- collide in a unique index, which would otherwise allow two heroes.
create unique index homepage_placements_slot_key
  on public.homepage_placements (
    zone,
    coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    position
  );

-- The homepage reads live placements on every render.
create index homepage_placements_live_idx
  on public.homepage_placements (zone, position, starts_at, expires_at);

create trigger homepage_placements_set_updated_at
  before update on public.homepage_placements
  for each row execute function app.set_updated_at();

alter table public.homepage_placements enable row level security;

-- Readers need to see live placements — that is what renders the front page —
-- but only the ones currently in their window.
create policy "homepage_placements: anon read live"
  on public.homepage_placements
  for select
  to anon
  using (starts_at <= now() and (expires_at is null or expires_at > now()));

create policy "homepage_placements: read"
  on public.homepage_placements
  for select
  to authenticated
  using (
    app.is_editorial()
    or (starts_at <= now() and (expires_at is null or expires_at > now()))
  );

-- Curation is the desk's job.
create policy "homepage_placements: editorial insert"
  on public.homepage_placements
  for insert
  to authenticated
  with check (app.is_editorial());

create policy "homepage_placements: editorial update"
  on public.homepage_placements
  for update
  to authenticated
  using (app.is_editorial())
  with check (app.is_editorial());

create policy "homepage_placements: editorial delete"
  on public.homepage_placements
  for delete
  to authenticated
  using (app.is_editorial());
