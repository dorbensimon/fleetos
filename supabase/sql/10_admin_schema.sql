-- ============================================================
-- Tolvex / FleetOS — Admin module schema (Phase 0)
-- Run this ONCE in Supabase SQL Editor.
--
-- Creates everything the fleet-admin screens (A1-A5) need:
--   departments, vehicles, driver_details,
--   compliance_items, documents, vehicle_driver_history
--
-- Every table is company-scoped and protected by RLS:
--   owner  -> full access to everything
--   admin  -> only rows of their own company_id
--   driver -> read-only on what belongs to them
--
-- NOTE: RLS policies alone are not enough — Postgres also needs
-- table-level GRANTs for the `authenticated` and `service_role`
-- roles, otherwise every query fails with 42501 permission denied.
-- Both are handled at the bottom of this file.
-- ============================================================


-- ------------------------------------------------------------
-- 0. Helper functions
--
-- SECURITY DEFINER is required: these read `profiles`, which is
-- itself protected by RLS. Without it the policies below would
-- recurse into profiles' own policies.
-- ------------------------------------------------------------

create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from profiles where id = auth.uid()
$$;

-- True when the caller may read/write rows belonging to `target_company`.
create or replace function public.can_manage_company(target_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    current_role_name() = 'owner'
    or (current_role_name() = 'admin' and current_company_id() = target_company)
$$;


-- ------------------------------------------------------------
-- 1. departments — internal org units ("תפעול", "הסעות")
-- ------------------------------------------------------------

create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists departments_company_idx on public.departments(company_id);


-- ------------------------------------------------------------
-- 2. vehicles
--
-- Only the operational fields live here. Every date that has an
-- expiry and a document behind it (insurance, test, brakes...)
-- lives in compliance_items instead, so the UI can group them.
-- ------------------------------------------------------------

create table if not exists public.vehicles (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  department_id     uuid references public.departments(id) on delete set null,
  primary_driver_id uuid references public.profiles(id) on delete set null,

  plate_number      text not null,
  internal_code     text,
  vin               text,

  vehicle_type      text not null default 'car',   -- car | minibus | bus | truck
  manufacturer      text,
  model             text,
  production_year   int,
  production_month  int,
  usage_type        text,

  status            text not null default 'active', -- active | maintenance | disabled | archived

  odometer            int  not null default 0,
  odometer_updated_at timestamptz,
  last_service_km     int  not null default 0,
  service_interval_km int,
  next_service_km     int,

  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint vehicles_status_check
    check (status in ('active', 'maintenance', 'disabled', 'archived')),
  constraint vehicles_type_check
    check (vehicle_type in ('car', 'minibus', 'bus', 'truck'))
);

create index if not exists vehicles_company_idx on public.vehicles(company_id);
create index if not exists vehicles_driver_idx  on public.vehicles(primary_driver_id);
create unique index if not exists vehicles_plate_per_company_idx
  on public.vehicles(company_id, plate_number);


-- ------------------------------------------------------------
-- 3. driver_details — extends profiles for role='driver'
--
-- full_name / phone already live on profiles; this table holds
-- everything else the driver file (A5) needs.
-- ------------------------------------------------------------

create table if not exists public.driver_details (
  id            uuid primary key references public.profiles(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,

  employee_number text,
  national_id     text,
  birth_date      date,
  address         text,
  home_phone      text,
  marital_status  text,
  education       text,

  employment_start_date date,

  license_number     text,
  license_classes    text,   -- comma separated: 'B,C1,D'
  license_issue_date date,
  license_expiry     date,

  status text not null default 'active',  -- active | archived

  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint driver_details_status_check check (status in ('active', 'archived'))
);

create index if not exists driver_details_company_idx on public.driver_details(company_id);


-- ------------------------------------------------------------
-- 4. compliance_items — every tracked expiry date
--
-- One row per item per owner (vehicle OR driver). `category` is
-- what the UI groups by, so "ביטוח חובה" and "ביטוח מקיף" are two
-- rows that both render under a single "ביטוחים" section.
-- ------------------------------------------------------------

create table if not exists public.compliance_items (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,

  owner_type  text not null,   -- vehicle | driver
  owner_id    uuid not null,

  category    text not null,   -- licensing | insurance | inspection | training | health | general
  item_type   text not null,   -- insurance_mandatory | annual_test | crane_license | ...

  last_date   date,
  expiry_date date,
  notes       text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint compliance_owner_type_check check (owner_type in ('vehicle', 'driver')),
  constraint compliance_unique_item unique (owner_type, owner_id, item_type)
);

create index if not exists compliance_owner_idx   on public.compliance_items(owner_type, owner_id);
create index if not exists compliance_company_idx on public.compliance_items(company_id);
create index if not exists compliance_expiry_idx  on public.compliance_items(expiry_date);


-- ------------------------------------------------------------
-- 5. documents — uploaded files
--
-- file_path points into the PRIVATE `documents` storage bucket.
-- Files are served through signed URLs, never public links,
-- because they contain ID numbers and licences.
-- ------------------------------------------------------------

create table if not exists public.documents (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  owner_type text not null,   -- vehicle | driver
  owner_id   uuid not null,

  compliance_item_id uuid references public.compliance_items(id) on delete set null,

  category   text not null,
  title      text not null,

  file_path  text not null,
  file_name  text,
  mime_type  text,
  file_size  int,

  expiry_date date,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint documents_owner_type_check check (owner_type in ('vehicle', 'driver'))
);

create index if not exists documents_owner_idx   on public.documents(owner_type, owner_id);
create index if not exists documents_company_idx on public.documents(company_id);


-- ------------------------------------------------------------
-- 6. vehicle_driver_history — who drove what, and when
-- ------------------------------------------------------------

create table if not exists public.vehicle_driver_history (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  driver_id  uuid not null references public.profiles(id) on delete cascade,
  from_date  date not null default current_date,
  to_date    date,
  created_at timestamptz not null default now()
);

create index if not exists vdh_vehicle_idx on public.vehicle_driver_history(vehicle_id);
create index if not exists vdh_driver_idx  on public.vehicle_driver_history(driver_id);


-- ------------------------------------------------------------
-- 7. updated_at triggers
-- ------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vehicles_touch on public.vehicles;
create trigger vehicles_touch before update on public.vehicles
  for each row execute function public.touch_updated_at();

drop trigger if exists driver_details_touch on public.driver_details;
create trigger driver_details_touch before update on public.driver_details
  for each row execute function public.touch_updated_at();

drop trigger if exists compliance_touch on public.compliance_items;
create trigger compliance_touch before update on public.compliance_items
  for each row execute function public.touch_updated_at();


-- ------------------------------------------------------------
-- 8. Row Level Security
-- ------------------------------------------------------------

alter table public.departments            enable row level security;
alter table public.vehicles               enable row level security;
alter table public.driver_details         enable row level security;
alter table public.compliance_items       enable row level security;
alter table public.documents              enable row level security;
alter table public.vehicle_driver_history enable row level security;

-- departments
drop policy if exists "manage own company departments" on public.departments;
create policy "manage own company departments" on public.departments
  for all using (public.can_manage_company(company_id))
  with check (public.can_manage_company(company_id));

-- vehicles: admins/owner manage; a driver may read the vehicle assigned to them
drop policy if exists "manage own company vehicles" on public.vehicles;
create policy "manage own company vehicles" on public.vehicles
  for all using (public.can_manage_company(company_id))
  with check (public.can_manage_company(company_id));

drop policy if exists "driver reads own vehicle" on public.vehicles;
create policy "driver reads own vehicle" on public.vehicles
  for select using (primary_driver_id = auth.uid());

-- driver_details: admins/owner manage; a driver may read their own row
drop policy if exists "manage own company drivers" on public.driver_details;
create policy "manage own company drivers" on public.driver_details
  for all using (public.can_manage_company(company_id))
  with check (public.can_manage_company(company_id));

drop policy if exists "driver reads own details" on public.driver_details;
create policy "driver reads own details" on public.driver_details
  for select using (id = auth.uid());

-- compliance_items
drop policy if exists "manage own company compliance" on public.compliance_items;
create policy "manage own company compliance" on public.compliance_items
  for all using (public.can_manage_company(company_id))
  with check (public.can_manage_company(company_id));

drop policy if exists "driver reads own compliance" on public.compliance_items;
create policy "driver reads own compliance" on public.compliance_items
  for select using (owner_type = 'driver' and owner_id = auth.uid());

-- documents
drop policy if exists "manage own company documents" on public.documents;
create policy "manage own company documents" on public.documents
  for all using (public.can_manage_company(company_id))
  with check (public.can_manage_company(company_id));

drop policy if exists "driver reads own documents" on public.documents;
create policy "driver reads own documents" on public.documents
  for select using (owner_type = 'driver' and owner_id = auth.uid());

-- vehicle_driver_history
drop policy if exists "manage own company vdh" on public.vehicle_driver_history;
create policy "manage own company vdh" on public.vehicle_driver_history
  for all using (public.can_manage_company(company_id))
  with check (public.can_manage_company(company_id));

drop policy if exists "driver reads own vdh" on public.vehicle_driver_history;
create policy "driver reads own vdh" on public.vehicle_driver_history
  for select using (driver_id = auth.uid());


-- ------------------------------------------------------------
-- 9. GRANTs — required in addition to RLS
-- ------------------------------------------------------------

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on
  public.departments,
  public.vehicles,
  public.driver_details,
  public.compliance_items,
  public.documents,
  public.vehicle_driver_history
to authenticated, service_role;

grant execute on function
  public.current_role_name(),
  public.current_company_id(),
  public.can_manage_company(uuid)
to authenticated, service_role;
