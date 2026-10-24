-- 119_driver_extra_dates.sql
--
-- Seven new driver details, edited by the company's managers only (the driver
-- self-edit allowlist in 92 blocks every column it does not list):
--   work_at_height_expiry, port_entry_expiry, forklift_refresher_expiry  dates
--   hazmat_approved + hazmat_permit_expiry  yes/no, and the permit date (only with "yes")
--   employment_end_date                     last day of work; stops expiry alerts
--   previously_disqualified                 yes/no
--
-- One new alert kind, `driver_extra_expiry`, covers the four expiry dates. It
-- reuses the company's lead-time setting, and sends one alert per stage
-- ("before" / "expired") to the managers and to the driver.

alter table public.driver_details
  add column if not exists work_at_height_expiry date,
  add column if not exists port_entry_expiry date,
  add column if not exists forklift_refresher_expiry date,
  add column if not exists hazmat_approved boolean not null default false,
  add column if not exists hazmat_permit_expiry date,
  add column if not exists employment_end_date date,
  add column if not exists previously_disqualified boolean not null default false;

alter table public.driver_details drop constraint if exists driver_details_hazmat_permit_needs_approval;
alter table public.driver_details add constraint driver_details_hazmat_permit_needs_approval
  check (hazmat_approved or hazmat_permit_expiry is null);

alter table public.driver_details drop constraint if exists driver_details_employment_end_after_start;
alter table public.driver_details add constraint driver_details_employment_end_after_start
  check (employment_end_date is null or employment_start_date is null or employment_end_date >= employment_start_date);

/* ---------------- alert kind ---------------- */

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (
  notification_type is null or notification_type = any (array[
    'driver_profile_update', 'driver_document_upload', 'vehicle_insurance_mandatory_expiry',
    'vehicle_insurance_comprehensive_expiry', 'vehicle_annual_test_expiry', 'vehicle_inspection_last_date_expiry',
    'vehicle_service_due', 'driver_document_renewal', 'signature_request_assigned', 'vehicle_assignment',
    'driver_profile_updated_by_manager', 'driver_odometer_update', 'license_update_requested', 'license_update_reviewed',
    'vehicle_license_expiry', 'vehicle_operating_license_expiry', 'vehicle_safety_officer_approval_expiry',
    'vehicle_tachograph_calibration_expiry', 'vehicle_brakes_semiannual_expiry', 'vehicle_brakes_annual_expiry',
    'vehicle_winter_inspection_expiry', 'vehicle_child_detection_expiry', 'driver_meeting_due', 'driver_license_expiry',
    'company_carrier_license_expiry', 'vehicle_odometer_stale', 'signature_request_completed', 'vehicle_safety_check_due',
    'signature_expiry', 'vehicle_custom_folder_expiry', 'driver_custom_folder_expiry', 'driver_extra_expiry'
  ]::text[])
);

alter table public.notification_preferences drop constraint if exists notification_preferences_notification_type_check;
alter table public.notification_preferences add constraint notification_preferences_notification_type_check check (
  notification_type = any (array[
    'driver_profile_update', 'driver_document_upload', 'vehicle_insurance_mandatory_expiry',
    'vehicle_insurance_comprehensive_expiry', 'vehicle_annual_test_expiry', 'vehicle_service_due',
    'driver_document_renewal', 'signature_request_assigned', 'vehicle_assignment', 'driver_profile_updated_by_manager',
    'vehicle_license_expiry', 'vehicle_operating_license_expiry', 'vehicle_safety_officer_approval_expiry',
    'vehicle_tachograph_calibration_expiry', 'vehicle_brakes_semiannual_expiry', 'vehicle_brakes_annual_expiry',
    'vehicle_winter_inspection_expiry', 'vehicle_child_detection_expiry', 'driver_meeting_due',
    'license_update_requested', 'license_update_reviewed', 'driver_license_expiry', 'company_carrier_license_expiry',
    'vehicle_odometer_stale', 'signature_request_completed', 'owner_company_activated', 'owner_admin_added',
    'owner_company_not_activated', 'owner_company_inactive', 'owner_carrier_license_expiry', 'owner_trial_ending',
    'owner_renewal_due', 'owner_vehicle_limit', 'vehicle_safety_check_due', 'signature_expiry',
    'vehicle_custom_folder_expiry', 'driver_custom_folder_expiry', 'driver_extra_expiry'
  ]::text[])
);

-- How far ahead the alert may be set (the notification settings screen).
create or replace function private.notification_lead_bounds(p_type text, out min_value integer, out max_value integer)
returns record
language sql
immutable
set search_path to ''
as $function$
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
$function$;

/* ---------------- daily check ---------------- */

create table if not exists public.driver_date_expiry_alerts (
  company_id uuid not null references public.companies(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  field_key text not null check (field_key in ('work_at_height', 'port_entry', 'forklift_refresher', 'hazmat_permit')),
  expiry_date date not null,
  stage text not null check (stage in ('before', 'expired')),
  created_at timestamptz not null default now(),
  constraint driver_date_expiry_alerts_unique unique (driver_id, field_key, expiry_date, stage)
);
alter table public.driver_date_expiry_alerts enable row level security;
revoke all on public.driver_date_expiry_alerts from anon, authenticated;

create or replace function public.check_driver_date_expiry_notifications()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  date_label text;
begin
  for r in
    with fields as (
      select dd.id as driver_id, dd.company_id, 'work_at_height' as field_key, 'עבודה בגובה' as title, dd.work_at_height_expiry as expiry_date from public.driver_details dd
      union all
      select dd.id, dd.company_id, 'port_entry', 'כניסה לנמל', dd.port_entry_expiry from public.driver_details dd
      union all
      select dd.id, dd.company_id, 'forklift_refresher', 'ריענון מלגזה', dd.forklift_refresher_expiry from public.driver_details dd
      union all
      select dd.id, dd.company_id, 'hazmat_permit', 'היתר חומ"ס', dd.hazmat_permit_expiry from public.driver_details dd where dd.hazmat_approved
    ),
    candidates as (
      select f.*, p.full_name,
             case
               when f.expiry_date <= current_date then 'expired'
               when f.expiry_date - current_date <= coalesce((c.notification_lead_days ->> 'driver_extra_expiry')::integer, 30) then 'before'
             end as stage
      from fields f
      join public.profiles p on p.id = f.driver_id and p.role = 'driver'
      join public.driver_details dd on dd.id = f.driver_id
      join public.companies c on c.id = f.company_id and c.status = 'active'
      where f.expiry_date is not null
        and dd.status <> 'archived'
        -- A driver whose work has ended gets no more alerts.
        and (dd.employment_end_date is null or dd.employment_end_date >= current_date)
    )
    select ca.* from candidates ca
    where ca.stage is not null
      and not exists (
        select 1 from public.driver_date_expiry_alerts a
        where a.driver_id = ca.driver_id and a.field_key = ca.field_key
          and a.expiry_date = ca.expiry_date and a.stage = ca.stage
      )
  loop
    date_label := to_char(r.expiry_date, 'DD/MM/YYYY');

    insert into public.notifications (company_id, actor_id, actor_name, message, notification_type)
    values (
      r.company_id, r.driver_id, r.full_name,
      case when r.stage = 'expired'
        then 'תוקף ' || r.title || ' של הנהג ' || coalesce(r.full_name, '') || ' פג ב-' || date_label
        else 'תוקף ' || r.title || ' של הנהג ' || coalesce(r.full_name, '') || ' יפוג בעוד ' || (r.expiry_date - current_date) || ' ימים (' || date_label || ')'
      end,
      'driver_extra_expiry'
    );

    insert into public.notifications (company_id, recipient_id, actor_id, actor_name, message, notification_type)
    values (
      r.company_id, r.driver_id, r.driver_id, r.full_name,
      case when r.stage = 'expired'
        then 'תוקף ' || r.title || ' שלך פג ב-' || date_label
        else 'תוקף ' || r.title || ' שלך יפוג בעוד ' || (r.expiry_date - current_date) || ' ימים (' || date_label || ')'
      end,
      'driver_extra_expiry'
    );

    insert into public.driver_date_expiry_alerts (company_id, driver_id, field_key, expiry_date, stage)
    values (r.company_id, r.driver_id, r.field_key, r.expiry_date, r.stage)
    on conflict on constraint driver_date_expiry_alerts_unique do nothing;
  end loop;
end;
$function$;

revoke all on function public.check_driver_date_expiry_notifications() from public, anon, authenticated;

select cron.schedule('check-driver-date-expiry-notifications', '15 3 * * *', $$ select public.check_driver_date_expiry_notifications() $$);
