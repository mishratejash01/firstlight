-- Partner desk: stories the engine writes for a partner site and posts into that site's own
-- backend (first partner: karostartup.com, 4 Nov 2026). One row per attempt, so the daily cap,
-- the spacing between posts and the reasons for skipping are all answerable from here.

create table if not exists public.partner_posts (
  id uuid primary key default gen_random_uuid(),
  partner text not null,
  event_id uuid references public.story_events(id) on delete set null,
  -- The row in the partner's database, once posted.
  remote_id uuid,
  slug text,
  headline text not null,
  category text,
  kicker text,
  status text not null check (status in ('written', 'published', 'failed', 'skipped')),
  is_breaking boolean not null default false,
  cover_url text,
  reason text,
  model_id text,
  trace jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

-- One attempt per event per partner; a skipped event may be offered again later.
create unique index if not exists partner_posts_partner_event_idx
  on public.partner_posts (partner, event_id) where event_id is not null and status <> 'skipped';
create index if not exists partner_posts_partner_created_idx
  on public.partner_posts (partner, created_at desc);

alter table public.partner_posts enable row level security;

drop policy if exists "Admins read partner posts" on public.partner_posts;
create policy "Admins read partner posts" on public.partner_posts
  for select to authenticated using (app.is_admin());

-- The desk's lease, like the other engine passes.
insert into public.engine_locks (name) values ('partner-karostartup') on conflict do nothing;
