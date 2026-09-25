-- Records each user's acceptance of the terms of use and privacy policy.
-- The app blocks every signed-in user (owner, admin, driver) until a row for
-- the current version exists (lib/legal/acceptance.ts). A new version of the
-- documents gets a new version string, and everyone accepts again once.
--
-- Rows are evidence, so users can add their own acceptance but never edit or
-- remove it; user_id and accepted_at are always set by the database.

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  version text not null check (length(version) between 1 and 40),
  accepted_at timestamptz not null default now(),
  -- 'user': the person ticked the boxes in the app.
  -- 'existing_user': marked as accepted by this migration for accounts that
  -- existed before the consent screen, at Dor's decision. Not a real consent.
  source text not null default 'user' check (source in ('user', 'existing_user')),
  platform text check (platform is null or length(platform) <= 20),
  user_agent text check (user_agent is null or length(user_agent) <= 400),
  unique (user_id, version)
);

create index if not exists legal_acceptances_user_idx on public.legal_acceptances(user_id);

alter table public.legal_acceptances enable row level security;

revoke all on public.legal_acceptances from anon, authenticated;
grant select on public.legal_acceptances to authenticated;
-- Only these columns can come from the client; the rest take their defaults.
grant insert (version, platform, user_agent) on public.legal_acceptances to authenticated;

drop policy if exists "users read own acceptances" on public.legal_acceptances;
create policy "users read own acceptances" on public.legal_acceptances
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "users record own acceptance" on public.legal_acceptances;
create policy "users record own acceptance" on public.legal_acceptances
for insert to authenticated
with check (user_id = (select auth.uid()) and source = 'user');

-- Accounts that existed before the consent screen shipped: marked as accepted
-- for the first version, so they are not stopped on their next sign-in.
insert into public.legal_acceptances (user_id, version, source)
select p.id, '2026-09-25', 'existing_user'
from public.profiles p
on conflict (user_id, version) do nothing;
