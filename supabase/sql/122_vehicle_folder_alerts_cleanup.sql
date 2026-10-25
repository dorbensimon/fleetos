-- Vehicle folder expiry alerts: one alert per folder the manager actually sees.
--
-- * New: "מסמך תסקיר מהנדס" (compliance item engineer_report) and
--   "נספח לרישיון" (document folder license_annex) ask for an expiry on
--   upload but never raised an alert.
-- * Dropped: "טסט שנתי" (annual_test) — its folder is hidden on vehicle
--   records, the vehicle licence is renewed with the test and has its own
--   alert; and uploaded files in "בדיקות קצין בטיחות"
--   (safety_officer_approval) — that folder's due date is the next
--   inspection, alerted by check_vehicle_safety_check_due (migration 103/115).
--
-- Applied to production with Dor's approval on 2026-10-25.

begin;

-- ------------------------------------------------------------
-- 1. The two new types
-- ------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (
  notification_type is null or notification_type = any (array[
    'driver_profile_update', 'driver_document_upload', 'vehicle_insurance_mandatory_expiry',
    'vehicle_insurance_comprehensive_expiry', 'vehicle_annual_test_expiry', 'vehicle_inspection_last_date_expiry',
    'vehicle_service_due', 'driver_document_renewal', 'signature_request_assigned', 'vehicle_assignment',
    'driver_profile_updated_by_manager', 'driver_odometer_update', 'license_update_requested',
    'license_update_reviewed', 'vehicle_license_expiry', 'vehicle_operating_license_expiry',
    'vehicle_safety_officer_approval_expiry', 'vehicle_tachograph_calibration_expiry',
    'vehicle_brakes_semiannual_expiry', 'vehicle_brakes_annual_expiry', 'vehicle_winter_inspection_expiry',
    'vehicle_child_detection_expiry', 'driver_meeting_due', 'driver_license_expiry',
    'company_carrier_license_expiry', 'vehicle_odometer_stale', 'signature_request_completed',
    'vehicle_safety_check_due', 'signature_expiry', 'vehicle_custom_folder_expiry',
    'driver_custom_folder_expiry', 'driver_extra_expiry',
    'vehicle_engineer_report_expiry', 'vehicle_license_annex_expiry'
  ]::text[])
);

alter table public.notification_preferences drop constraint if exists notification_preferences_notification_type_check;
alter table public.notification_preferences add constraint notification_preferences_notification_type_check check (
  notification_type = any (array[
    'driver_profile_update', 'driver_document_upload', 'vehicle_insurance_mandatory_expiry',
    'vehicle_insurance_comprehensive_expiry', 'vehicle_annual_test_expiry', 'vehicle_service_due',
    'driver_document_renewal', 'signature_request_assigned', 'vehicle_assignment',
    'driver_profile_updated_by_manager', 'vehicle_license_expiry', 'vehicle_operating_license_expiry',
    'vehicle_safety_officer_approval_expiry', 'vehicle_tachograph_calibration_expiry',
    'vehicle_brakes_semiannual_expiry', 'vehicle_brakes_annual_expiry', 'vehicle_winter_inspection_expiry',
    'vehicle_child_detection_expiry', 'driver_meeting_due', 'license_update_requested',
    'license_update_reviewed', 'driver_license_expiry', 'company_carrier_license_expiry',
    'vehicle_odometer_stale', 'signature_request_completed', 'owner_company_activated', 'owner_admin_added',
    'owner_company_not_activated', 'owner_company_inactive', 'owner_carrier_license_expiry',
    'owner_trial_ending', 'owner_renewal_due', 'owner_vehicle_limit', 'vehicle_safety_check_due',
    'signature_expiry', 'vehicle_custom_folder_expiry', 'driver_custom_folder_expiry', 'driver_extra_expiry',
    'vehicle_engineer_report_expiry', 'vehicle_license_annex_expiry'
  ]::text[])
);

create or replace function private.notification_lead_bounds(p_type text, out min_value integer, out max_value integer)
language sql
immutable
set search_path to ''
as $$
  select b.min_value, b.max_value from (values
    ('vehicle_license_expiry', 1, 90),
    ('vehicle_operating_license_expiry', 1, 90),
    ('vehicle_insurance_mandatory_expiry', 1, 90),
    ('vehicle_insurance_comprehensive_expiry', 1, 90),
    ('vehicle_annual_test_expiry', 1, 90),
    ('vehicle_safety_officer_approval_expiry', 1, 90),
    ('vehicle_tachograph_calibration_expiry', 1, 90),
    ('vehicle_brakes_semiannual_expiry', 1, 90),
    ('vehicle_brakes_annual_expiry', 1, 90),
    ('vehicle_winter_inspection_expiry', 1, 90),
    ('vehicle_child_detection_expiry', 1, 90),
    ('vehicle_engineer_report_expiry', 1, 90),
    ('vehicle_license_annex_expiry', 1, 90),
    ('vehicle_custom_folder_expiry', 1, 90),
    ('driver_custom_folder_expiry', 1, 90),
    ('driver_extra_expiry', 1, 90),
    ('driver_meeting_due', 1, 30),
    ('vehicle_service_due', 100, 5000),
    ('driver_license_expiry', 1, 90),
    ('company_carrier_license_expiry', 1, 90),
    ('vehicle_odometer_stale', 7, 90),
    ('vehicle_safety_check_due', 1, 30)
  ) as b(notification_type, min_value, max_value)
  where b.notification_type = p_type
$$;

-- ------------------------------------------------------------
-- 2. The daily scan: the live definition with the folder lists changed
-- ------------------------------------------------------------

create or replace function public.check_vehicle_expiry_notifications()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  item_label text;
  vehicle_label text;
  item_notification_type text;
  date_label text;
  admin_message text;
  driver_message text;
begin
  for r in
    with folders as (
      select ci.company_id, ci.owner_id as vehicle_id, ci.item_type as folder_key, ci.expiry_date
      from public.compliance_items ci
      where ci.owner_type = 'vehicle'
        and ci.item_type in ('vehicle_license', 'operating_license', 'insurance_mandatory', 'insurance_comprehensive', 'engineer_report')
      union all
      select latest.company_id, latest.vehicle_id, latest.folder_key, latest.expiry_date
      from (
        select distinct on (d.owner_id, d.category)
               d.company_id, d.owner_id as vehicle_id, d.category as folder_key, d.expiry_date
        from public.documents d
        where d.owner_type = 'vehicle'
          and (
            d.category in ('license_annex', 'tachograph_calibration', 'brakes_semiannual',
                           'brakes_annual', 'winter_inspection', 'child_detection')
            or exists (
              select 1 from public.company_document_folders f
              where 'folder:' || f.id::text = d.category
                and f.company_id = d.company_id
                and f.owner_type = 'vehicle'
                and f.tracks_expiry
            )
          )
        order by d.owner_id, d.category, d.created_at desc
      ) latest
    ),
    candidates as (
      select f.company_id, f.vehicle_id, f.folder_key, f.expiry_date,
             v.plate_number, v.manufacturer, v.model,
             case
               when f.expiry_date <= current_date then 'expired'
               when f.expiry_date - current_date <= coalesce(
                 (c.notification_lead_days ->> (case
                   when f.folder_key like 'folder:%' then 'vehicle_custom_folder_expiry'
                   else case f.folder_key
                   when 'vehicle_license' then 'vehicle_license_expiry'
                   when 'operating_license' then 'vehicle_operating_license_expiry'
                   when 'insurance_mandatory' then 'vehicle_insurance_mandatory_expiry'
                   when 'insurance_comprehensive' then 'vehicle_insurance_comprehensive_expiry'
                   when 'engineer_report' then 'vehicle_engineer_report_expiry'
                   when 'license_annex' then 'vehicle_license_annex_expiry'
                   when 'tachograph_calibration' then 'vehicle_tachograph_calibration_expiry'
                   when 'brakes_semiannual' then 'vehicle_brakes_semiannual_expiry'
                   when 'brakes_annual' then 'vehicle_brakes_annual_expiry'
                   when 'winter_inspection' then 'vehicle_winter_inspection_expiry'
                   when 'child_detection' then 'vehicle_child_detection_expiry'
                   end
                 end))::integer,
                 c.vehicle_expiry_lead_days
               ) then 'before'
             end as stage
      from folders f
      join public.vehicles v on v.id = f.vehicle_id and v.status <> 'archived'
      join public.companies c on c.id = f.company_id
      where f.expiry_date is not null
    )
    select ca.*
    from candidates ca
    where ca.stage is not null
      and not exists (
        select 1 from public.vehicle_expiry_alerts a
        where a.vehicle_id = ca.vehicle_id
          and a.folder_key = ca.folder_key
          and a.expiry_date = ca.expiry_date
          and a.stage = ca.stage
      )
  loop
    if r.folder_key like 'folder:%' then
      select f.title into item_label from public.company_document_folders f where 'folder:' || f.id::text = r.folder_key;
      item_notification_type := 'vehicle_custom_folder_expiry';
    else
      item_label := case r.folder_key
        when 'vehicle_license' then 'רישיון רכב'
        when 'operating_license' then 'רישיון הפעלה'
        when 'insurance_mandatory' then 'ביטוח חובה'
        when 'insurance_comprehensive' then 'ביטוח מקיף'
        when 'engineer_report' then 'מסמך תסקיר מהנדס'
        when 'license_annex' then 'נספח לרישיון'
        when 'tachograph_calibration' then 'כיול טכוגרף'
        when 'brakes_semiannual' then 'בלמים חצי-שנתי'
        when 'brakes_annual' then 'בלמים שנתי'
        when 'winter_inspection' then 'בדיקת חורף'
        when 'child_detection' then 'שכחת ילדים'
      end;
      item_notification_type := case r.folder_key
        when 'vehicle_license' then 'vehicle_license_expiry'
        when 'operating_license' then 'vehicle_operating_license_expiry'
        when 'insurance_mandatory' then 'vehicle_insurance_mandatory_expiry'
        when 'insurance_comprehensive' then 'vehicle_insurance_comprehensive_expiry'
        when 'engineer_report' then 'vehicle_engineer_report_expiry'
        when 'license_annex' then 'vehicle_license_annex_expiry'
        when 'tachograph_calibration' then 'vehicle_tachograph_calibration_expiry'
        when 'brakes_semiannual' then 'vehicle_brakes_semiannual_expiry'
        when 'brakes_annual' then 'vehicle_brakes_annual_expiry'
        when 'winter_inspection' then 'vehicle_winter_inspection_expiry'
        when 'child_detection' then 'vehicle_child_detection_expiry'
      end;
    end if;
    vehicle_label := trim(both ' ' from coalesce(r.manufacturer, '') || ' ' || coalesce(r.model, ''))
      || ' (' || r.plate_number || ')';
    date_label := to_char(r.expiry_date, 'DD/MM/YYYY');

    if r.stage = 'expired' then
      admin_message := 'תוקף ' || item_label || ' של הרכב ' || vehicle_label || ' פג ב-' || date_label;
      driver_message := 'תוקף ' || item_label || ' של הרכב שלך ' || vehicle_label || ' פג ב-' || date_label;
    else
      admin_message := 'תוקף ' || item_label || ' של הרכב ' || vehicle_label || ' יפוג בעוד '
        || (r.expiry_date - current_date) || ' ימים (' || date_label || ')';
      driver_message := 'תוקף ' || item_label || ' של הרכב שלך ' || vehicle_label || ' יפוג בעוד '
        || (r.expiry_date - current_date) || ' ימים (' || date_label || ')';
    end if;

    insert into public.notifications (company_id, message, notification_type, vehicle_id, folder_key)
    values (r.company_id, admin_message, item_notification_type, r.vehicle_id, r.folder_key);

    insert into public.notifications (company_id, recipient_id, message, notification_type, vehicle_id, folder_key)
    select r.company_id, vd.driver_id, driver_message, item_notification_type, r.vehicle_id, r.folder_key
    from public.vehicle_drivers vd
    where vd.vehicle_id = r.vehicle_id
      and vd.unassigned_at is null
      and vd.driver_id is not null;

    insert into public.vehicle_expiry_alerts (company_id, vehicle_id, folder_key, expiry_date, stage)
    values (r.company_id, r.vehicle_id, r.folder_key, r.expiry_date, r.stage)
    on conflict on constraint vehicle_expiry_alerts_unique do nothing;
  end loop;

  for r in
    select v.id as vehicle_id, v.company_id, v.plate_number, v.manufacturer, v.model,
           v.odometer, v.next_service_km
    from public.vehicles v
    join public.companies c on c.id = v.company_id
    where v.next_service_km is not null
      and v.next_service_km - v.odometer <= coalesce((c.notification_lead_days ->> 'vehicle_service_due')::integer, 1000)
      and v.service_notified_at is null
  loop
    vehicle_label := trim(both ' ' from coalesce(r.manufacturer, '') || ' ' || coalesce(r.model, ''))
      || ' (' || r.plate_number || ')';

    insert into public.notifications (company_id, message, notification_type)
    values (
      r.company_id,
      case
        when r.next_service_km - r.odometer <= 0 then
          'הרכב ' || vehicle_label || ' עבר את מועד הטיפול ב-' || (r.odometer - r.next_service_km) || ' ק"מ'
        else
          'לרכב ' || vehicle_label || ' נותרו ' || (r.next_service_km - r.odometer) || ' ק"מ לטיפול הבא'
      end,
      'vehicle_service_due'
    );

    update public.vehicles set service_notified_at = now() where id = r.vehicle_id;
  end loop;
end;
$function$;

commit;
