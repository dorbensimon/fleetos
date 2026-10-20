-- סידור עבודה: נסיעות, לקוחות, נסיעות שמורות, רכב במוסך / נהג לא זמין
--
-- The manager's "סידור עבודה" screen. A trip is one row: its day (or first
-- and last day, for a trip of several days), hours, vehicle and driver. A
-- trip with no vehicle waits in the "מחכים לרכב" list. A recurring trip is
-- one row per day sharing a series_id, so each day can still be changed or
-- cancelled alone. Cancelling never deletes: the status turns 'cancelled'.
--
-- Clients and saved trips are short lists the form offers. A block marks a
-- vehicle in the garage or a driver away for a range of days.
--
-- Only the company's managers (and the owner) read or write any of it.

create table if not exists public.schedule_clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create unique index if not exists schedule_clients_name_unique
  on public.schedule_clients (company_id, lower(btrim(name)));

create table if not exists public.schedule_saved_trips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  client_name text check (client_name is null or char_length(client_name) <= 80),
  start_time time not null,
  end_time time not null,
  pickup text check (pickup is null or char_length(pickup) <= 80),
  destination text check (destination is null or char_length(destination) <= 80),
  created_at timestamptz not null default now()
);
create index if not exists schedule_saved_trips_company on public.schedule_saved_trips (company_id, name);

create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  owner_type text not null check (owner_type in ('vehicle', 'driver')),
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  driver_id uuid references public.profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 60),
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check ((owner_type = 'vehicle' and vehicle_id is not null and driver_id is null)
      or (owner_type = 'driver' and driver_id is not null and vehicle_id is null))
);
create index if not exists schedule_blocks_company on public.schedule_blocks (company_id, end_date);

create table if not exists public.schedule_trips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  trip_date date not null,
  -- The last day of a trip of several days; null for a trip of one day.
  end_date date,
  start_time time not null,
  end_time time not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  client_name text check (client_name is null or char_length(client_name) <= 80),
  pickup text check (pickup is null or char_length(pickup) <= 80),
  destination text check (destination is null or char_length(destination) <= 80),
  -- No vehicle: the trip waits for one.
  vehicle_id uuid references public.vehicles(id) on delete set null,
  driver_id uuid references public.profiles(id) on delete set null,
  series_id uuid,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date > trip_date),
  check (end_date is not null or end_time > start_time)
);
create index if not exists schedule_trips_company_date on public.schedule_trips (company_id, trip_date);
create index if not exists schedule_trips_series on public.schedule_trips (series_id) where series_id is not null;

drop trigger if exists trg_schedule_trips_updated_at on public.schedule_trips;
create trigger trg_schedule_trips_updated_at
  before update on public.schedule_trips
  for each row execute function public.touch_updated_at();

-- A trip or block may only name a vehicle or driver of its own company.
create or replace function private.schedule_same_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.vehicle_id is not null and not exists (
    select 1 from public.vehicles v where v.id = new.vehicle_id and v.company_id = new.company_id
  ) then
    raise exception 'vehicle_not_in_company' using errcode = 'P0001';
  end if;
  if new.driver_id is not null and not exists (
    select 1 from public.driver_details d where d.id = new.driver_id and d.company_id = new.company_id
  ) then
    raise exception 'driver_not_in_company' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_schedule_trips_same_company on public.schedule_trips;
create trigger trg_schedule_trips_same_company
  before insert or update of company_id, vehicle_id, driver_id on public.schedule_trips
  for each row execute function private.schedule_same_company();

drop trigger if exists trg_schedule_blocks_same_company on public.schedule_blocks;
create trigger trg_schedule_blocks_same_company
  before insert or update of company_id, vehicle_id, driver_id on public.schedule_blocks
  for each row execute function private.schedule_same_company();

-- Managers of the company (and the owner) only.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['schedule_clients', 'schedule_saved_trips', 'schedule_blocks', 'schedule_trips'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists "managers manage %s" on public.%I', tbl, tbl);
    execute format(
      'create policy "managers manage %s" on public.%I for all to authenticated
         using (private.can_manage_company(company_id))
         with check (private.can_manage_company(company_id))',
      tbl, tbl
    );
    execute format('revoke all on public.%I from anon', tbl);
    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
  end loop;
end;
$$;
