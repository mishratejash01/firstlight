-- Reverts the outage-night change: the earliness scores are written the way
-- they were before, and the single-statement function is no longer used.
drop function if exists public.engine_apply_earliness(jsonb);
