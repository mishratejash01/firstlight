-- AI provenance on articles.
--
-- ai_assisted already recorded that a model touched a draft. These columns
-- record what it could not stand behind, which is the part an editor actually
-- needs before publishing.
--
-- unverified_claims is stored rather than shown once and discarded because the
-- person who runs the generation is often not the person who publishes. A list
-- that exists only in the browser session of whoever pressed the button is no
-- safeguard at all.

alter table public.articles add column ai_model text;
alter table public.articles add column ai_unverified_claims text[] not null default '{}';
alter table public.articles add column ai_generated_at timestamptz;

comment on column public.articles.ai_unverified_claims is
  'Claims the model reported it could not verify. Must be checked before publishing.';

-- A published article that still has unresolved AI claims recorded against it
-- is a fact worth being able to query, for an audit or a post-mortem.
create index articles_unverified_ai_idx
  on public.articles (published_at desc)
  where ai_assisted and array_length(ai_unverified_claims, 1) > 0;
