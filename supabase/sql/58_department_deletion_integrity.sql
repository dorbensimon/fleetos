-- ============================================================
-- 58_department_deletion_integrity.sql
--
-- Deleting a department (`departments`) sets `department_id` to null
-- on every vehicle and driver that was assigned to it (FK `on delete
-- set null`, schema 10). Two problems with that, found while
-- reviewing the deletion flow:
--
-- 1. The `department_id is null` on driver_details is picked up by
--    `notify_driver_profile_update()` (migration 40) exactly like a
--    manual edit, so deleting a department with N drivers fires N
--    "המנהל עדכן בתיק שלך: מחלקה" notifications the admin never
--    intended. Fix: tell a cascade-triggered SET NULL apart from a
--    real edit — if the *old* department_id no longer exists in
--    `departments` (it was just deleted, in the same transaction),
--    this is the FK cascade, not a manager action, so skip it.
--
-- 2. `prevent_driver_details_company_escalation()` (migration 32)
--    only validates department_id's company when the caller is NOT a
--    manager (the early `if can_manage_company(...) then return new`
--    skips it for admins/owner entirely). That means an admin action
--    — including the `create-company-driver` edge function, which
--    passes `department_id` straight from the client into an INSERT
--    with the service role — can silently assign a driver to another
--    company's department. The trigger also only ran on UPDATE, so
--    INSERT was never checked at all. Fix: validate department_id's
--    company on every insert/update, for every caller. Vehicles had
--    no such guard at all; add one for the same reason.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Don't notify a driver about a department change that's really
--    their department being deleted out from under them.
-- ------------------------------------------------------------

create or replace function private.notify_driver_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text[] := '{}';
  target_company uuid;
  target_role text;
  actor_name text;
  department_deleted boolean := false;
begin
  if (select auth.uid()) is null or new.id = (select auth.uid()) then
    return new;
  end if;

  if tg_table_name = 'profiles' then
    target_company := new.company_id;
    target_role := new.role;
    if new.full_name is distinct from old.full_name then changed := array_append(changed, 'שם מלא'); end if;
    if new.phone is distinct from old.phone then changed := array_append(changed, 'טלפון'); end if;
    if new.job_title is distinct from old.job_title then changed := array_append(changed, 'תפקיד'); end if;
  else
    select profile.company_id, profile.role
      into target_company, target_role
      from public.profiles profile
      where profile.id = new.id;

    if new.department_id is null and old.department_id is not null then
      department_deleted := not exists (
        select 1 from public.departments d where d.id = old.department_id
      );
    end if;
    if new.department_id is distinct from old.department_id and not department_deleted then
      changed := array_append(changed, 'מחלקה');
    end if;
    if new.employee_number is distinct from old.employee_number then changed := array_append(changed, 'מספר עובד'); end if;
    if new.national_id is distinct from old.national_id then changed := array_append(changed, 'תעודת זהות'); end if;
    if new.birth_date is distinct from old.birth_date then changed := array_append(changed, 'תאריך לידה'); end if;
    if new.address is distinct from old.address then changed := array_append(changed, 'כתובת'); end if;
    if new.home_phone is distinct from old.home_phone then changed := array_append(changed, 'טלפון בבית'); end if;
    if new.employment_start_date is distinct from old.employment_start_date then changed := array_append(changed, 'תחילת עבודה'); end if;
    if new.license_number is distinct from old.license_number then changed := array_append(changed, 'מספר רישיון'); end if;
    if new.license_classes is distinct from old.license_classes then changed := array_append(changed, 'דרגת רישיון'); end if;
    if new.license_issue_date is distinct from old.license_issue_date then changed := array_append(changed, 'הוצאת רישיון'); end if;
    if new.license_expiry is distinct from old.license_expiry then changed := array_append(changed, 'תוקף רישיון'); end if;
  end if;

  if target_role is distinct from 'driver'
     or target_company is null
     or not (select private.can_manage_company(target_company))
     or array_length(changed, 1) is null then
    return new;
  end if;

  select profile.full_name into actor_name
    from public.profiles profile
    where profile.id = (select auth.uid());

  insert into public.notifications (
    company_id, actor_id, actor_name, recipient_id, message, notification_type
  ) values (
    target_company,
    (select auth.uid()),
    coalesce(actor_name, 'מנהל'),
    new.id,
    'המנהל עדכן בתיק שלך: ' || array_to_string(changed, ', '),
    'driver_profile_updated_by_manager'
  );

  return new;
end;
$$;


-- ------------------------------------------------------------
-- 2. Validate department_id's company on every write to
--    driver_details and vehicles, for every caller (including
--    managers and service-role inserts) — not just non-manager
--    updates.
-- ------------------------------------------------------------

create or replace function public.prevent_driver_details_company_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- company_id itself can only be moved by an admin/owner of the
  -- row's current company; a driver editing their own row must not
  -- be able to reassign it.
  if tg_op = 'UPDATE'
     and not public.can_manage_company(old.company_id)
     and new.company_id is distinct from old.company_id then
    raise exception 'לא ניתן לשנות שיוך לחברה';
  end if;

  -- department_id, whoever is writing it, must belong to the row's
  -- (post-write) company.
  if new.department_id is not null
     and not exists (
       select 1 from public.departments d
       where d.id = new.department_id
         and d.company_id = new.company_id
     ) then
    raise exception 'לא ניתן לשייך למחלקה שאינה בחברה שלך';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_driver_details_company_escalation on public.driver_details;
create trigger trg_prevent_driver_details_company_escalation
  before insert or update on public.driver_details
  for each row
  execute function public.prevent_driver_details_company_escalation();

create or replace function public.prevent_vehicle_department_cross_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.department_id is not null
     and not exists (
       select 1 from public.departments d
       where d.id = new.department_id
         and d.company_id = new.company_id
     ) then
    raise exception 'לא ניתן לשייך רכב למחלקה שאינה בחברה שלו';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_vehicle_department_cross_company on public.vehicles;
create trigger trg_prevent_vehicle_department_cross_company
  before insert or update on public.vehicles
  for each row
  execute function public.prevent_vehicle_department_cross_company();
