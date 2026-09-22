-- Vehicle folder expiry notifications.
--
-- Every vehicle folder that carries an expiry date now raises two alerts:
-- one when the expiry enters the company's lead window (default 20 days)
-- and one on the day it expires. Both go to the company's admins and to
-- every driver currently assigned to the vehicle. Each folder has its own
-- notification type, so it gets its own on/off toggle per user (enforced
-- by the existing notifications SELECT policy and the push dispatcher,
-- which both read notification_preferences generically).
--
-- Folders and where their expiry comes from:
--   compliance_items.expiry_date  — vehicle_license, operating_license,
--     insurance_mandatory, insurance_comprehensive, annual_test
--     (annual_test falls back to last_date + 365, as in the app)
--   newest document in the folder — safety_officer_approval,
--     tachograph_calibration, brakes_semiannual, brakes_annual,
--     winter_inspection, child_detection ("general" is excluded)
--
-- Replaces the old insurance/annual-test loop (20 days before, admins only)
-- in check_vehicle_expiry_notifications. The service loop from 89 is kept
-- unchanged. Supersedes 42_vehicle_last_check_expiry_notifications.sql,
-- which was never applied and was removed.

-- ------------------------------------------------------------
-- 1. Company-level lead time
-- ------------------------------------------------------------

alter table public.companies
  add column if not exists vehicle_expiry_lead_days integer not null default 20;

alter table public.companies drop constraint if exists companies_vehicle_expiry_lead_days_check;
alter table public.companies
  add constraint companies_vehicle_expiry_lead_days_check check (vehicle_expiry_lead_days between 1 and 90);

-- Company rows are writable only by the platform owner under RLS, so
-- company admins change this one setting through a narrow function.
create or replace function public.set_vehicle_expiry_lead_days(p_company_id uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.can_manage_company(p_company_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'lead days must be between 1 and 90' using errcode = '22023';
  end if;
  update public.companies set vehicle_expiry_lead_days = p_days where id = p_company_id;
end;
$$;

revoke execute on function public.set_vehicle_expiry_lead_days(uuid, integer) from public, anon;
grant execute on function public.set_vehicle_expiry_lead_days(uuid, integer) to authenticated;

-- ------------------------------------------------------------
-- 2. Deep-link target on notifications
-- ------------------------------------------------------------

alter table public.notifications
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null,
  add column if not exists folder_key text;

create index if not exists notifications_vehicle_id_idx on public.notifications (vehicle_id);

-- ------------------------------------------------------------
-- 3. Notification types (one per folder)
-- ------------------------------------------------------------
-- Both lists are the live lists (verified 2026-09-22) plus the 8 new
-- folder types; insurance and annual-test keep their existing types so
-- users' current on/off choices carry over.

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
    'driver_profile_updated_by_manager',
    'driver_odometer_update',
    'license_update_requested',
    'license_update_reviewed',
    'vehicle_license_expiry',
    'vehicle_operating_license_expiry',
    'vehicle_safety_officer_approval_expiry',
    'vehicle_tachograph_calibration_expiry',
    'vehicle_brakes_semiannual_expiry',
    'vehicle_brakes_annual_expiry',
    'vehicle_winter_inspection_expiry',
    'vehicle_child_detection_expiry'
  )
);

alter table public.notification_preferences drop constraint if exists notification_preferences_notification_type_check;
alter table public.notification_preferences add constraint notification_preferences_notification_type_check check (
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
    'driver_profile_updated_by_manager',
    'vehicle_license_expiry',
    'vehicle_operating_license_expiry',
    'vehicle_safety_officer_approval_expiry',
    'vehicle_tachograph_calibration_expiry',
    'vehicle_brakes_semiannual_expiry',
    'vehicle_brakes_annual_expiry',
    'vehicle_winter_inspection_expiry',
    'vehicle_child_detection_expiry'
  )
);

-- ------------------------------------------------------------
-- 4. Sent-alert ledger
-- ------------------------------------------------------------
-- One row per (vehicle, folder, expiry date, stage). A new upload or a
-- changed date is a new expiry_date, so its alerts fire again on their own.

create table if not exists public.vehicle_expiry_alerts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  folder_key  text not null,
  expiry_date date not null,
  stage       text not null check (stage in ('before', 'expired')),
  sent_at     timestamptz not null default now(),
  constraint vehicle_expiry_alerts_unique unique (vehicle_id, folder_key, expiry_date, stage)
);

alter table public.vehicle_expiry_alerts enable row level security;
revoke all on public.vehicle_expiry_alerts from anon, authenticated;

-- The old loop already sent its "20 days before" alert for these rows;
-- record that so the new loop doesn't send the same alert a second time.
insert into public.vehicle_expiry_alerts (company_id, vehicle_id, folder_key, expiry_date, stage)
select ci.company_id, ci.owner_id, ci.item_type, ci.expiry_date, 'before'
from public.compliance_items ci
where ci.owner_type = 'vehicle'
  and ci.item_type in ('insurance_mandatory', 'insurance_comprehensive', 'annual_test')
  and ci.expiry_date is not null
  and ci.expiry_notified_at is not null
on conflict on constraint vehicle_expiry_alerts_unique do nothing;

-- ------------------------------------------------------------
-- 5. The daily scan
-- ------------------------------------------------------------

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
  date_label text;
  admin_message text;
  driver_message text;
begin
  for r in
    with folders as (
      select ci.company_id, ci.owner_id as vehicle_id, ci.item_type as folder_key,
             case when ci.item_type = 'annual_test' then coalesce(ci.expiry_date, ci.last_date + 365)
                  else ci.expiry_date end as expiry_date
      from public.compliance_items ci
      where ci.owner_type = 'vehicle'
        and ci.item_type in ('vehicle_license', 'operating_license', 'insurance_mandatory', 'insurance_comprehensive', 'annual_test')
      union all
      select latest.company_id, latest.vehicle_id, latest.folder_key, latest.expiry_date
      from (
        select distinct on (d.owner_id, d.category)
               d.company_id, d.owner_id as vehicle_id, d.category as folder_key, d.expiry_date
        from public.documents d
        where d.owner_type = 'vehicle'
          and d.category in ('safety_officer_approval', 'tachograph_calibration', 'brakes_semiannual',
                             'brakes_annual', 'winter_inspection', 'child_detection')
        order by d.owner_id, d.category, d.created_at desc
      ) latest
    ),
    candidates as (
      select f.company_id, f.vehicle_id, f.folder_key, f.expiry_date,
             v.plate_number, v.manufacturer, v.model,
             case
               when f.expiry_date <= current_date then 'expired'
               when f.expiry_date - current_date <= c.vehicle_expiry_lead_days then 'before'
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
    item_label := case r.folder_key
      when 'vehicle_license' then 'רישיון רכב'
      when 'operating_license' then 'רישיון הפעלה'
      when 'insurance_mandatory' then 'ביטוח חובה'
      when 'insurance_comprehensive' then 'ביטוח מקיף'
      when 'annual_test' then 'טסט שנתי'
      when 'safety_officer_approval' then 'אישור קצין בטיחות'
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
      when 'annual_test' then 'vehicle_annual_test_expiry'
      when 'safety_officer_approval' then 'vehicle_safety_officer_approval_expiry'
      when 'tachograph_calibration' then 'vehicle_tachograph_calibration_expiry'
      when 'brakes_semiannual' then 'vehicle_brakes_semiannual_expiry'
      when 'brakes_annual' then 'vehicle_brakes_annual_expiry'
      when 'winter_inspection' then 'vehicle_winter_inspection_expiry'
      when 'child_detection' then 'vehicle_child_detection_expiry'
    end;
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
    where v.next_service_km is not null
      and v.next_service_km - v.odometer <= 1000
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
$$;
