-- ============================================================
-- 34_vehicle_drivers.sql
--
-- Implements the "vehicle <-> driver, many-to-many" model approved in
-- `.claude/prds/vehicle-drivers-multi.md` (2026-08-24). Replaces the
-- single `vehicles.primary_driver_id` column as the source of truth for
-- *active* assignments (that column is left in place for now — no
-- destructive change to existing data/UI in this migration — but new
-- code should read/write `vehicle_drivers` instead).
--
-- `vehicle_driver_history` (10_admin_schema.sql) keeps being the
-- long-term audit log; `vehicle_drivers` is the *current active state*.
-- These are two tables with two different jobs — do not merge them.
--
-- Rules enforced here (per PRD, "decisions" section):
--   - A vehicle can have at most 2 active drivers (primary + one
--     secondary). A 3rd active assignment is rejected.
--   - At most one active `is_primary = true` row per vehicle. A vehicle
--     may have zero active primary drivers (not enforced/required).
--   - Adding a driver never overwrites/removes an existing active row —
--     removal only happens by explicitly setting `unassigned_at`.
--   - A driver can't be double-assigned (two active rows for the same
--     vehicle+driver pair).
--   - `company_id` is always derived from the vehicle, never trusted
--     from the client, and the driver must belong to the same company
--     as the vehicle (cross-company assignment blocked).
-- ============================================================


-- ------------------------------------------------------------
-- 1. Table
-- ------------------------------------------------------------

create table if not exists public.vehicle_drivers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  vehicle_id    uuid not null references public.vehicles(id) on delete cascade,
  driver_id     uuid not null references public.profiles(id) on delete cascade,
  is_primary    boolean not null default false,
  assigned_at   timestamptz not null default now(),
  unassigned_at timestamptz,
  created_at    timestamptz not null default now(),

  constraint vehicle_drivers_unassigned_after_assigned
    check (unassigned_at is null or unassigned_at >= assigned_at)
);

create index if not exists vehicle_drivers_vehicle_idx  on public.vehicle_drivers(vehicle_id);
create index if not exists vehicle_drivers_driver_idx   on public.vehicle_drivers(driver_id);
create index if not exists vehicle_drivers_company_idx  on public.vehicle_drivers(company_id);

-- Fast lookup of "this driver's currently active vehicles"
-- (DriverVehicleScreen / DriverHomeScreen).
create index if not exists vehicle_drivers_driver_active_idx
  on public.vehicle_drivers(driver_id)
  where unassigned_at is null;

-- Safety nets enforced at the index level (race-condition-safe even if
-- the trigger below is ever bypassed, e.g. by a future bulk-load path):
-- at most one active primary per vehicle, and no duplicate active
-- vehicle+driver pair. The "max 2 active drivers" rule below can't be
-- expressed as a plain unique index (it's a COUNT, not a uniqueness
-- constraint), so it needs the trigger + advisory lock instead.
create unique index if not exists vehicle_drivers_primary_active_idx
  on public.vehicle_drivers(vehicle_id)
  where is_primary and unassigned_at is null;

create unique index if not exists vehicle_drivers_active_pair_idx
  on public.vehicle_drivers(vehicle_id, driver_id)
  where unassigned_at is null;


-- ------------------------------------------------------------
-- 2. Business-rule trigger
--
-- Runs on INSERT and on UPDATE (covers both "assign" and
-- "reactivate"/"change is_primary" paths). Derives company_id,
-- validates the driver belongs to the same company and is actually a
-- driver, and enforces the max-2-active / single-primary rules with a
-- friendly Hebrew error before falling back to the unique indexes above.
-- ------------------------------------------------------------

create or replace function public.enforce_vehicle_drivers_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle_company_id uuid;
  v_driver_company_id  uuid;
  v_driver_role        text;
  v_active_count       int;
  v_primary_exists     boolean;
  v_pair_exists        boolean;
begin
  select company_id into v_vehicle_company_id
  from public.vehicles
  where id = new.vehicle_id;

  if v_vehicle_company_id is null then
    raise exception 'הרכב לא נמצא';
  end if;

  -- Always derived from the vehicle — never trusted from the client,
  -- same defense-in-depth pattern as 32's driver_details trigger.
  new.company_id := v_vehicle_company_id;

  select company_id, role into v_driver_company_id, v_driver_role
  from public.profiles
  where id = new.driver_id;

  if v_driver_company_id is null then
    raise exception 'הנהג לא נמצא';
  end if;

  if v_driver_role is distinct from 'driver' then
    raise exception 'ניתן לשייך לרכב רק משתמש בתפקיד נהג';
  end if;

  if v_driver_company_id is distinct from v_vehicle_company_id then
    raise exception 'הנהג אינו שייך לאותה חברה כמו הרכב';
  end if;

  -- Only rows that are (becoming) active need the capacity/primary/
  -- duplicate checks — a row being unassigned only frees up capacity.
  if new.unassigned_at is null then
    -- Serializes concurrent inserts/reactivations for the same vehicle
    -- so two simultaneous requests can't both pass the COUNT check
    -- below and jointly exceed the 2-driver cap. Released automatically
    -- at transaction end.
    perform pg_advisory_xact_lock(hashtext(new.vehicle_id::text));

    select count(*) into v_active_count
    from public.vehicle_drivers
    where vehicle_id = new.vehicle_id
      and unassigned_at is null
      and id is distinct from new.id;

    if v_active_count >= 2 then
      raise exception 'לא ניתן לשייך יותר משני נהגים לרכב אחד';
    end if;

    if new.is_primary then
      select exists (
        select 1 from public.vehicle_drivers
        where vehicle_id = new.vehicle_id
          and is_primary
          and unassigned_at is null
          and id is distinct from new.id
      ) into v_primary_exists;

      if v_primary_exists then
        raise exception 'לרכב זה כבר יש נהג ראשי פעיל — יש להסיר אותו לפני קביעת נהג ראשי חדש';
      end if;
    end if;

    select exists (
      select 1 from public.vehicle_drivers
      where vehicle_id = new.vehicle_id
        and driver_id = new.driver_id
        and unassigned_at is null
        and id is distinct from new.id
    ) into v_pair_exists;

    if v_pair_exists then
      raise exception 'הנהג כבר משויך לרכב זה';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_vehicle_drivers_rules on public.vehicle_drivers;
create trigger trg_enforce_vehicle_drivers_rules
  before insert or update on public.vehicle_drivers
  for each row
  execute function public.enforce_vehicle_drivers_rules();


-- ------------------------------------------------------------
-- 3. Row Level Security
--
-- Admin/owner: full access within their own company (mirrors every
-- other company-scoped table in 10_admin_schema.sql). Driver: read-only
-- on their own assignment rows (active and historical alike — history
-- visibility for one's own past assignments is not sensitive).
-- ------------------------------------------------------------

alter table public.vehicle_drivers enable row level security;

drop policy if exists "manage own company vehicle_drivers" on public.vehicle_drivers;
create policy "manage own company vehicle_drivers" on public.vehicle_drivers
  for all using (public.can_manage_company(company_id))
  with check (public.can_manage_company(company_id));

drop policy if exists "driver reads own vehicle_drivers" on public.vehicle_drivers;
create policy "driver reads own vehicle_drivers" on public.vehicle_drivers
  for select using (driver_id = auth.uid());


-- ------------------------------------------------------------
-- 4. GRANTs — required in addition to RLS (see 10_admin_schema.sql §9)
-- ------------------------------------------------------------

grant select, insert, update, delete on public.vehicle_drivers to authenticated, service_role;
