-- Allow a server-side event to carry no actor at all.
--
-- Consent changes what we may record. Without analytics consent there is no
-- anonymous_id to attach, because assigning one is itself the tracking the
-- reader declined. The original constraint demanded an actor on every row,
-- which left only two options: fabricate an identifier, or lose the ability to
-- count reach entirely.
--
-- A server-rendered page_view with no user_id, no anonymous_id and no
-- session_id is a pure tally. It says a page was served; it says nothing about
-- who. That is countable without consent and is what a consentless reader now
-- produces.
--
-- Client-side events are unaffected: they still require an actor, because an
-- unattributed scroll event cannot be sessionised and would be meaningless.

alter table public.analytics_events drop constraint analytics_events_needs_actor;

alter table public.analytics_events
  add constraint analytics_events_needs_actor check (
    user_id is not null
    or anonymous_id is not null
    or is_server_side
  );
