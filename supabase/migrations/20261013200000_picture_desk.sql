-- The picture desk: every choice of picture is recorded with the candidates
-- it was chosen from and the judge's scores, so an administrator can see why
-- a story got the picture it did and mark it good or bad.
create table public.picture_decisions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  headline text not null,
  section text,
  story_kind text,
  outcome text not null check (outcome in ('photo', 'logo', 'map', 'card', 'none', 'unjudged')),
  reason text,
  judged_by text,
  candidates jsonb not null default '[]'::jsonb,
  chosen jsonb,
  ms integer,
  article_id uuid references public.articles (id) on delete set null,
  admin_verdict text check (admin_verdict in ('good', 'bad')),
  admin_note text
);

create index picture_decisions_created_idx on public.picture_decisions (created_at desc);
create index picture_decisions_article_idx on public.picture_decisions (article_id) where article_id is not null;

alter table public.picture_decisions enable row level security;

create policy "picture_decisions: admin read"
  on public.picture_decisions for select to authenticated
  using (app.is_admin());

create policy "picture_decisions: admin update"
  on public.picture_decisions for update to authenticated
  using (app.is_admin()) with check (app.is_admin());

insert into public.site_settings (key, value, description) values
  ('picture_desk_enabled', 'true'::jsonb, 'Whether the picture desk (candidates + vision judge) chooses pictures; off falls back to the old ladder.'),
  ('picture_min_score', '7'::jsonb, 'The lowest relevance score (0-10) the judge may run a picture at.'),
  ('picture_judge_daily_cap', '500'::jsonb, 'The most judge calls in a day; beyond it the old ladder is used.')
on conflict (key) do nothing;
-- Stage timings and counts for each decision, so slow or empty gathering can be seen.
alter table public.picture_decisions add column if not exists trace jsonb;
