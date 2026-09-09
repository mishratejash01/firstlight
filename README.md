# The Federal Post

A general-interest news platform: politics, business, technology, world, health, science,
sports, culture and opinion.

## Stack

- **Next.js 16** — App Router, TypeScript, Turbopack
- **Supabase** — Postgres, Auth, Row Level Security, Storage
- **Tailwind CSS 4** — CSS-first design tokens in `src/app/globals.css`
- **Vercel** — hosting

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in the Supabase values
npm run dev
```

## Architecture

| Path | Purpose |
|---|---|
| `src/app` | Routes. App Router, Server Components by default. |
| `src/lib/supabase/client.ts` | Browser client. Publishable key, RLS enforced. |
| `src/lib/supabase/server.ts` | Request-scoped server client. Acts as the signed-in user. |
| `src/lib/supabase/admin.ts` | Privileged client. **Bypasses RLS**, guarded by `server-only`. |
| `src/proxy.ts` | Refreshes the auth session on every request. Not a security boundary. |
| `supabase/migrations` | Schema. Every table enables RLS in the migration that creates it. |

## Content model

Three sources of content, all landing in the same editorial review queue:

1. **Wire** — licensed feed content, ingested to a staging table, published only after human review.
2. **Original** — reporting submitted by contributors through the editorial workflow.
3. **Curated** — a short original summary plus an attribution link. Never full-text reproduction.

AI is an editorial assistant inside that queue — draft help, tag suggestions, summarisation for
reviewers. It never publishes. Nothing goes live without a human clicking publish.

## Conventions

- **No hardcoded content.** Headlines, categories, navigation, authors and homepage placements
  are all database queries. A component must render identically with 3 rows or 3 million.
- **RLS is the authorisation layer.** UI-level hiding is presentation, never protection.
- **One file per commit**, with conventional prefixes.
