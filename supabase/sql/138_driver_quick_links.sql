-- 138: personal no-password links a manager sends a driver over WhatsApp.
--
-- The manager presses "send on WhatsApp"; the driver-quick-link Edge
-- Function makes a random token, stores only its SHA-256 here, and the
-- manager's own WhatsApp opens with a message holding
-- https://<app>/d/<token>. The driver opens it without signing in and can do
-- exactly one thing: report the vehicle's odometer, or upload a new copy of
-- one document folder. The link expires after 7 days and stops working once
-- used (an upload link allows a few files, then closes).
--
-- No app user reads or writes this table: RLS is on with no policies, and
-- only the service-role Edge Function touches it. Idempotent.

create table if not exists public.driver_quick_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('odometer', 'document')),
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  -- documents.category of the folder to upload into (kind = 'document').
  category text,
  title text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  uploads integer not null default 0,
  constraint driver_quick_links_target_check check (
    (kind = 'odometer' and vehicle_id is not null)
    or (kind = 'document' and category is not null)
  )
);

create index if not exists driver_quick_links_company_idx on public.driver_quick_links(company_id, created_at desc);
create index if not exists driver_quick_links_driver_idx on public.driver_quick_links(driver_id);

alter table public.driver_quick_links enable row level security;
revoke all on public.driver_quick_links from anon, authenticated;
grant select, insert, update, delete on public.driver_quick_links to service_role;
