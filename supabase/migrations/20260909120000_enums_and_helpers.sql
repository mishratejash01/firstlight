-- Foundations: enums, a private helper schema, and the updated_at trigger.
--
-- Everything editorial keys off these three enums. They are Postgres enums
-- rather than lookup tables because the sets are closed: adding a value is a
-- code change (new UI states, new pipeline branches), not editorial data.

create extension if not exists "pgcrypto" with schema extensions;

-- Where an article came from. Drives which review path it takes and what the
-- publisher is legally permitted to reproduce.
--   wire     — licensed feed content, reproduction governed by sources.license_*
--   original — reporting written by a contributor
--   curated  — an original summary of someone else's story, plus attribution.
--              Never full text; see the articles table constraint.
create type public.content_origin as enum ('wire', 'original', 'curated');

-- Editorial lifecycle. Only editors and admins may move an article into
-- 'scheduled' or 'published'; that is enforced in the articles RLS policies,
-- not in the UI.
create type public.article_status as enum (
  'draft',
  'in_review',
  'scheduled',
  'published',
  'archived',
  'rejected'
);

-- Application roles. Deliberately not stored in auth.users.raw_user_meta_data,
-- which is user-editable and therefore unsafe for authorisation.
create type public.app_role as enum ('admin', 'editor', 'author');

-- ---------------------------------------------------------------------------
-- Private helper schema.
--
-- Not exposed to the Data API, so nothing in here is callable over PostgREST.
-- The role helpers must be SECURITY DEFINER: policies on user_roles would
-- otherwise recurse when a policy on that table needs to read that table.
-- Each function is scoped to the *calling* user via auth.uid() and takes no
-- user_id parameter, so it cannot be used to probe other accounts.
-- ---------------------------------------------------------------------------
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, anon, service_role;

-- Keeps updated_at honest without trusting the client to send it.
create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
