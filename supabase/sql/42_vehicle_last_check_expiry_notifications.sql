-- Vehicle inspection items that are tracked by "last inspection date"
-- should still behave like expiring records even when no explicit
-- "next date" was entered. This migration:
-- 1. Extends notification type constraints/preferences with one new type.
-- 2. Resets the one-time expiry marker when last_date changes too.
-- 3. Expands the daily expiry scan to:
--    - keep the current pre-expiry admin alerts for explicit expiry dates
--    - add post-expiry alerts for inspections whose validity is derived
--      from last_date
--    - notify both admins and every currently assigned driver
--      (recipient_id per driver) once per expired compliance item.

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (
  notification_type is null or notification_type in (
    'driver_profile_update',
    'driver_document_upload',
    'vehicle_insurance_mandatory_expiry',
    'vehicle_insurance_comprehensive_expiry',
    'vehicle_annual_test_expiry',
    'vehicle_inspection_last_date_expiry',
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
      'vehicle_inspection_last_date_expiry',
      'vehicle_service_due',
      'driver_document_renewal',
      'signature_request_assigned',
      'vehicle_assignment',
      'driver_profile_updated_by_manager'
    )
  );

create or replace function public.reset_compliance_notified()
returns trigger
language plpgsql
as $$
begin
  if new.expiry_date is distinct from old.expiry_date
     or new.last_date is distinct from old.last_date then
    new.expiry_notified_at := null;
  end if;
  return new;
end;
$$;

create or replace function public.check_vehicle_expiry_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  item_label text;
  vehicle_label text;
  item_notification_type text;
  remaining_days integer;
begin
  for r in
    select ci.id as compliance_id, ci.company_id, ci.item_type, ci.expiry_date,
           v.id as vehicle_id, v.plate_number, v.manufacturer, v.model
    from public.compliance_items ci
    join public.vehicles v on v.id = ci.owner_id and ci.owner_type = 'vehicle'
    where ci.item_type in ('insurance_mandatory', 'insurance_comprehensive', 'annual_test')
      and ci.expiry_date is not null
      and ci.expiry_date - current_date between 0 and 20
      and ci.expiry_notified_at is null
  loop
    item_label := case r.item_type
      when 'insurance_mandatory' then 'ביטוח חובה'
      when 'insurance_comprehensive' then 'ביטוח מקיף'
      when 'annual_test' then 'טסט שנתי'
      else r.item_type
    end;
    item_notification_type := case r.item_type
      when 'insurance_mandatory' then 'vehicle_insurance_mandatory_expiry'
      when 'insurance_comprehensive' then 'vehicle_insurance_comprehensive_expiry'
      when 'annual_test' then 'vehicle_annual_test_expiry'
    end;
    vehicle_label := trim(both ' ' from coalesce(r.manufacturer, '') || ' ' || coalesce(r.model, ''))
      || ' (' || r.plate_number || ')';

    insert into public.notifications (company_id, message, notification_type)
    values (
      r.company_id,
      'לרכב ' || vehicle_label || ' נותרו ' || (r.expiry_date - current_date)
        || ' ימים לחידוש ' || item_label || ' (בתוקף עד ' || to_char(r.expiry_date, 'DD/MM/YYYY') || ')',
      item_notification_type
    );

    update public.compliance_items set expiry_notified_at = now() where id = r.compliance_id;
  end loop;

  for r in
    with derived_expiries as (
      select
        ci.id as compliance_id,
        ci.company_id,
        ci.owner_id as vehicle_id,
        ci.item_type,
        ci.last_date,
        (
          case ci.item_type
            when 'annual_test' then ci.last_date + 365
            when 'brakes_semiannual' then ci.last_date + 183
            when 'winter_check' then ci.last_date + 365
            when 'child_detection' then ci.last_date + 365
            when 'safety_officer' then ci.last_date + 365
            else null
          end
        ) as target_date
      from public.compliance_items ci
      where ci.owner_type = 'vehicle'
        and ci.item_type in ('annual_test', 'brakes_semiannual', 'winter_check', 'child_detection', 'safety_officer')
        and ci.last_date is not null
        and ci.expiry_date is null
        and ci.expiry_notified_at is null
    )
    select
      de.compliance_id,
      de.company_id,
      de.vehicle_id,
      de.item_type,
      de.last_date,
      de.target_date,
      v.plate_number,
      v.manufacturer,
      v.model
    from derived_expiries de
    join public.vehicles v on v.id = de.vehicle_id
    where de.target_date is not null
      and de.target_date < current_date
  loop
    item_label := case r.item_type
      when 'annual_test' then 'טסט שנתי'
      when 'brakes_semiannual' then 'בדיקת בלמים חצי-שנתית'
      when 'winter_check' then 'בדיקת חורף'
      when 'child_detection' then 'בדיקת שכחת ילדים'
      when 'safety_officer' then 'ביקורת קצב"ת'
      else r.item_type
    end;
    vehicle_label := trim(both ' ' from coalesce(r.manufacturer, '') || ' ' || coalesce(r.model, ''))
      || ' (' || r.plate_number || ')';
    remaining_days := current_date - r.target_date;

    insert into public.notifications (company_id, message, notification_type)
    values (
      r.company_id,
      item_label || ' של הרכב ' || vehicle_label || ' פגה לפני ' || remaining_days
        || ' ימים. בדיקה אחרונה: ' || to_char(r.last_date, 'DD/MM/YYYY'),
      'vehicle_inspection_last_date_expiry'
    );

    insert into public.notifications (company_id, recipient_id, message, notification_type)
    select
      r.company_id,
      vd.driver_id,
      item_label || ' של הרכב שלך ' || vehicle_label || ' פגה לפני ' || remaining_days
        || ' ימים. בדיקה אחרונה: ' || to_char(r.last_date, 'DD/MM/YYYY'),
      'vehicle_inspection_last_date_expiry'
    from public.vehicle_drivers vd
    where vd.vehicle_id = r.vehicle_id
      and vd.unassigned_at is null;

    update public.compliance_items set expiry_notified_at = now() where id = r.compliance_id;
  end loop;

  for r in
    select v.id as vehicle_id, v.company_id, v.plate_number, v.manufacturer, v.model,
           v.odometer, v.next_service_km
    from public.vehicles v
    where v.next_service_km is not null
      and v.next_service_km - v.odometer between 0 and 1000
      and v.service_notified_at is null
  loop
    vehicle_label := trim(both ' ' from coalesce(r.manufacturer, '') || ' ' || coalesce(r.model, ''))
      || ' (' || r.plate_number || ')';

    insert into public.notifications (company_id, message, notification_type)
    values (
      r.company_id,
      'לרכב ' || vehicle_label || ' נותרו ' || (r.next_service_km - r.odometer) || ' ק"מ לטיפול הבא',
      'vehicle_service_due'
    );

    update public.vehicles set service_notified_at = now() where id = r.vehicle_id;
  end loop;
end;
$$;
