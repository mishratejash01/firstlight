@AGENTS.md

# Newswebsite — Master Build Spec

Production-grade general news media platform. Treat this as production code from commit #1.

## Ground rules

### Git
- Repo: `https://github.com/mishratejash01/newswebsite`
- Identity is fixed: `mishratejash01` / `mtejash07@gmail.com`.
- **Never add a Claude/Anthropic co-author trailer to any commit.**
- **One file per commit — no exceptions.** A logical change touching 5 files is 5 commits.
  Use conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`) so split commits stay traceable.
- Push after every commit or small group of commits.

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
