# An autonomous newsroom

It It watches the world's feeds, notices when something is
happening, decides whether it matters, verifies it against independent sources,
writes the story, finds a licensed photograph, and publishes. Then it grades
itself against what the rest of the press went on to cover, and against what
the people who run the paper think of the result, and adjusts.

It runs a real publication around the clock. No human presses publish.

The whole design is aimed at one moment: the story seen before the world has
finished confirming it. Be early, and be right.

---

## What happens to a story

1. **Signals.** Forty-nine direct feeds, from Reuters-class wires to the RBI's
   press releases and OpenAI's own blog, polled every five minutes. Google
   News front pages for three editions. Standing searches on the beats the
   paper cares about. Google Trends, Bluesky, Mastodon, Wikipedia edit bursts,
   Hacker News, USGS, Polymarket. Everything becomes a *mention*: one outlet,
   one headline, one moment.

2. **Events.** Mentions are embedded (a 384-dimension model served from a
   Supabase edge function) and clustered in Postgres with pgvector. Two
   mentions about the same thing become one event. Two mentions from the same
   paper need to be near-identical to join, because a national desk files
   forty pieces a day on one beat and they must not chain into one endless
   story. Outlets are keyed by canonical host, so the BBC is one source
   whether it arrives as bbc.co.uk or bbc.com.

3. **Scoring.** Every minute, every live event gets ten signals: a Kleinberg
   burst test against the entity's own history, Bayesian surprise as a KL
   divergence between prior and posterior, independent-source count with
   syndication discounted, strongest-outlet authority, acceleration, magnitude,
   home-market relevance, novelty against what is already published,
   freshness, and momentum from the earliness model. A weighted sum, with
   novelty and freshness as gates rather than evidence, so a stale story cannot
   score for being stale.

4. **Triage.** Events over the line go to a language model with an editor's
   rulebook: what counts as news, what does not, which section, what angle,
   what urgency. It runs inside an hourly budget and across a pool of keys
   that rotates per call and rests keys the provider refuses.

5. **Verification.** The desk reads the sources, extracts the claims, and
   grades severity. High-severity claims need three independent sources,
   medium two. A story whose newest source is older than the ceiling is
   refused as stale. A story that reads like one already live is refused as a
   duplicate, twice: once on the event, once on the draft.

6. **Writing.** Attributes to primary sources, never to other outlets. No
   reproduction of anyone's text. Pictures come from a licensed-only ladder:
   the subject's own portrait or a public body's building from Wikidata, a
   company's logo, a scene chosen by embedding similarity from Commons and
   Openverse, and only then a typographic card. Editors' own pictures are
   never overwritten.

7. **Learning.** Every decision is written down with the signals as they were
   at the moment of deciding. Outlets' follow-through is measured for every
   event, written or not. Company members review published stories and a
   daily sample of stories the engine skipped. A nightly fit refits the
   weights, anchored to a hand-labelled baseline, clamped, held out on the
   most recent day, and promoted only when it beats what is live. A promotion
   may move a weight at most 35 per cent in a night.

## The earliness model

The part I am proudest of, because the data surprised me.

I assumed the authority of the first outlet to report a story would predict
whether it became big. It does not: 2.1 per cent of stories first reported by
a top-tier outlet reached five independent outlets within six hours, against
4.3 per cent for everyone else. What does predict it is how many independent
outlets arrive in the first thirty minutes: one outlet, 1.5 per cent; three or
more, 31 per cent. A twenty-fold signal hiding in plain sight.

So there is a second model, a logistic regression over what the engine knows
in an event's first half hour, trained nightly on free labels the mention table
already holds. Its output drives a fast lane (an immediate corroboration search
for likely-big stories), the order of the search budget (lone-source stories
first, newest first), a scoring signal, and a timing rule that writes at once
when it is sure and waits a few minutes for a second outlet when it is not.

## Things I got wrong

The learner broke scoring twice. Its feedback rule asked whether two outlets
with an authority weight of 1.5 or more had followed each story, which for a
paper outside the Anglo-American wire circuit was usually no even when the
story was everywhere. It concluded evidence did not predict success and turned
the evidence weights to their floor. Posting stopped. The fix was not a better learner; it was a better
question, asked of every event rather than only the ones we wrote, and a gate
that lets nothing go live without beating the incumbent on data it never saw.

The vector-search function returned ten full embeddings per call. Nothing read
them. That was two gigabytes a day of database egress until I measured it.

A thousand vector-row rewrites a minute took a small database instance down
for an hour. The engine was doing exactly what it was built to do. The instance
was too small for it.

## Stack

- Next.js 16, React 19, Tailwind 4. Server components everywhere; the only
  client code is the review panel, the search box and the listen button.
- Supabase: Postgres 17, pgvector, pg_cron, pg_net, Vault, Row Level Security
  on every table from the migration that creates it. The engine's schedules
  are pg_cron jobs that call the app over HTTP with a secret from Vault.
- Language models through the Vercel AI SDK, behind a chain of Gemini keys with
  Groq as the fallback. Model calls are never used for what a query can
  answer.
- Cloudinary for pictures. Wikidata, Wikimedia Commons and Openverse for
  finding them.
- Seventy-one migrations, one concern each.

## Running it

```bash
npm install
cp .env.local.example .env.local   # names only; fill in your own values
npm run dev
```

Apply the migrations in `supabase/migrations` in order. Set the site URL and
the cron secret; the schedule migration reads the secret from Vault and the
URL from a setting, so the engine follows the deployment wherever it lives.

The admin pages explain themselves: feed switches, the learning page, the
review queue. Each was written so that a person who has never seen the code
can turn something off and know what will stop.

## A note on taste

The site is set in Source Serif and Source Sans, on white, with hairlines
instead of boxes and one navy for links. There are no cards, no shadows, no
gradients, and one animation, a fade on route change. A news site should look
like it costs money to run. This one does not, much, but it should not look
like it.
