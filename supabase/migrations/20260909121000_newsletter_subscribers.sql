-- Newsletter subscribers.
--
-- The table is unreadable to the public and unwritable directly: signup goes
-- through subscribe_to_newsletter() below. That indirection exists to prevent
-- address enumeration — a direct insert would return a unique-violation for an
-- address already on the list and a success for one that is not, which turns
-- the signup form into an "is this person a subscriber?" oracle.

create table public.newsletter_subscribers (
  id uuid primary key default extensions.gen_random_uuid(),
  email text not null,

  -- Double opt-in. Nothing is mailed to a 'pending' address beyond the single
  -- confirmation message.
  status text not null default 'pending',
  confirmation_token uuid not null default extensions.gen_random_uuid(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,

  -- Where the signup happened: 'footer', 'article-end', a campaign slug.
  signup_context text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint newsletter_status_valid
    check (status in ('pending', 'confirmed', 'unsubscribed', 'bounced')),
  -- Deliberately permissive: real validation is the confirmation email. This
  -- only rejects obvious junk.
  constraint newsletter_email_shape check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

-- Case-insensitive uniqueness without requiring the citext extension.
create unique index newsletter_subscribers_email_key
  on public.newsletter_subscribers (lower(email));

create index newsletter_subscribers_status_idx
  on public.newsletter_subscribers (status, created_at desc);

create trigger newsletter_subscribers_set_updated_at
  before update on public.newsletter_subscribers
  for each row execute function app.set_updated_at();

alter table public.newsletter_subscribers enable row level security;

-- No insert, update or delete policy for anon or authenticated, and no select
-- policy either. With RLS on, absent policies mean deny. The subscriber list is
-- reachable only by admins and by the definer function below.
create policy "newsletter_subscribers: admins read"
  on public.newsletter_subscribers
  for select
  to authenticated
  using (app.is_admin());

create policy "newsletter_subscribers: admins update"
  on public.newsletter_subscribers
  for update
  to authenticated
  using (app.is_admin())
  with check (app.is_admin());

create policy "newsletter_subscribers: admins delete"
  on public.newsletter_subscribers
  for delete
  to authenticated
  using (app.is_admin());

-- ---------------------------------------------------------------------------
-- Signup endpoint.
--
-- SECURITY DEFINER because the caller has no write access to the table. It is
-- narrow on purpose: it accepts an address, writes at most one row, and always
-- returns the same thing. It cannot read the list, and it reveals nothing
-- about who is on it.
--
-- Note this is not a rate limiter. Abuse protection for the signup form
-- belongs at the edge; see the Vercel firewall configuration.
-- ---------------------------------------------------------------------------
create or replace function public.subscribe_to_newsletter(
  p_email text,
  p_context text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.newsletter_subscribers (email, signup_context)
  values (btrim(p_email), p_context)
  on conflict (lower(email)) do nothing;
  -- Returns void whether the address was new, already subscribed, or already
  -- unsubscribed. The caller learns nothing either way.
end;
$$;

-- Postgres grants EXECUTE to PUBLIC on every new function. Revoke that and
-- re-grant deliberately, so this is the only door in.
revoke all on function public.subscribe_to_newsletter(text, text) from public;
grant execute on function public.subscribe_to_newsletter(text, text) to anon, authenticated;
