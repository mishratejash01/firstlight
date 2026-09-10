-- Learning from outcomes.
--
-- Outcomes are applied to the weights in batches; the flag stops one being
-- learned from twice. The performance reader gives the learner the completion
-- figures without going through the editorial-gated dashboard function, which
-- checks auth.uid() and so refuses the service role.

alter table public.event_outcomes
  add column if not exists applied boolean not null default false;

create index if not exists event_outcomes_pending_idx
  on public.event_outcomes (created_at)
  where not applied;

create or replace function public.engine_article_performance(p_article_ids uuid[])
returns table (
  article_id uuid,
  sessions bigint,
  completions bigint,
  completion_rate_pct numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.article_id, p.sessions, p.completions, p.completion_rate_pct
  from app.article_performance p
  where p.article_id = any (p_article_ids);
$$;

revoke all on function public.engine_article_performance(uuid[]) from public;
revoke all on function public.engine_article_performance(uuid[]) from anon;
revoke all on function public.engine_article_performance(uuid[]) from authenticated;
grant execute on function public.engine_article_performance(uuid[]) to service_role;
