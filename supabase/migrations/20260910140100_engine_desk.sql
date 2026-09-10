-- The desk: triage state, the write claim, and editor labels.
--
-- An event moves candidate -> newsworthy | rejected at triage, newsworthy ->
-- writing when a run claims it, and writing -> written | newsworthy (released
-- after a failed attempt). The claim columns let two overlapping runs share
-- the queue without writing the same story twice.

alter table public.story_events
  drop constraint if exists story_events_status_valid;

alter table public.story_events
  add constraint story_events_status_valid
    check (status in ('candidate', 'newsworthy', 'writing', 'rejected', 'written'));

alter table public.story_events
  add column if not exists triaged_at timestamptz,
  add column if not exists triaged_score numeric,
  add column if not exists triage_section text,
  add column if not exists triage_angle text,
  add column if not exists urgency text
    check (urgency is null or urgency in ('breaking', 'developing', 'standard')),
  add column if not exists claimed_at timestamptz,
  add column if not exists write_attempts integer not null default 0,
  add column if not exists last_error text;

create index if not exists story_events_desk_idx
  on public.story_events (score desc)
  where status in ('newsworthy', 'writing');

-- Stale claims are reclaimed by the writer itself after ten minutes; this is
-- the backstop for a deploy that killed a run mid-write.
update public.story_events set status = 'newsworthy'
  where status = 'writing' and claimed_at < now() - interval '1 hour';

insert into public.site_settings (key, value, description) values
  ('engine_auto_write', 'true'::jsonb,
   'Whether the event engine writes stories from newsworthy events. Publishing still depends on autonomous_publishing_enabled.'),
  ('engine_triage_threshold', '25'::jsonb,
   'Score an event must reach before it is put to the triage model.'),
  ('engine_max_documents', '5'::jsonb,
   'How many source articles to read per event before verifying and writing.')
on conflict (key) do nothing;

-- Editor labels.
--
-- When an editor acts on an article the engine wrote, the decision is
-- recorded against the event with the features the engine saw at the time,
-- so the weights can learn from it. Publishing a draft is a yes; pulling a
-- scheduled or live story is a no. Everything else an editor does to an
-- article is not a verdict on whether the engine was right to surface it.
create or replace function app.label_event_from_editor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.story_events%rowtype;
  v_label numeric;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  select * into v_event from public.story_events where article_id = new.id limit 1;
  if not found or v_event.score_breakdown is null then
    return new;
  end if;

  if new.status = 'published' and old.status in ('draft', 'in_review') then
    v_label := 1;
  elsif new.status in ('draft', 'rejected', 'archived') and old.status in ('scheduled', 'published') then
    v_label := 0;
  else
    return new;
  end if;

  insert into public.event_outcomes (event_id, label_source, label, features)
  values (v_event.id, 'editor', v_label, v_event.score_breakdown -> 'features');

  return new;
end;
$$;

drop trigger if exists label_event_from_editor on public.articles;
create trigger label_event_from_editor
  after update of status on public.articles
  for each row execute function app.label_event_from_editor();
