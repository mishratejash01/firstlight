@AGENTS.md

# Current state — read this first (updated 4 Nov 2026)

Where this section disagrees with the original spec further down, this section wins. It
replaces the notes a previous session kept on one Mac. Nothing here is a secret.

## The site
- **The India Decade** — canonical https://www.theindiadecade.com (the bare domain 308s to www;
  other hosts send noindex). Use the name only through `SITE_NAME` in `src/lib/site.ts`; it has
  been renamed twice before.
- Repo `github.com/mishratejash01/firstlight` (private). **Every push to `main` deploys to
  production.**
- **Hosting: our own VPS** (Hostinger, Ubuntu, 8 vCPU / 32 GB / 390 GB, IP 62.72.29.5, Mumbai).
  Vercel is no longer used. The box also runs the owner's other projects (Quiz Space, Jitsi,
  a Quiz Space database standby in `/srv/supabase-standby`): never touch those.
  - Caddy terminates HTTPS and redirects the bare domain to www. PM2 runs the app as user `app`.
  - www.theindiadecade.tech is a second domain on the same server. With `CANONICAL_REDIRECT=1`
    its pages redirect to the .com; its API routes still answer. Redirects are built with
    `publicOrigin()` (`src/lib/auth/origin.ts`); it trusts only SITE_URL and `SITE_ALIAS_ORIGINS`.
  - The GitHub Action `.github/workflows/deploy.yml` SSHes in with a key that can only run
    `/srv/tid/deploy.sh`. That script builds each commit in `/srv/tid/releases/<sha>`
    (`npm ci`, so the lockfile must carry every platform's optional packages: resolve it with the
    server's npm, `npx npm@11 install --package-lock-only`), repoints `/srv/tid/current`, reloads
    PM2 and keeps three releases.
  - Secrets on the server are in `/srv/tid/shared/.env.local`. Admin login is by SSH key only.

## The backend: our own Supabase on the VPS (since 4 Nov 2026)
- The cloud project `jjucyhrrlntziuwesvfw` is **retired**: on the Free plan it was restricted for
  exceeding the 500 MB size quota (the engine had been dead since 28 Oct). Its cron jobs are
  paused; nothing points at it. Its Management API token still works for reading it.
- The backend now runs in Docker Compose at `/srv/tid-db` (root, `.env` mode 600 holds the
  Postgres password, the JWT secret and the anon/service_role JWTs): `supabase/postgres:17.6.1.166`
  (pgvector, pg_cron, pg_net, vault; `shm_size: 2g`, 2 GB shared buffers), PostgREST v14
  (`public` schema, 1000 rows a page, `public,extensions` on the search path) and GoTrue v2.197
  (Google sign-in only, as before). No Storage, Realtime, Studio or Edge Functions: the site never
  used them. Nightly dumps: `/srv/tid-db/backup.sh` (root crontab 21:20 UTC) into
  `/srv/tid-db/backups`, seven kept; `restore.sh` restores one.
- Caddy serves it as **https://api.theindiadecade.com** (`/rest/v1` → PostgREST on 127.0.0.1:3110,
  `/auth/v1` → GoTrue on 127.0.0.1:9999); DNS-only at Cloudflare. The app's
  `NEXT_PUBLIC_SUPABASE_URL` is that host; the keys are the JWTs from `/srv/tid-db/.env`
  (`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`…_PUBLISHABLE_KEY` = anon, `SUPABASE_SERVICE_ROLE_KEY`/
  `SUPABASE_SECRET_KEY` = service_role). `.env.local` on the Mac points at the same host.
- **SQL runs through psql on the box**: `docker exec -i tid-db psql -h localhost -U postgres -d
  postgres -At < file.sql` (the Management API no longer applies). Migrations in
  `supabase/migrations/` are applied the same way. Types: `supabase gen types typescript --db-url`
  through an SSH tunnel to 127.0.0.1:5434 needs Docker on the Mac; until then edit
  `database.types.ts` by hand in the generated shape.
- The engine's schedule lives in pg_cron inside that database (20 jobs; the list is in the
  cron section of `/srv/tid-db/post-restore.sql`). `app.engine_call()` reads the secret from
  vault (`engine_cron_secret` = `CRON_SECRET`) and `site_settings.engine_base_url`
  (https://engine.theindiadecade.com). Engine jobs return `x-cpu-ms` / `x-wall-ms`, which
  `net._http_response` stores.
- **Embeddings run inside the app** (`src/lib/engine/embeddings.ts`): gte-small through
  `@huggingface/transformers`, fp32, mean pooling, normalised; identical to what the retired edge
  function produced (cosine 0.999+ against stored vectors). Weights are fetched once into
  `EMBEDDINGS_CACHE_DIR` (`/srv/tid/shared/transformers-cache`). `next.config.ts` lists the
  package in `serverExternalPackages`.
- With no per-request billing anywhere, the old Vercel Hobby rules below are only good practice.
  What still matters is CPU on the box: the two expensive queries are the vector match and the
  centroid upserts (HNSW index on `story_events.centroid`).

## The owner's standing rules
- **One file per commit.** Conventional prefixes. **No Claude/AI co-author trailer or AI note in
  any commit or PR.** Rebase before pushing. Push in batches: every push is a deploy, and every
  deploy re-renders cached pages against the Hobby limits.
- **Tell the owner before changing the database** (schema, settings, cron, data) beyond what a task they set requires. Never delete or
  unpublish a live article. A backlog clear sets `story_events.status='rejected'` and nothing else.
- Never tell readers that stories are AI-written, and never claim human review that did not happen.
  Never invent a byline: stories without a writer are credited to the paper.
- Pictures must be licensed (Wikimedia Commons, Openverse and similar, with full credit). Never use
  Google Images. Photos the owner supplies are credited "Special arrangement".
- When figures conflict, use the latest attributed one. Never print an organiser's old and new
  numbers side by side.
- Never call Google Analytics "essential". Don't spend LLM API calls on tests.
- Ask before running GitHub Actions as an always-on worker; their terms forbid it.

## Caching rules (written for Vercel Hobby; still the practice on the VPS)
- Limits per rolling 30 days: **4 h Active CPU**, **200K ISR write units**, 1M invocations, 10 GB
  Fast Origin Transfer. Going over stops that feature for 30 days, which is how the previous
  project died.
- **Never render anything time-dependent or site-wide-fresh into a cached page.** The date, "x min
  ago", the latest headlines, the breaking banner and the section hover panels all come from
  `/api/headlines` and the browser (`src/components/site/live-headlines.tsx`, `live-dateline.tsx`,
  `src/components/article/time-ago.tsx`). The front page alone renders its banner on the server.
- Refresh times: front page 180 s, sections 300 s, bulletin 300 s, breaking 120 s; articles, topic
  and author pages and the root layout 3600 s. A desk edit rebuilds a story at once
  (`revalidateStory`). After a direct database edit, call
  `POST /api/revalidate` with `Authorization: Bearer $CRON_SECRET` and `{"paths": [...]}`.
- Engine jobs return `x-cpu-ms` / `x-wall-ms`, which `net._http_response` stores. The engine's
  budget is about 40 min of CPU a day. `engine-pulse-fast` runs every 2 min (was 1, changed 2 Oct).

## The engine (the news pipeline)
- Running since 2 Oct 2026, 06:56 IST: `site_settings.engine_base_url` is
  https://www.theindiadecade.com. Auto-write and autonomous publishing are on, with a 5-minute
  publish delay. **Since 4 Nov `autonomous_daily_limit` is 20** (a rolling 24 h, the owner's
  temporary cap); the hourly limit stays 0 (none).
- **`engine_learning_enabled` must stay false** until the old drip learner is removed from
  `src/lib/engine/pulse.ts`, because that learner wrecked the weights. Weights are back on
  version 4 (`model_versions` id 8).
- The scorer reads `engine_event_aggregates_json` / `engine_entity_baselines_json`; the old
  thousand-row PostgREST cap is gone.
- **Breaking:** the desk sets `is_breaking` when triage says "breaking" and the story was first seen
  within 3 h. The `expire-breaking` cron clears it after 6 h, and the banner shows 6 h.
- Writers notify IndexNow only for stories already live. `announceNewlyLive()`
  (`src/lib/engine/announce.ts`) runs on every desk call: it rebuilds and announces stories that
  have just gone live, so no cached 404 outlives a story's publish time.
- `reillustrateCards` runs once an hour, not every pass.
- **GitHub Actions:** "Generate articles" is active (repo variable `SITE_URL`). "Ingest wire feeds"
  and "Trending topics" are disabled, because pg_cron does the same work and Actions minutes on a
  private repo are limited.
- **If the engine stalls**, pause the jobs with `cron.alter_job(jobid, active := false)` in
  tid-db, look at `docker logs tid-db` and `pm2 logs tid`, then turn the jobs back on.

## Steering the engine (admin → Steer, `/admin/steer`)
- **Standing instructions** (`engine_directives`): an admin types what the engine should cover and
  for how long (24 h / 48 h / 7 d / 30 d / until removed). The engine (`src/lib/ai/steer.ts`) asks
  clarifying questions in a dialogue that cannot be closed until it says it is satisfied; it then
  writes its `understanding` (prompt text) and `rules` (JSON, `directiveRulesSchema` in
  `src/lib/engine/directives.ts`). Active directives are loaded on every desk pass:
  the understanding goes into the triage and drafting prompts above the house rules; the rules are
  enforced in code (exclusive: only matching stories are triaged/written; focus: share of output;
  avoid: rejected; breaking rule). Expiry is by `expires_at`; the `expire-directives` cron only
  tidies the status. Removing one takes effect on the next pass.
- **Commissioned stories** (`commissioned_posts`): prompt + uploaded pictures → the same dialogue →
  a `brief` (`commissionBriefSchema`) → status `queued`. `writeCommissions(1)` runs first in every
  `engine-write` pass (`src/lib/engine/commission.ts`), or "Write it now" on the page. Publishes
  exactly as the brief says (now / usual delay / draft). Standing instructions do not apply to
  commissions.
- Everything here is admin-only by RLS (`app.is_admin()`). Never put model calls in page renders;
  the dialogue runs in server actions (`src/app/admin/steer-actions.ts`).

## Pictures: the picture desk (since 13 Oct 2026)
- `illustrateArticle` (`src/lib/media/illustrate.ts`) now runs the **picture desk** first
  (`src/lib/media/picture-desk.ts`): it gathers up to ten candidates at once (verified portraits and
  institutions from Wikidata + their Commons categories, a mark only where a mark is right, scenes
  from Commons, Openverse and Pexels for the writer's brief and two alternatives, "house picks" by
  story kind such as the BSE and Dalal Street for market stories), drops anything the site ran in the
  last week, and hands them to the **judge** (`src/lib/media/judge.ts`): a vision model that scores
  each picture on relevance, misleading, cliché, setting (India/elsewhere), quality, text, synthetic,
  and may choose none. Acceptance: relevance ≥ `picture_min_score` (7), not misleading, not synthetic,
  quality ≥ 5, no logo on a conflict/incident, no foreign scene for an Indian story. Then a Geoapify
  map of the place for incidents (`GEOAPIFY_API_KEY`), else the typographic card.
- The judge's chain is the `picture` kind in `src/lib/ai/config.ts`: **Mistral Pixtral 12B** (free
  tier, several pictures a call, at most 8, answers in seconds), Gemini Flash-Lite, Gemini 3.8 Flash,
  NVIDIA's free omni model on OpenRouter, Gemini Flash, Gemma. Mistral and OpenRouter are called
  directly (`askCompatible`), pictures inline. Two non-cooling keys per model, at most eight attempts,
  the last 45 s of the 110 s budget reserved for the caption route: Cloudflare Workers AI LLaVA
  describes each picture (`src/lib/media/captions.ts`, needs `CLOUDFLARE_ACCOUNT_ID`) and the assist
  text chain judges the descriptions. Only when all of that fails is the outcome `unjudged` and the
  old ladder decides; three in five minutes pause the judge for five minutes; the half-hour slot of
  the desk pass offers those stories to the judge again (`reillustrateCards(2, "unjudged")`).
- Commons facts that bit: thumbnails are served only at Commons' own widths (250, 330, 500, 1280,
  1920; others answer 400), the API's `thumburl` is on thumb.wikimedia.org with a tracking query and
  works verbatim, anonymous fetchers get 429s so pictures are fetched by us with a named User-Agent
  and handed to Cloudinary as bytes. Scenes come from Commons "… in India" category walks
  (`commonsSearchCategories`/`commonsCategoryFiles`), Openverse (two queries) and Pexels if a key
  exists (the owner could not obtain one).
- Every decision is in `picture_decisions` (candidates with scores, chosen, trace with timings and
  counts). `/admin/pictures` shows them; mark good or bad there. Rules of thumb that are now code:
  no gavels for Indian courts, no foreign trading floors, a private person described not named.
- Keys: `PEXELS_API_KEY` (scenes; without it Pexels is skipped), `GEOAPIFY_API_KEY` (maps),
  `AI_PICTURE_MODEL` (first judge model). Unsplash is deliberately not used: it requires hotlinking.
- Pictures policy unchanged: licensed only, copied into Cloudinary, credited; no synthetic images.

## Case studies (since 13 Oct 2026)
- The engine's second format: an explainer built around the question readers ask when something
  happens, kept current rather than written again. Articles with `format = 'case_study'`, filed
  under the `case-studies` section (layout `case_studies`), with the structured block the page
  renders in `articles.case_study` (`caseStudyBlockSchema`, `src/lib/ai/case-study.ts`), the
  subject as `subject_slug` (a section slug, deliberately not a foreign key) and `reviewed_at`.
- **The case desk** (`src/lib/engine/case-desk.ts`, cron `engine-case-desk` every two hours →
  `/api/cron/case-desk`): gathers the last 72 h of strong story events and 48 h of trends, asks the
  gate six questions per candidate in one model call (a question behind it, asked now, enough
  material, lasting, safe, would travel), and writes at most one per pass and
  `case_studies_daily_cap` (3) a day. A candidate an existing case study answers refreshes that
  page instead (updates log + reviewed_at). When nothing qualifies it writes one from the
  question bank (`case_questions`) at most every `case_studies_canon_days` (7), topping the bank
  up when it runs low. Everything considered is logged in `case_candidates`; `/admin/case-studies`
  shows it and lets an admin queue, drop or add questions (a queued question goes first).
  `?question=…&subject=…` on the route writes one on demand; `?propose=1` refills the bank.
- Never breaking; published after the usual delay; excluded from the news sitemap, the front
  page's news well and `related_articles`; shown on their own front-page shelf, in the section
  library, and as the "Case study" box inside any story sharing a topic tag.
- House rules for the writer are in `CASE_STUDY_RULE`: the question is the headline, the short
  answer first, dated figures, India first, no individual medical/legal/financial advice.

## Cloudflare in front of the site (since 13 Oct 2026)
- Zone `theindiadecade.com` on the owner's free Cloudflare account; nameservers at GoDaddy point to
  it. `www` and the apex are proxied; **`engine.theindiadecade.com` is DNS-only** and is what
  `site_settings.engine_base_url` and the GitHub variable `SITE_URL` point at, because Cloudflare
  cuts proxied requests at 100 s and the scheduler's passes run up to three minutes. Admin server
  actions still go through the proxy: "Write it now" therefore only queues.
- Cache rules (zone dashboard or `scratchpad/cf_setup.py` in the session notes): newsroom, sign-in,
  search, `/api/*` except `/api/headlines` and `/.well-known/` are never cached; robots, ads.txt and
  icons an hour; everything else exactly as the page's own `Cache-Control` (`s-maxage`) says. Smart
  Tiered Cache is on; the apex redirect is an edge redirect rule; SSL is Full (strict).
- **Always Use HTTPS stays off in Cloudflare.** Caddy does the redirect and renews its Let's Encrypt
  certificates by HTTP-01 through the proxy, which that setting would break.
- Purging: `src/lib/cache/cloudflare.ts` (`CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN` with Cache
  Purge) runs from `revalidateStory`, `announceNewlyLive`, `/api/revalidate`, front-page pinning and
  navigation changes. A direct database edit still needs `POST /api/revalidate`, which now purges too.
- Caddy's access log is `/var/log/caddy/www.log` (JSON, rolled at 50 MB); `cf-cache-status` on a
  response says HIT, MISS or DYNAMIC (bypassed).

## Advertising (since 13 Oct 2026)
- Google AdSense, publisher id in `NEXT_PUBLIC_ADSENSE_CLIENT` (set locally and on the server; it is
  public, it sits in every page's HTML). `src/components/ads/adsense-tag.tsx` renders the plain
  tag AdSense's site check looks for, hoisted into the head; nothing on the newsroom paths
  (`/admin`, `/desk`, `/review`, `/contribute`, `/account`, `/auth`, `/login`). `public/ads.txt`
  names the publisher. The privacy page has an "Advertisements" clause: keep it true.
- Consent for EEA/UK/Swiss readers is Google's own message, switched on in AdSense under
  Privacy & messaging; the site's banner covers analytics only.

## Partner desk: karostartup.com (since 4 Nov 2026)
- The engine writes **ten startup stories a day for karostartup.com** and posts them straight into
  that site's own Supabase project (`svwpvqmqmisoffbnnjdc`, their `articles` table, status
  published, `source = 'engine'`, bylined **KaroStartup News Engine**: profile username
  `karostartup-news-engine`, an auth user `engine@karostartup.com` their trigger turned into a
  profile, created 4 Nov). Nothing computes on their project: the desk reads their categories,
  recent headlines and slugs, and inserts. Their Cloudinary holds only the covers of stories
  posted there (folder `karostartup/engine`); covers go straight from the source into it
  through the `upload` hook of `illustrateArticle`, never through ours. Env:
  `KAROSTARTUP_SUPABASE_URL`, `KAROSTARTUP_SUPABASE_SERVICE_ROLE_KEY`, `KAROSTARTUP_CLOUDINARY_*`.
- Their `content` is **HTML** (their editor is a rich-text box; their page shows a Markdown table
  as a line of pipes), so the drafter's Markdown is converted by
  `src/lib/partners/markdown-html.ts` before posting.
- Owner's rules (4 Nov): no Sources list at the end of a story, attribution lives in the text;
  length matches their own desk (they average about 780 words, so the drafter aims at 800–1,100
  and a draft under 600 fails); every story should carry a cover. The judge reads
  `PARTNER_PICTURE_POLICY` (a clean scene of the company's trade scores 6–8) with a bar of 6
  instead of the site's 7, and no map ever stands in. When no photograph fits, the story gets a
  cover in their own dress (`src/lib/partners/karostartup-cover.ts`: headline, kicker and wordmark
  on their paper, in their colours; `coverKind: "card"` in the trace), so no story goes out
  bare. A pass that posts nothing looks for a cover for one of the last day's cover-less
  stories (`coverTries` in the post's trace, at most two tries); `?cover=<slug>` does it on
  demand.
- Code: `src/lib/partners/karostartup.ts` (their API), `src/lib/ai/partner-draft.ts` (the gate and
  the drafter in their voice, "FT meets Inc42", founder-first, data-driven), and
  `src/lib/engine/partner-desk.ts`: candidates are the engine's own story events of the last 18 h
  that look like the startup beat; one model call gates up to twelve of them against their recent
  headlines; the hottest good fit is written from the event's source documents, illustrated by the
  picture desk (a real photograph only, never our card), and posted. Cap 10 a day on the IST
  clock, 45 minutes between posts unless breaking, desk hours 06:30–23:30 IST. Every pass is in
  `partner_posts` (published, failed, skipped with the gate's reason).
- Freshness: only events the engine **first saw** in the last 18 h are candidates; a pick whose
  newest source page was published more than 30 h ago is skipped as stale and never offered
  again; the ranking docks a point per six hours of age; the gate scores day-old news low on heat.
- Route `/api/cron/partner-karostartup` (`CRON_SECRET`): `?dry=1` shows the pick and the queue,
  `?now=1` posts the desk's pick whatever the hour (cap and gate still apply), `?event=<uuid>`
  writes that event now, `?cover=<slug>` finds a cover for a posted story. pg_cron `engine-partner-karostartup` runs at 3, 23 and 43 past the hour.
  Settings `partner_karostartup_enabled`, `partner_karostartup_daily_cap`,
  `partner_karostartup_gap_minutes` override the defaults.
- 25 startup feeds (TechCrunch, Inc42, YourStory, Entrackr, Crunchbase News, Sifted, Tech in Asia,
  MediaNama, ET Startups, Mint Companies and more) were added to `sources`/`source_licences` for
  this; they feed our own sections too.
- Their repo `roshanyadav-2109/karostartup` (static HTML, Vercel): commits there follow the same
  rules (one file, conventional prefix, no trailer, as mishratejash01). Their sitemaps regenerate
  hourly by their own GitHub Action, so posted stories need nothing from us.

## Content and SEO
- Contact mailboxes in `PUBLISHER` (`src/lib/site.ts`): contact@, newsroom@, editor@,
  partnerships@ and grievance@ theindiadecade.com. Publish only these mailboxes, never aliases.
  Still to come from the owner: the grievance officer's name, the legal entity, the address and
  the editor's name.
- Story bodies support `![alt](url "caption")` for images and YouTube links. YouTube embeds
  click-to-load, through youtube-nocookie.
- Every `@id` reference in JSON-LD must resolve. The story breadcrumb carries
  `${url}#breadcrumb` (fixed 2 Oct after Search Console flagged 243 pages).
- The site icon is the orange dove (`src/assets/brand/dove-512.png`, brand orange `#f85f05`), the
  same mark as the sign-in card and the X and Instagram accounts.
- Research notes are in `research/` (git-ignored, so they exist on the owner's Mac only).

---

# Newswebsite — Master Build Spec

Production-grade general news media platform. Treat this as production code from commit #1.

## Ground rules

### Git
- Repo: `https://github.com/mishratejash01/firstlight` (was `newswebsite`)
- Identity is fixed: `mishratejash01` / `mtejash07@gmail.com`.
- **Never add a Claude/Anthropic co-author trailer to any commit.**
- **One file per commit — no exceptions.** A logical change touching 5 files is 5 commits.
  Use conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`) so split commits stay traceable.
- Push in batches; every push to `main` is a production deploy.

### Secrets
- Supabase project: `jjucyhrrlntziuwesvfw` (region `ap-southeast-2`).
- `.env.local` holds real credentials and is gitignored. Verify before every commit.
- The **service role key** is server-only (route handlers / server actions / Edge Functions).
  It must never be imported into anything reachable from the client bundle.
- The **anon key** is safe client-side, but every table must have RLS enabled in the same
  migration that creates it — even if the policy is "deny all for now".
- `.env.local.example` documents key names with placeholder values only.

### Zero hardcoding
- No article content, headline, category, author name, homepage placement, or nav item may be
  hardcoded in a component. Every one is a Supabase query. A component must render identically
  whether the database has 3 rows or 3 million.
- Navigation categories come from the `categories` table, not an array in the navbar file.
- Sample/development data goes into the database via a seed script, never into JSX.
- Legitimately hardcoded: UI microcopy (button labels, error text, static policy prose) and
  design tokens. Nothing else.

## Product

- General-interest news: politics, business, technology, world, health, science, sports,
  culture/entertainment, opinion.
- Content model: (1) licensed wire content ingested to a staging table for human review,
  (2) original reporting via contributor workflow, (3) curated aggregation — short original
  summary plus attribution link, never full-text reproduction.
- AI is an editorial assistant only: draft help, tag suggestions, review-queue summarisation.
  AI never publishes. Nothing goes live without a human clicking publish.
- Roles: Admin, Editor, Author — each with a dashboard, permissions enforced server-side by RLS.
- Taxonomy: ~15 top-level terms based on IPTC Media Topics, for wire-feed interoperability.

## Stack

Next.js 16 (App Router, TypeScript) · Supabase (Postgres, Auth, RLS, Storage) · Tailwind CSS 4 · Vercel.

Next.js 16 notes: `params`/`searchParams`/`cookies()`/`headers()` are async; Turbopack is the
default bundler; `middleware` is renamed `proxy` (Node runtime only); `revalidateTag` takes a
`cacheLife` profile as its second argument.

## Design system

The site must read as a serious, expensive, editorially credible publication. No bright colors,
no decorative animation, no SaaS card-and-shadow kit, no novelty display fonts.

**Banned — these are the tells of generic AI-generated design:**
cream background with terracotta accent · near-black background with one neon accent ·
ALL-CAPS section labels · tracked-out eyebrow labels above headings · arrow glyphs (→) in link
text · identical rounded cards with soft grey shadows · decorative gradient washes · accenting
one word in a headline with italic/bold/color.

| Token | Hex | Use |
|---|---|---|
| Background | `#FFFFFF` | Page background |
| Ink | `#14161C` | Headlines, body text |
| Muted | `#5B5F6B` | Bylines, timestamps, captions |
| Hairline | `#E4E5E8` | Dividers only — never a full card border |
| Accent | `#1B3B6F` | Links, active nav, buttons — never a large fill |
| Signal | `#8C1D24` | Breaking news tag only, used sparingly |

Type: **Source Serif 4** for headlines/display, **Source Sans 3** for body/UI.
Scale: ~15px body, ~17px lead, ~22px section header, 34–48px hero headline by viewport.
Body line length under ~75 characters. Emphasis comes from size, weight, and whitespace —
never color or italics on isolated words.

Layout: whitespace and hairline rules separate content, not borders or shadows. Homepage is one
dominant hero (~two-thirds width), a quiet secondary rail beside it, then horizontal category
shelves (sentence-case label, 3–4 stories each). Border-radius 2–4px on inputs/buttons only;
content blocks stay square. Exactly one motion moment: a subtle fade on route transitions.
Fully responsive, visible keyboard focus everywhere, respects `prefers-reduced-motion`.

## Build phases

0. Repo & project setup — Next.js scaffold, Supabase client helpers, env example, design tokens.
1. Database schema & RLS — `articles`, `authors`, `categories`, `sources`, `user_roles`,
   `newsletter_subscribers`, `reading_events`. RLS policy in the same commit as the table.
2. Auth & role dashboards — author (draft/submit/status), editor (review queue, inline edit,
   scheduling, homepage curation, version history), admin (users/roles, config, analytics).
3. Content pipeline — wire ingestion worker → staging → review queue; contributor submission;
   curated-aggregation tool (summary + attribution only, no full-text field); AI assist that
   always writes drafts requiring human approval.
4. Public site — homepage, section fronts, article, author, topic pages. Recommendation module
   as a Postgres function: tag similarity + recency decay + trending + editor-pinned slots.
5. SEO — `NewsArticle` JSON-LD, sitemap + Google News sitemap, canonicals, robots.txt,
   About / Masthead / Editorial standards / Corrections pages.
6. Retention — newsletter signup, topic/author follow, `reading_events` emission.

## Working style

- Run the build and report status after each phase before advancing.
- If a credential, API key, or product decision is missing, stop and say exactly what is needed.
  Never invent a placeholder that looks like a real integration.
- Comment non-obvious logic (recommendation query, RLS policies).
- Never silently drop a requirement. If something cannot be done as specified, say so and
  propose the closest alternative before proceeding.
