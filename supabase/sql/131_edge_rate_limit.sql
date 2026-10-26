-- 131: per-user rate limit for Edge Functions. No data changes.
--
-- Every user-facing Edge Function signs the caller in through
-- _shared/verifyUser.ts, which calls edge_rate_limit_hit() once per request.
-- A user who goes over the limit gets 429 until the minute window rolls over.
-- This caps calls that cost money or lean on outside services (DocuSeal,
-- the Ministry of Transport registry) without touching normal use.
--
-- Fixed one-minute windows, one row per user per window; each call drops the
-- caller's older rows, so the table stays tiny. Idempotent.

create table if not exists private.edge_rate_limit (
  user_id uuid not null,
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (user_id, window_start)
);

create or replace function public.edge_rate_limit_hit(p_user uuid, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws timestamptz := date_trunc('minute', now());
  n integer;
begin
  delete from private.edge_rate_limit where user_id = p_user and window_start < ws;
  insert into private.edge_rate_limit (user_id, window_start) values (p_user, ws)
  on conflict (user_id, window_start) do update set hits = private.edge_rate_limit.hits + 1
  returning hits into n;
  return n <= p_max;
end;
$$;

-- Only Edge Functions (service role) may count hits.
revoke all on function public.edge_rate_limit_hit(uuid, integer) from public, anon, authenticated;
grant execute on function public.edge_rate_limit_hit(uuid, integer) to service_role;
