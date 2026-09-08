-- Keep assignment changes serializable per vehicle and make retried mobile
-- requests idempotent. All locks are transaction-scoped and held only while
-- reading/writing local database rows.

alter table public.vehicle_drivers
  add column if not exists client_operation_id uuid;

create unique index if not exists vehicle_drivers_client_operation_idx
  on public.vehicle_drivers(client_operation_id)
  where client_operation_id is not null;

create or replace function public.enforce_vehicle_drivers_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle_company_id uuid;
  v_vehicle_status text;
  v_driver_company_id uuid;
  v_driver_role text;
  v_driver_name text;
  v_driver_status text;
  v_active_count int;
  v_primary_exists boolean;
  v_pair_exists boolean;
begin
  if new.driver_id is null then
    return new;
  end if;

  -- Every assignment mutation, including unassignment, shares this lock.
  -- This makes direct table updates and the RPCs below obey one ordering.
  perform pg_advisory_xact_lock(hashtext(new.vehicle_id::text));

  select company_id, status into v_vehicle_company_id, v_vehicle_status
  from public.vehicles where id = new.vehicle_id;
  if v_vehicle_company_id is null then raise exception 'הרכב לא נמצא'; end if;
  new.company_id := v_vehicle_company_id;

  if new.unassigned_at is null and v_vehicle_status = 'archived' then
    raise exception 'לא ניתן לשייך נהג לרכב שנמצא בארכיון';
  end if;

  select company_id, role, full_name into v_driver_company_id, v_driver_role, v_driver_name
  from public.profiles where id = new.driver_id;
  if v_driver_company_id is null then raise exception 'הנהג לא נמצא'; end if;
  if v_driver_role is distinct from 'driver' then raise exception 'ניתן לשייך לרכב רק משתמש בתפקיד נהג'; end if;
  if v_driver_company_id is distinct from v_vehicle_company_id then raise exception 'הנהג אינו שייך לאותה חברה כמו הרכב'; end if;
  new.driver_name := v_driver_name;

  if new.unassigned_at is null then
    select status into v_driver_status from public.driver_details where id = new.driver_id;
    if v_driver_status = 'archived' then raise exception 'לא ניתן לשייך לרכב נהג שנמצא בארכיון'; end if;

    select count(*) into v_active_count from public.vehicle_drivers
    where vehicle_id = new.vehicle_id and unassigned_at is null and id is distinct from new.id;
    if v_active_count >= 2 then raise exception 'לא ניתן לשייך יותר משני נהגים לרכב אחד'; end if;

    if new.is_primary then
      select exists (select 1 from public.vehicle_drivers where vehicle_id = new.vehicle_id and is_primary and unassigned_at is null and id is distinct from new.id) into v_primary_exists;
      if v_primary_exists then raise exception 'לרכב זה כבר יש נהג ראשי פעיל — יש להסיר אותו לפני קביעת נהג ראשי חדש'; end if;
    end if;

    select exists (select 1 from public.vehicle_drivers where vehicle_id = new.vehicle_id and driver_id = new.driver_id and unassigned_at is null and id is distinct from new.id) into v_pair_exists;
    if v_pair_exists then raise exception 'הנהג כבר משויך לרכב זה'; end if;
  end if;
  return new;
end;
$$;

-- An archive transition takes the same lock as assignment creation. Therefore
-- an assignment that starts after archival always sees the archived status.
create or replace function public.lock_vehicle_before_archive()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'archived' and old.status is distinct from 'archived' then
    perform pg_catalog.pg_advisory_xact_lock(hashtext(new.id::text));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_lock_vehicle_before_archive on public.vehicles;
create trigger trg_lock_vehicle_before_archive
  before update of status on public.vehicles
  for each row execute function public.lock_vehicle_before_archive();

create or replace function public.assign_vehicle_driver(
  p_vehicle_id uuid, p_driver_id uuid, p_is_primary boolean, p_operation_id uuid
)
returns public.vehicle_drivers language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid; v_status text; v_assignment public.vehicle_drivers%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(hashtext(p_vehicle_id::text));
  select company_id, status into v_company_id, v_status from public.vehicles where id = p_vehicle_id;
  if v_company_id is null then raise exception 'הרכב לא נמצא'; end if;
  if not private.can_manage_company(v_company_id) then raise exception 'אין הרשאה לעדכן את נהגי הרכב'; end if;
  if v_status = 'archived' then raise exception 'לא ניתן לשייך נהג לרכב שנמצא בארכיון'; end if;
  select * into v_assignment from public.vehicle_drivers where client_operation_id = p_operation_id;
  if found then return v_assignment; end if;
  insert into public.vehicle_drivers(vehicle_id, driver_id, is_primary, client_operation_id)
  values (p_vehicle_id, p_driver_id, p_is_primary, p_operation_id) returning * into v_assignment;
  return v_assignment;
end;
$$;

create or replace function public.unassign_vehicle_driver(p_assignment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_vehicle_id uuid; v_company_id uuid;
begin
  select vehicle_id, company_id into v_vehicle_id, v_company_id from public.vehicle_drivers where id = p_assignment_id;
  if v_vehicle_id is null then raise exception 'שיוך הנהג לא נמצא'; end if;
  if not private.can_manage_company(v_company_id) then raise exception 'אין הרשאה לעדכן את נהגי הרכב'; end if;
  perform pg_catalog.pg_advisory_xact_lock(hashtext(v_vehicle_id::text));
  update public.vehicle_drivers set unassigned_at = now()
  where id = p_assignment_id and unassigned_at is null;
end;
$$;

create or replace function public.set_vehicle_primary_driver(p_vehicle_id uuid, p_assignment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid; v_updated int;
begin
  select company_id into v_company_id from public.vehicles where id = p_vehicle_id;
  if v_company_id is null then raise exception 'הרכב לא נמצא'; end if;
  if not private.can_manage_company(v_company_id) then raise exception 'אין הרשאה לעדכן את נהגי הרכב'; end if;
  perform pg_catalog.pg_advisory_xact_lock(hashtext(p_vehicle_id::text));

  perform 1 from public.vehicle_drivers where id = p_assignment_id and vehicle_id = p_vehicle_id and company_id = v_company_id and unassigned_at is null;
  if not found then raise exception 'שיוך הנהג הפעיל לא נמצא עבור רכב זה'; end if;
  update public.vehicle_drivers set is_primary = false where vehicle_id = p_vehicle_id and unassigned_at is null and is_primary and id <> p_assignment_id;
  update public.vehicle_drivers set is_primary = true where id = p_assignment_id and vehicle_id = p_vehicle_id and unassigned_at is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then raise exception 'שיוך הנהג הפעיל לא נמצא עבור רכב זה'; end if;
end;
$$;

revoke execute on function public.assign_vehicle_driver(uuid, uuid, boolean, uuid), public.unassign_vehicle_driver(uuid) from public, anon;
grant execute on function public.assign_vehicle_driver(uuid, uuid, boolean, uuid), public.unassign_vehicle_driver(uuid) to authenticated, service_role;
revoke execute on function public.lock_vehicle_before_archive() from public, anon, authenticated;
