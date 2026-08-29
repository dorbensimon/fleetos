-- Per-driver notifications for manager actions relevant to that driver.

alter table public.notifications
  add column if not exists recipient_id uuid references public.profiles(id) on delete cascade;

create index if not exists notifications_recipient_created_idx
  on public.notifications(recipient_id, created_at desc)
  where recipient_id is not null;

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (
  notification_type is null or notification_type in (
    'driver_profile_update',
    'driver_document_upload',
    'vehicle_insurance_mandatory_expiry',
    'vehicle_insurance_comprehensive_expiry',
    'vehicle_annual_test_expiry',
    'vehicle_service_due',
    'driver_document_renewal',
    'signature_request_assigned',
    'vehicle_assignment',
    'driver_profile_updated_by_manager'
  )
);

alter table public.notification_preferences
  drop constraint if exists notification_preferences_notification_type_check;
alter table public.notification_preferences
  add constraint notification_preferences_notification_type_check check (
    notification_type in (
      'driver_profile_update',
      'driver_document_upload',
      'vehicle_insurance_mandatory_expiry',
      'vehicle_insurance_comprehensive_expiry',
      'vehicle_annual_test_expiry',
      'vehicle_service_due',
      'driver_document_renewal',
      'signature_request_assigned',
      'vehicle_assignment',
      'driver_profile_updated_by_manager'
    )
  );

drop policy if exists "company managers see own notifications" on public.notifications;
drop policy if exists "company managers update own notifications" on public.notifications;
drop policy if exists "company managers delete own notifications" on public.notifications;

create policy "users see relevant notifications"
  on public.notifications for select to authenticated
  using (
    (
      recipient_id = (select auth.uid())
      or (recipient_id is null and (select private.can_manage_company(company_id)))
    )
    and (
      notification_type is null
      or not exists (
        select 1
        from public.notification_preferences preference
        where preference.user_id = (select auth.uid())
          and preference.notification_type = notifications.notification_type
          and preference.enabled = false
      )
    )
  );

create policy "users mark relevant notifications read"
  on public.notifications for update to authenticated
  using (
    recipient_id = (select auth.uid())
    or (recipient_id is null and (select private.can_manage_company(company_id)))
  )
  with check (
    recipient_id = (select auth.uid())
    or (recipient_id is null and (select private.can_manage_company(company_id)))
  );

create policy "users delete relevant notifications"
  on public.notifications for delete to authenticated
  using (
    recipient_id = (select auth.uid())
    or (recipient_id is null and (select private.can_manage_company(company_id)))
  );

revoke update on public.notifications from authenticated;
grant update(read_at) on public.notifications to authenticated;

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
    if new.department_id is distinct from old.department_id then changed := array_append(changed, 'מחלקה'); end if;
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

drop trigger if exists trg_notify_driver_profile_update on public.profiles;
create trigger trg_notify_driver_profile_update
  after update on public.profiles
  for each row execute function private.notify_driver_profile_update();

drop trigger if exists trg_notify_driver_details_update on public.driver_details;
create trigger trg_notify_driver_details_update
  after update on public.driver_details
  for each row execute function private.notify_driver_profile_update();

create or replace function private.notify_driver_vehicle_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_name text;
  vehicle_label text;
  notification_message text;
begin
  if (select auth.uid()) is null
     or new.driver_id = (select auth.uid())
     or not (select private.can_manage_company(new.company_id)) then
    return new;
  end if;

  if tg_op = 'INSERT' and new.unassigned_at is null then
    notification_message := 'שויכת לרכב ';
  elsif tg_op = 'UPDATE' and old.unassigned_at is not null and new.unassigned_at is null then
    notification_message := 'שויכת לרכב ';
  elsif tg_op = 'UPDATE' and old.unassigned_at is null and new.unassigned_at is not null then
    notification_message := 'השיוך שלך לרכב הוסר: ';
  else
    return new;
  end if;

  select profile.full_name into actor_name
    from public.profiles profile
    where profile.id = (select auth.uid());
  select concat_ws(' ', vehicle.manufacturer, vehicle.model, '(' || vehicle.plate_number || ')')
    into vehicle_label
    from public.vehicles vehicle
    where vehicle.id = new.vehicle_id;

  insert into public.notifications (
    company_id, actor_id, actor_name, recipient_id, message, notification_type
  ) values (
    new.company_id,
    (select auth.uid()),
    coalesce(actor_name, 'מנהל'),
    new.driver_id,
    notification_message || coalesce(vehicle_label, 'רכב'),
    'vehicle_assignment'
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_driver_vehicle_assignment on public.vehicle_drivers;
create trigger trg_notify_driver_vehicle_assignment
  after insert or update of unassigned_at on public.vehicle_drivers
  for each row execute function private.notify_driver_vehicle_assignment();

revoke execute on function private.notify_driver_profile_update() from public, anon, authenticated;
revoke execute on function private.notify_driver_vehicle_assignment() from public, anon, authenticated;
