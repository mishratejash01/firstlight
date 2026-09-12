-- Wire items the engine has not read yet.
--
-- The pulse used to take the newest 400 wire items of the last six hours and
-- let the mention table's unique key discard the ones it had already read.
-- That starves: when thirty-seven feeds arrived at once and inserted a
-- thousand items in two minutes, the newest 400 were read and re-read every
-- minute while the other six hundred never were, because nothing newer ever
-- stopped arriving. Bloomberg, FT and the NYT sat unread for the whole window.
--
-- This asks the question the pulse actually has: which items have no mention
-- yet. The anti-join uses the mention table's (source_kind, external_id)
-- unique index, since a wire mention's external id is 'wire:' plus the item
-- id. Both switches are applied here too, and items published more than
-- twelve hours ago are left out: a feed's own entry is minutes old when it
-- appears, so anything older is a backlog or a long-tail feed (OpenAI's
-- carries sixty entries spanning months), neither of which is news.
create or replace function public.engine_unread_wire_items(p_limit integer default 300)
returns table (
  id uuid,
  title text,
  summary text,
  link text,
  published_at timestamptz,
  ingested_at timestamptz,
  source_slug text,
  source_homepage_url text,
  source_expanded boolean
)
language sql
stable
set search_path = public
as $$
  with switch as (
    select coalesce((select value = 'true'::jsonb from site_settings where key = 'engine_expanded_feeds_enabled'), false) as expanded_on
  )
  select w.id, w.title, w.summary, w.link, w.published_at, w.ingested_at,
         s.slug, s.homepage_url, s.expanded
    from wire_items w
    join sources s on s.id = w.source_id
    cross join switch
   where w.ingested_at > now() - interval '6 hours'
     and (w.published_at is null or w.published_at > now() - interval '12 hours')
     and s.is_active
     and (not s.expanded or switch.expanded_on)
     and not exists (
       select 1 from signal_mentions m
        where m.source_kind = 'rss' and m.external_id = 'wire:' || w.id::text
     )
   order by w.ingested_at desc
   limit p_limit;
$$;

revoke all on function public.engine_unread_wire_items(integer) from public, anon, authenticated;
