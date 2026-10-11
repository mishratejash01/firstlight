-- Steering: an administrator tells the engine what to cover, and commissions
-- single stories, from the dashboard.
--
-- Two kinds of instruction, each settled in a dialogue first. The engine
-- reads the request, asks whatever it needs to be sure of, and only when it
-- is sure writes down what it understood. That restatement, with a structured
-- copy of the rules in it, is what the desk then obeys: it is loaded into the
-- triage and drafting prompts as the editor's standing instructions, above
-- the house rules, and the hard parts of it (cover only this; this share of
-- the output; never this) are enforced in code as well as in the prompt.
--
-- A standing instruction has a life: it is active from the moment the
-- dialogue closes until its expiry, or until an administrator removes it,
-- and after that it has no effect at all. Nothing is deleted; a removed
-- instruction keeps its transcript so the decision can be read later.

create table public.engine_directives (
  id uuid primary key default extensions.gen_random_uuid(),

  -- drafting: the dialogue is open. active: in force. expired: its time ran
  -- out. deleted: an administrator removed it.
  status text not null default 'drafting'
    check (status in ('drafting', 'active', 'expired', 'deleted')),

  -- What the administrator typed, verbatim.
  prompt text not null,
  -- How long it should hold once active. Null means until removed.
  ttl_hours integer check (ttl_hours is null or ttl_hours between 1 and 8760),

  -- The dialogue: every question the engine asked and every answer given,
  -- in order, so the restatement can be checked against what was said.
  transcript jsonb not null default '[]'::jsonb,
  -- The engine's own statement of what it will do, written once it was sure.
  -- This is the text the desk reads.
  understanding text,
  -- The same instruction as structured rules the code can enforce: mode,
  -- topics and keywords, shares, sections, tone. Shape: lib/engine/directives.
  rules jsonb,

  activated_at timestamptz,
  expires_at timestamptz,
  deleted_at timestamptz,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint engine_directives_prompt_not_blank check (length(btrim(prompt)) > 0)
);

create index engine_directives_active_idx
  on public.engine_directives (activated_at)
  where status = 'active';

create trigger engine_directives_set_updated_at
  before update on public.engine_directives
  for each row execute function app.set_updated_at();

alter table public.engine_directives enable row level security;

-- Administrators only. The engine itself reads with the service role.
create policy "engine_directives: admin read"
  on public.engine_directives for select to authenticated
  using (app.is_admin());

create policy "engine_directives: admin insert"
  on public.engine_directives for insert to authenticated
  with check (app.is_admin());

create policy "engine_directives: admin update"
  on public.engine_directives for update to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- Commissioned stories: one story, asked for by an administrator, with their
-- pictures and their brief, written by the desk ahead of everything else.
-- ---------------------------------------------------------------------------
create table public.commissioned_posts (
  id uuid primary key default extensions.gen_random_uuid(),

  -- drafting: the dialogue is open. queued: brief settled, waiting for the
  -- desk. writing: a desk run has claimed it. done: the article exists.
  -- failed: three attempts failed. deleted: withdrawn.
  status text not null default 'drafting'
    check (status in ('drafting', 'queued', 'writing', 'done', 'failed', 'deleted')),

  prompt text not null,
  -- The administrator's pictures, already in the media library:
  -- [{url, publicId, width, height, alt, caption, credit}].
  images jsonb not null default '[]'::jsonb,

  transcript jsonb not null default '[]'::jsonb,
  understanding text,
  -- The settled brief the writer works from. Shape: lib/engine/commission.
  brief jsonb,

  article_id uuid references public.articles (id) on delete set null,
  attempts integer not null default 0,
  claimed_at timestamptz,
  last_error text,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint commissioned_posts_prompt_not_blank check (length(btrim(prompt)) > 0)
);

create index commissioned_posts_queue_idx
  on public.commissioned_posts (created_at)
  where status in ('queued', 'writing');

create trigger commissioned_posts_set_updated_at
  before update on public.commissioned_posts
  for each row execute function app.set_updated_at();

alter table public.commissioned_posts enable row level security;

create policy "commissioned_posts: admin read"
  on public.commissioned_posts for select to authenticated
  using (app.is_admin());

create policy "commissioned_posts: admin insert"
  on public.commissioned_posts for insert to authenticated
  with check (app.is_admin());

create policy "commissioned_posts: admin update"
  on public.commissioned_posts for update to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- What triage made of each event against the standing instructions, so the
-- writer can order and filter without asking the model again.
-- ---------------------------------------------------------------------------
alter table public.story_events
  add column directive_match boolean,
  add column directive_topic text,
  add column directive_checked_at timestamptz;

-- An instruction past its time is marked so, so the dashboard shows it as
-- over. The engine already ignores it from the moment expires_at passes;
-- this only keeps the record honest.
select cron.schedule(
  'expire-directives',
  '*/5 * * * *',
  $$update public.engine_directives
       set status = 'expired'
     where status = 'active'
       and expires_at is not null
       and expires_at < now()$$
);
