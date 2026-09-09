-- Default follows.user_id to the caller.
--
-- The insert policy already refuses a row carrying anyone else's user_id, so
-- this is not a security fix — it is a correctness one. Requiring the client to
-- send its own id means the client has to know it, which means fetching it, and
-- every place that forgets produces a not-null violation instead of a follow.
--
-- With the default in place a follow is 'insert the thing being followed', and
-- whose follow it is stops being the caller's business to assert.

alter table public.follows alter column user_id set default auth.uid();
