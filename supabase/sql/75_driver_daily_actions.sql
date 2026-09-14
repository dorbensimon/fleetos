-- Protected odometer updates for drivers.

create or replace function public.update_own_vehicle_odometer(p_vehicle_id uuid, p_odometer integer) returns public.vehicles language plpgsql security definer set search_path = '' as $$
declare current_vehicle public.vehicles; caller_company uuid;
begin
  select p.company_id into caller_company from public.profiles p where p.id = (select auth.uid()) and p.role = 'driver';
  if caller_company is null then raise exception 'הפעולה זמינה לנהג מחובר בלבד'; end if;
  select v.* into current_vehicle from public.vehicles v where v.id = p_vehicle_id and v.company_id = caller_company for update;
  if current_vehicle.id is null or not exists (select 1 from public.vehicle_drivers vd where vd.vehicle_id = p_vehicle_id and vd.driver_id = (select auth.uid()) and vd.unassigned_at is null) then raise exception 'הרכב אינו משויך אליך'; end if;
  if p_odometer is null or p_odometer < current_vehicle.odometer then raise exception 'לא ניתן להזין קילומטראז׳ נמוך מהקיים'; end if;
  update public.vehicles set odometer = p_odometer, odometer_updated_at = now(), updated_at = now() where id = p_vehicle_id returning * into current_vehicle;
  insert into public.notifications(company_id, actor_id, actor_name, message, notification_type)
  select caller_company, p.id, p.full_name, coalesce(p.full_name, 'נהג') || ' עדכן/ה קילומטראז׳ ברכב ' || current_vehicle.plate_number || ' ל-' || p_odometer || ' ק״מ', 'driver_odometer_update' from public.profiles p where p.id = (select auth.uid());
  return current_vehicle;
end $$;
revoke all on function public.update_own_vehicle_odometer(uuid, integer) from public, anon;
grant execute on function public.update_own_vehicle_odometer(uuid, integer) to authenticated;

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (notification_type is null or notification_type in ('driver_profile_update','driver_document_upload','vehicle_insurance_mandatory_expiry','vehicle_insurance_comprehensive_expiry','vehicle_annual_test_expiry','vehicle_inspection_last_date_expiry','vehicle_service_due','driver_document_renewal','signature_request_assigned','vehicle_assignment','driver_profile_updated_by_manager','driver_odometer_update'));

-- The UI exposes only name and phone to drivers; enforce the same rule in
-- Postgres so a modified client cannot change official manager-owned fields.
create or replace function private.enforce_driver_owned_fields() returns trigger language plpgsql set search_path = '' as $$
declare caller_role text;
begin
  select p.role into caller_role from public.profiles p where p.id = (select auth.uid());
  if (select auth.uid()) is null or (select auth.uid()) is distinct from old.id or caller_role is distinct from 'driver' then return new; end if;
  if tg_table_name = 'profiles' then
    if new.role is distinct from old.role or new.company_id is distinct from old.company_id or new.job_title is distinct from old.job_title then raise exception 'שדה זה ניתן לשינוי על ידי מנהל בלבד'; end if;
  else
    raise exception 'פרטים רשמיים ניתנים לשינוי על ידי מנהל בלבד';
  end if;
  return new;
end $$;
drop trigger if exists trg_enforce_driver_owned_profile_fields on public.profiles;
create trigger trg_enforce_driver_owned_profile_fields before update on public.profiles for each row execute function private.enforce_driver_owned_fields();
drop trigger if exists trg_enforce_driver_owned_detail_fields on public.driver_details;
create trigger trg_enforce_driver_owned_detail_fields before update on public.driver_details for each row execute function private.enforce_driver_owned_fields();
revoke execute on function private.enforce_driver_owned_fields() from public, anon, authenticated;
