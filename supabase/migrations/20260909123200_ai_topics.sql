-- Autonomous drafting: the topic list and its controls.
--
-- The scheduler works through this table. Each row is a standing brief — a
-- subject the newsroom wants covered, how often, and in which section.
--
-- Everything here that looks like a safety rail (the daily cap, the cadence,
-- the kill switch in site_settings) is there for operational reasons rather
-- than editorial ones: a scheduler with no ceiling is an unbounded bill and an
-- unbounded number of pages, and a scheduler with no off switch cannot be
-- stopped without a deploy.

create table public.ai_topics (
  id uuid primary key default extensions.gen_random_uuid(),

  topic text not null,
  angle text,
  category_id uuid not null references public.categories (id) on delete cascade,

  -- Minimum gap before this topic may be written about again. Without it the
  -- scheduler would file the same story every run and the site would fill with
  -- near-duplicates of itself.
  cadence_hours integer not null default 24,

  is_active boolean not null default true,

  last_generated_at timestamptz,
  times_generated integer not null default 0,
  last_error text,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ai_topics_topic_not_blank check (length(btrim(topic)) > 0),
  constraint ai_topics_cadence_sane check (cadence_hours between 1 and 8760)
);

create index ai_topics_due_idx
  on public.ai_topics (last_generated_at nulls first)
  where is_active;

create trigger ai_topics_set_updated_at
  before update on public.ai_topics
  for each row execute function app.set_updated_at();

alter table public.ai_topics enable row level security;

create policy "ai_topics: editorial read"
  on public.ai_topics for select to authenticated
  using (app.is_editorial());

create policy "ai_topics: editorial insert"
  on public.ai_topics for insert to authenticated
  with check (app.is_editorial());

create policy "ai_topics: editorial update"
  on public.ai_topics for update to authenticated
  using (app.is_editorial()) with check (app.is_editorial());

create policy "ai_topics: editorial delete"
  on public.ai_topics for delete to authenticated
  using (app.is_editorial());

-- ---------------------------------------------------------------------------
-- Site settings.
--
-- A tiny key/value table, existing mainly so the autonomous publisher can be
-- switched off from the dashboard. A kill switch that requires a code change
-- and a deploy is not a kill switch.
-- ---------------------------------------------------------------------------
create table public.site_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function app.set_updated_at();

alter table public.site_settings enable row level security;

create policy "site_settings: editorial read"
  on public.site_settings for select to authenticated
  using (app.is_editorial());

create policy "site_settings: admins write"
  on public.site_settings for update to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy "site_settings: admins insert"
  on public.site_settings for insert to authenticated
  with check (app.is_admin());

insert into public.site_settings (key, value, description) values
  (
    'autonomous_publishing_enabled',
    'false'::jsonb,
    'When true, the scheduler publishes AI-written articles directly to the live site with no human review. Off by default: turning it on is a decision that should be made deliberately, not inherited from a migration.'
  ),
  (
    'autonomous_daily_limit',
    '6'::jsonb,
    'Maximum articles the scheduler may publish in any 24 hours. Caps both the model spend and the number of pages published without review.'
  ),
  (
    'autonomous_publish_delay_minutes',
    '0'::jsonb,
    'Minutes into the future that autonomously published articles are timestamped. Above zero, an editor has that long to pull a piece before it becomes visible.'
  )
on conflict (key) do nothing;
