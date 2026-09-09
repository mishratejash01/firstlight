-- Bootstrap the first administrator.
--
-- Run once, with the service key. This is the one grant that cannot go through
-- the normal path: the user_roles insert policy requires app.is_admin(), and at
-- this point no admin exists to satisfy it. Every subsequent grant is made by
-- an administrator through the admin dashboard, under RLS.
--
-- Matching on email rather than a hardcoded uuid so the file stays meaningful
-- if the project is ever rebuilt from scratch.

insert into public.user_roles (user_id, role, granted_by)
select u.id, r.role, u.id
from auth.users u
cross join (values ('admin'::public.app_role), ('editor'::public.app_role)) as r(role)
where u.email = 'mtejash07@gmail.com'
on conflict (user_id, role) do nothing;

-- Give the founder a byline too, so they can file as well as publish.
insert into public.authors (user_id, slug, display_name, title)
select u.id, 'tejash-mishra', 'Tejash Mishra', 'Editor'
from auth.users u
where u.email = 'mtejash07@gmail.com'
on conflict (slug) do nothing;
