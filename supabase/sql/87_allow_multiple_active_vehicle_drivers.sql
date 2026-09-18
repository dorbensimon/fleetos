-- Vehicles may have any number of active drivers. There is still at most
-- one primary driver, and duplicate active vehicle/driver pairs are blocked.
-- The advisory lock continues to serialize concurrent assignment updates.

create or replace function public.enforce_vehicle_drivers_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle_company_id uuid;
  v_vehicle_status text;
  v_driver_company_id uuid;
  v_driver_role text;
  v_driver_name text;
  v_driver_status text;
  v_primary_exists boolean;
  v_pair_exists boolean;
begin
  if new.driver_id is null then return new; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.vehicle_id::text));
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

    if new.is_primary then
      select exists (
        select 1 from public.vehicle_drivers
        where vehicle_id = new.vehicle_id and is_primary and unassigned_at is null and id is distinct from new.id
      ) into v_primary_exists;
      if v_primary_exists then raise exception 'לרכב זה כבר יש נהג ראשי פעיל — יש להסיר אותו לפני קביעת נהג ראשי חדש'; end if;
    end if;

    select exists (
      select 1 from public.vehicle_drivers
      where vehicle_id = new.vehicle_id and driver_id = new.driver_id and unassigned_at is null and id is distinct from new.id
    ) into v_pair_exists;
    if v_pair_exists then raise exception 'הנהג כבר משויך לרכב זה'; end if;
  end if;
  return new;
end;
$$;
