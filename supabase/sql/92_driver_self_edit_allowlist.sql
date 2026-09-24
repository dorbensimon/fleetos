-- ============================================================
-- 92_driver_self_edit_allowlist.sql
--
-- RLS lets a driver UPDATE their own profiles/driver_details row, and the
-- `authenticated` role holds UPDATE on every column (managers share that
-- role, so column grants cannot tell the two apart). Until now a driver could
-- therefore rewrite fields that belong to the company: department, employee
-- number, employment start date, notes, status and the archive stamps.
--
-- This adds an allowlist enforced in a BEFORE UPDATE trigger. A caller who
-- is not a manager of the row's company may change only the fields below;
-- any column added later is blocked for drivers until it is listed here.
--
--   profiles:       full_name, phone
--   driver_details: national_id, birth_date, address, home_phone,
--                   marital_status, education, license_number,
--                   license_classes, license_issue_date, license_expiry
--
-- Managers (owner, or admin of an active company) and service-role writes
-- (edge functions, no auth.uid()) are not affected. role, company_id and the
-- password fields on profiles stay guarded by prevent_privilege_escalation().
--
-- The driver self-edit notification now covers every field a driver can
-- change, and the manager-edit notification to the driver covers the
-- personal fields that had no label yet.
-- ============================================================

create or replace function private.guard_driver_self_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed text[];
  blocked text[];
begin
  if (select auth.uid()) is null
     or coalesce(private.can_manage_company(old.company_id), false) then
    return new;
  end if;

  if tg_table_name = 'profiles' then
    allowed := array['full_name', 'phone'];
  else
    -- updated_at is rewritten by the driver_details_touch trigger on every
    -- update, so it never reflects a change the caller asked for.
    allowed := array[
      'national_id', 'birth_date', 'address', 'home_phone', 'marital_status',
      'education', 'license_number', 'license_classes', 'license_issue_date',
      'license_expiry', 'updated_at'
    ];
  end if;

  select array_agg(changed.key order by changed.key)
    into blocked
    from jsonb_each(to_jsonb(new)) as changed
   where not (changed.key = any (allowed))
     and changed.value is distinct from (to_jsonb(old) -> changed.key);

  if blocked is not null then
    raise exception 'אין הרשאה לעדכן את השדות: %', array_to_string(blocked, ', ')
      using errcode = '42501',
            hint = 'שדות אלה מתעדכנים על ידי מנהל החברה בלבד';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_driver_self_edit() from public, anon, authenticated;

drop trigger if exists trg_guard_driver_self_edit on public.profiles;
create trigger trg_guard_driver_self_edit
  before update on public.profiles
  for each row
  execute function private.guard_driver_self_edit();

drop trigger if exists trg_guard_driver_self_edit on public.driver_details;
create trigger trg_guard_driver_self_edit
  before update on public.driver_details
  for each row
  execute function private.guard_driver_self_edit();

-- ------------------------------------------------------------
-- Driver self-edit notification to the company managers: one label per
-- field a driver may change (department and employee number are no longer
-- reachable by a driver, so they are dropped from the list).
-- ------------------------------------------------------------
create or replace function public.log_driver_self_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed text[] := '{}';
  actor_company uuid;
  actor_full_name text;
begin
  if auth.uid() is null
     or public.current_role_name() is distinct from 'driver'
     or new.id is distinct from auth.uid() then
    return new;
  end if;

  if TG_TABLE_NAME = 'profiles' then
    if new.full_name is distinct from old.full_name then changed := array_append(changed, 'שם מלא'); end if;
    if new.phone is distinct from old.phone then changed := array_append(changed, 'טלפון'); end if;
  elsif TG_TABLE_NAME = 'driver_details' then
    if new.national_id is distinct from old.national_id then changed := array_append(changed, 'תעודת זהות'); end if;
    if new.birth_date is distinct from old.birth_date then changed := array_append(changed, 'תאריך לידה'); end if;
    if new.address is distinct from old.address then changed := array_append(changed, 'כתובת'); end if;
    if new.home_phone is distinct from old.home_phone then changed := array_append(changed, 'טלפון בבית'); end if;
    if new.marital_status is distinct from old.marital_status then changed := array_append(changed, 'מצב משפחתי'); end if;
    if new.education is distinct from old.education then changed := array_append(changed, 'השכלה'); end if;
    if new.license_number is distinct from old.license_number then changed := array_append(changed, 'מספר רישיון'); end if;
    if new.license_classes is distinct from old.license_classes then changed := array_append(changed, 'דרגת רישיון'); end if;
    if new.license_issue_date is distinct from old.license_issue_date then changed := array_append(changed, 'הוצאת רישיון'); end if;
    if new.license_expiry is distinct from old.license_expiry then changed := array_append(changed, 'תוקף רישיון'); end if;
  end if;

  if array_length(changed, 1) is null then
    return new;
  end if;

  select company_id, full_name into actor_company, actor_full_name
  from public.profiles where id = auth.uid();

  insert into public.notifications (company_id, actor_id, actor_name, message, notification_type)
  values (
    actor_company,
    auth.uid(),
    coalesce(actor_full_name, 'נהג'),
    coalesce(actor_full_name, 'נהג') || ' עדכן/ה: ' || array_to_string(changed, ', '),
    'driver_profile_update'
  );

  return new;
end;
$$;

revoke execute on function public.log_driver_self_edit() from public, anon, authenticated;

-- ------------------------------------------------------------
-- Manager edit -> notification to the driver: add the two personal fields
-- that had no label (marital status, education). Otherwise unchanged.
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
    if new.marital_status is distinct from old.marital_status then changed := array_append(changed, 'מצב משפחתי'); end if;
    if new.education is distinct from old.education then changed := array_append(changed, 'השכלה'); end if;
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
