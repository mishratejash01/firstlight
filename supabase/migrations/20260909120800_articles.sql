-- Articles.
--
-- Publication timing is governed by published_at, not by a background worker.
-- The public read policy admits a row once published_at has passed, so a
-- scheduled story goes live on time even if every worker in the system is
-- down. Relabelling 'scheduled' to 'published' afterwards is cosmetic, not
-- load-bearing.

create table public.articles (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,

  status public.article_status not null default 'draft',
  origin public.content_origin not null default 'original',

  source_id uuid references public.sources (id) on delete restrict,
  category_id uuid not null references public.categories (id) on delete restrict,
  author_id uuid references public.authors (id) on delete set null,

  headline text not null,
  -- The one-line dek that sits under the headline on the homepage.
  standfirst text,
  -- Body copy. Null for curated items by constraint: see below.
  body text,
  -- Short original summary. Doubles as the reviewer's précis in the queue and,
  -- for curated items, as the entire published text.
  summary text,

  -- Curated aggregation. attribution_url points at the outlet that did the
  -- reporting; publishing a curated item without it is a constraint violation,
  -- not a style lapse.
  attribution_url text,
  attribution_label text,

  hero_image_url text,
  hero_image_alt text,
  hero_image_credit text,

  -- Null until first published. Once set, it is the authority on visibility.
  published_at timestamptz,
  -- Retained for display and audit; published_at is what actually gates access.
  scheduled_for timestamptz,

  -- Drives the single permitted use of the signal colour. Editors are expected
  -- to clear it; nothing stays breaking for long.
  is_breaking boolean not null default false,

  -- Denormalised counter fed by reading_events, used by the trending term of
  -- the recommendation query. Approximate by design — it is a ranking input,
  -- not an analytics figure.
  read_count bigint not null default 0,

  meta_title text,
  meta_description text,
  canonical_url text,

  -- Editorial transparency: set when any AI assist touched this draft. AI never
  -- publishes, so this is a provenance record, not a permission.
  ai_assisted boolean not null default false,

  created_by uuid references auth.users (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Weighted search vector: a headline match should outrank a body match.
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(headline, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(standfirst, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'C')
  ) stored,

  constraint articles_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint articles_headline_not_blank check (length(btrim(headline)) > 0),

  -- Curated aggregation must be a summary plus a link, never a reproduction.
  -- There is deliberately no way to store full text on a curated row, so an
  -- editor cannot paste another outlet's article in by accident.
  constraint articles_curated_shape check (
    origin <> 'curated'
    or (attribution_url is not null and summary is not null and body is null)
  ),

  -- Anything publicly visible must have a publication timestamp.
  constraint articles_published_needs_timestamp check (
    status not in ('published', 'scheduled') or published_at is not null
  ),

  -- Wire copy must name its source, so licence terms are always resolvable.
  constraint articles_wire_needs_source check (
    origin <> 'wire' or source_id is not null
  )
);

-- Public feeds: the homepage, section fronts and sitemaps all read in this
-- shape, so the index is partial and ordered to match.
create index articles_public_feed_idx
  on public.articles (published_at desc)
  where status in ('published', 'scheduled');

create index articles_section_feed_idx
  on public.articles (category_id, published_at desc)
  where status in ('published', 'scheduled');

create index articles_author_feed_idx
  on public.articles (author_id, published_at desc)
  where status in ('published', 'scheduled');

-- The editor review queue reads by status and recency.
create index articles_review_queue_idx on public.articles (status, updated_at desc);
create index articles_created_by_idx on public.articles (created_by);
-- Foreign key covering indexes: without these, deleting a source or a
-- reviewer's account scans the whole articles table.
create index articles_source_id_idx on public.articles (source_id);
create index articles_reviewed_by_idx on public.articles (reviewed_by);
create index articles_search_idx on public.articles using gin (search_vector);

create trigger articles_set_updated_at
  before update on public.articles
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Licence enforcement.
--
-- A CHECK constraint cannot read another table, so the "may we reproduce full
-- text from this wire source" rule lives in a trigger. This is a legal
-- guarantee, not a UI convenience: it holds regardless of which dashboard,
-- script or ingestion worker performed the write.
-- ---------------------------------------------------------------------------
create or replace function app.enforce_wire_licence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  may_reproduce boolean;
begin
  if new.origin <> 'wire' or new.body is null then
    return new;
  end if;

  select l.allow_full_text
    into may_reproduce
    from public.source_licences l
   where l.source_id = new.source_id;

  if coalesce(may_reproduce, false) is false then
    raise exception
      'Source % does not license full-text reproduction; store a summary and an attribution link instead.',
      new.source_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger articles_enforce_wire_licence
  before insert or update of body, origin, source_id on public.articles
  for each row execute function app.enforce_wire_licence();

-- ---------------------------------------------------------------------------
-- Authorship helper. Resolves the caller to their byline row, so article
-- policies can talk about "my articles" without every policy re-joining
-- authors.
-- ---------------------------------------------------------------------------
create or replace function app.current_author_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.authors where user_id = (select auth.uid());
$$;

grant execute on function app.current_author_id() to authenticated;

alter table public.articles enable row level security;

-- ---------------------------------------------------------------------------
-- Policies
--
-- One permissive policy per role per action. Postgres ORs permissive policies
-- and evaluates each per row, so the role branches are folded into single
-- expressions rather than split into separate policies for readability.
--
-- The rule that matters most: an author can never move a row into 'published'.
-- USING says which rows they may touch, WITH CHECK says what those rows are
-- allowed to become, and neither admits a published state.
-- ---------------------------------------------------------------------------

-- The public site. 'scheduled' is admitted once its timestamp has passed; see
-- the note at the top of this file.
create policy "articles: anon read published"
  on public.articles
  for select
  to anon
  using (
    status in ('published', 'scheduled')
    and published_at is not null
    and published_at <= now()
  );

-- Signed-in readers see the same public set; the desk sees everything; a
-- contributor additionally sees their own work at every stage, including
-- rejected drafts.
create policy "articles: read"
  on public.articles
  for select
  to authenticated
  using (
    (
      status in ('published', 'scheduled')
      and published_at is not null
      and published_at <= now()
    )
    or app.is_editorial()
    or (select auth.uid()) = created_by
  );

-- Editors file anything. Contributors file only their own work, and only in a
-- pre-publication state.
create policy "articles: insert"
  on public.articles
  for insert
  to authenticated
  with check (
    app.is_editorial()
    or (
      app.has_role('author')
      and (select auth.uid()) = created_by
      and status in ('draft', 'in_review')
    )
  );

-- Authors may keep editing until an editor takes the piece, and may resubmit
-- after a rejection. They cannot reach back into something already published.
create policy "articles: update"
  on public.articles
  for update
  to authenticated
  using (
    app.is_editorial()
    or (
      (select auth.uid()) = created_by
      and status in ('draft', 'in_review', 'rejected')
    )
  )
  with check (
    app.is_editorial()
    or (
      (select auth.uid()) = created_by
      and status in ('draft', 'in_review')
    )
  );

-- Published work is archived, not deleted. An author may discard an untouched
-- draft of their own; anything further is an admin act.
create policy "articles: delete"
  on public.articles
  for delete
  to authenticated
  using (
    app.is_admin()
    or ((select auth.uid()) = created_by and status = 'draft')
  );
