-- When the words of a story last changed.
--
-- articles.updated_at moves on every write to the row, and a page view writes
-- to the row (the read_count bump), so it says "modified" every time someone
-- reads a story. Search engines are told when a story changed through
-- dateModified in structured data, article:modified_time and the sitemap's
-- lastmod, and they learn to ignore those signals on a site where they are not
-- true. This column moves only when the reader-facing text changes: headline,
-- standfirst, body or summary. A new picture, a status change, a view count or
-- a housekeeping write leaves it alone.

alter table public.articles
  add column content_updated_at timestamptz;

comment on column public.articles.content_updated_at is
  'Last change to headline, standfirst, body or summary. Drives dateModified and sitemap lastmod; never touched by views or non-editorial writes.';

create or replace function app.touch_content_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.content_updated_at := coalesce(new.content_updated_at, new.published_at, now());
    return new;
  end if;

  if old.headline is distinct from new.headline
     or old.standfirst is distinct from new.standfirst
     or old.body is distinct from new.body
     or old.summary is distinct from new.summary
  then
    new.content_updated_at := now();
  end if;

  return new;
end;
$$;

create trigger articles_touch_content_updated_at
  before insert or update on public.articles
  for each row execute function app.touch_content_updated_at();

-- Backfill from the record that exists. article_versions stores the row as it
-- was before each edit, but it also files a version for a new picture or a
-- status change, so an edit only counts here when the text on either side of it
-- differs: each snapshot is compared with the next one, and the last with the
-- live row. A story counts as changed at its last text edit after publication,
-- otherwise at publication. On 26 September 2026 that was 2 stories of 460.
with versions as (
  select v.article_id,
         v.created_at,
         v.version_number,
         v.headline, v.standfirst, v.body, v.summary,
         lead(v.version_number) over w as next_version,
         lead(v.headline)       over w as next_headline,
         lead(v.standfirst)     over w as next_standfirst,
         lead(v.body)           over w as next_body,
         lead(v.summary)        over w as next_summary
    from public.article_versions v
  window w as (partition by v.article_id order by v.version_number)
),
text_edits as (
  select versions.article_id, versions.created_at
    from versions
    join public.articles a on a.id = versions.article_id
   where versions.created_at > a.published_at + interval '1 minute'
     and case
           when versions.next_version is null then
             versions.headline   is distinct from a.headline
             or versions.standfirst is distinct from a.standfirst
             or versions.body       is distinct from a.body
             or versions.summary    is distinct from a.summary
           else
             versions.headline   is distinct from versions.next_headline
             or versions.standfirst is distinct from versions.next_standfirst
             or versions.body       is distinct from versions.next_body
             or versions.summary    is distinct from versions.next_summary
         end
)
update public.articles a
   set content_updated_at = greatest(
         a.published_at,
         coalesce(
           (select max(e.created_at) from text_edits e where e.article_id = a.id),
           a.published_at))
 where a.published_at is not null;

update public.articles
   set content_updated_at = created_at
 where content_updated_at is null;
