-- The owner's tools for running the platform without touching code.
--
--   company_payments      every payment a company made: the month it covers,
--                         the amount, when it came in and how. Owner-only.
--   company_notes         a dated internal log per company ("talked to the
--                         manager, waiting for payment"). Owner-only.
--   system_announcements  a message the owner shows at the top of every
--                         manager's (or everyone's) screen, for a period.
--                         The owner writes; signed-in users read the live one.
--
-- Approved by Dor on 2026-10-06.

begin;

-- ------------------------------------------------------------
-- 1. Payments
-- ------------------------------------------------------------

create table if not exists public.company_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- The first day of the month the payment covers.
  period date not null check (extract(day from period) = 1),
  amount numeric(10, 2) not null check (amount >= 0),
  paid_on date not null default (now() at time zone 'Asia/Jerusalem')::date,
  method text check (method is null or method in ('transfer', 'card', 'check', 'cash', 'other')),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists company_payments_company_idx on public.company_payments (company_id, period desc);
create index if not exists company_payments_paid_idx on public.company_payments (paid_on desc);

alter table public.company_payments enable row level security;
revoke all on public.company_payments from anon;
grant select, insert, update, delete on public.company_payments to authenticated;

drop policy if exists "owner manages company payments" on public.company_payments;
create policy "owner manages company payments" on public.company_payments
  for all to authenticated
  using ((select private.current_role_name()) = 'owner')
  with check ((select private.current_role_name()) = 'owner');

-- ------------------------------------------------------------
-- 2. Internal notes
-- ------------------------------------------------------------

create table if not exists public.company_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists company_notes_company_idx on public.company_notes (company_id, created_at desc);

alter table public.company_notes enable row level security;
revoke all on public.company_notes from anon;
grant select, insert, delete on public.company_notes to authenticated;

drop policy if exists "owner manages company notes" on public.company_notes;
create policy "owner manages company notes" on public.company_notes
  for all to authenticated
  using ((select private.current_role_name()) = 'owner')
  with check ((select private.current_role_name()) = 'owner');

-- ------------------------------------------------------------
-- 3. Announcements
-- ------------------------------------------------------------

create table if not exists public.system_announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(btrim(message)) between 1 and 400),
  tone text not null default 'info' check (tone in ('info', 'warn')),
  audience text not null default 'admins' check (audience in ('admins', 'everyone')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create index if not exists system_announcements_live_idx on public.system_announcements (starts_at desc);

alter table public.system_announcements enable row level security;
revoke all on public.system_announcements from anon;
grant select, insert, update, delete on public.system_announcements to authenticated;

drop policy if exists "owner manages announcements" on public.system_announcements;
create policy "owner manages announcements" on public.system_announcements
  for all to authenticated
  using ((select private.current_role_name()) = 'owner')
  with check ((select private.current_role_name()) = 'owner');

drop policy if exists "users read live announcements" on public.system_announcements;
create policy "users read live announcements" on public.system_announcements
  for select to authenticated
  using (
    starts_at <= now()
    and (ends_at is null or ends_at > now())
    and (
      audience = 'everyone'
      or (select private.current_role_name()) in ('admin', 'owner')
    )
  );

commit;
