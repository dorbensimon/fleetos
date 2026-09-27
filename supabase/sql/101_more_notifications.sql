-- Five notifications a fleet manager can't do without, and two that were
-- already sent but couldn't be switched off.
--
-- Deployment draft: apply only with production approval, after 100.
--
-- New:
--   driver_license_expiry           a driver's driving licence is about to
--                                   expire / expired. Managers and the driver.
--                                   Lead time 1-90 days, default 30.
--   company_carrier_license_expiry  the company's carrier licence (רישיון
--                                   מוביל, companies.carrier_license_expiry).
--                                   Managers. Lead time 1-90 days, default 30.
--   vehicle_odometer_stale          nobody updated a vehicle's odometer for N
--                                   days, so the service alert is blind.
--                                   Managers and the vehicle's drivers.
--                                   Threshold 7-90 days, default 30.
--   signature_request_completed     a driver signed a document. Managers.
--
-- Now switchable (already sent by migration 79):
--   license_update_requested  (managers), license_update_reviewed (drivers).
--
-- Each timed alert goes out once per stage (before / expired / stale) per
-- date, recorded in notification_alert_log, like vehicle_expiry_alerts does
-- for the vehicle folders. Lead times live in companies.notification_lead_days
-- (migration 100) under the type's name.

begin;

-- ------------------------------------------------------------
-- 1. The new types
-- ------------------------------------------------------------

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
    'vehicle_child_detection_expiry',
    'driver_meeting_due',
    'driver_license_expiry',
    'company_carrier_license_expiry',
    'vehicle_odometer_stale',
    'signature_request_completed'
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
    'vehicle_child_detection_expiry',
    'driver_meeting_due',
    'license_update_requested',
    'license_update_reviewed',
    'driver_license_expiry',
    'company_carrier_license_expiry',
    'vehicle_odometer_stale',
    'signature_request_completed'
  )
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
    ('driver_meeting_due', 1, 30),
    ('vehicle_service_due', 100, 5000),
    ('driver_license_expiry', 1, 90),
    ('company_carrier_license_expiry', 1, 90),
    ('vehicle_odometer_stale', 7, 90)
  ) as b(notification_type, min_value, max_value)
  where b.notification_type = p_type
$$;

-- ------------------------------------------------------------
-- 2. Which timed alerts already went out
-- ------------------------------------------------------------

create table if not exists public.notification_alert_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  notification_type text not null,
  -- The driver, the company or the vehicle the alert is about.
  subject_id uuid not null,
  -- The expiry date, or the day the odometer was last updated.
  anchor_date date not null,
  stage text not null check (stage in ('before', 'expired', 'stale')),
  created_at timestamptz not null default now(),
  constraint notification_alert_log_unique unique (notification_type, subject_id, anchor_date, stage)
);

alter table public.notification_alert_log enable row level security;
revoke all on public.notification_alert_log from anon, authenticated;

-- ------------------------------------------------------------
-- 3. The daily scan: licences and the odometer
-- ------------------------------------------------------------

create or replace function public.check_license_and_odometer_notifications()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  r record;
  g record;
  vehicle_label text;
  when_text text;
begin
  -- Driving licences.
  for r in
    select d.company_id, d.id as driver_id, coalesce(nullif(trim(p.full_name), ''), 'נהג') as driver_name,
           d.license_expiry,
           case when d.license_expiry <= today then 'expired' else 'before' end as stage
    from public.driver_details d
    join public.profiles p on p.id = d.id
    join public.companies c on c.id = d.company_id and c.status = 'active'
    where d.archived_at is null
      and d.license_expiry is not null
      and d.license_expiry <= today + coalesce((c.notification_lead_days ->> 'driver_license_expiry')::integer, 30)
      and not exists (
        select 1 from public.notification_alert_log l
        where l.notification_type = 'driver_license_expiry'
          and l.subject_id = d.id
          and l.anchor_date = d.license_expiry
          and l.stage = case when d.license_expiry <= today then 'expired' else 'before' end
      )
  loop
    when_text := case
      when r.stage = 'expired' then ' פג ב-' || to_char(r.license_expiry, 'DD/MM/YYYY')
      else ' יפוג בעוד ' || (r.license_expiry - today) || ' ימים (' || to_char(r.license_expiry, 'DD/MM/YYYY') || ')'
    end;

    insert into public.notifications (company_id, actor_id, actor_name, message, notification_type)
    values (r.company_id, r.driver_id, r.driver_name,
            'רישיון הנהיגה של ' || r.driver_name || when_text, 'driver_license_expiry');

    insert into public.notifications (company_id, recipient_id, message, notification_type)
    values (r.company_id, r.driver_id, 'רישיון הנהיגה שלך' || when_text, 'driver_license_expiry');

    insert into public.notification_alert_log (company_id, notification_type, subject_id, anchor_date, stage)
    values (r.company_id, 'driver_license_expiry', r.driver_id, r.license_expiry, r.stage)
    on conflict on constraint notification_alert_log_unique do nothing;
  end loop;

  -- The company's carrier licence.
  for r in
    select c.id as company_id, c.carrier_license_expiry,
           case when c.carrier_license_expiry <= today then 'expired' else 'before' end as stage
    from public.companies c
    where c.status = 'active'
      and c.carrier_license_expiry is not null
      and c.carrier_license_expiry <= today + coalesce((c.notification_lead_days ->> 'company_carrier_license_expiry')::integer, 30)
      and not exists (
        select 1 from public.notification_alert_log l
        where l.notification_type = 'company_carrier_license_expiry'
          and l.subject_id = c.id
          and l.anchor_date = c.carrier_license_expiry
          and l.stage = case when c.carrier_license_expiry <= today then 'expired' else 'before' end
      )
  loop
    insert into public.notifications (company_id, message, notification_type)
    values (r.company_id,
            'תוקף רישיון המוביל של החברה' || case
              when r.stage = 'expired' then ' פג ב-' || to_char(r.carrier_license_expiry, 'DD/MM/YYYY')
              else ' יפוג בעוד ' || (r.carrier_license_expiry - today) || ' ימים (' || to_char(r.carrier_license_expiry, 'DD/MM/YYYY') || ')'
            end,
            'company_carrier_license_expiry');

    insert into public.notification_alert_log (company_id, notification_type, subject_id, anchor_date, stage)
    values (r.company_id, 'company_carrier_license_expiry', r.company_id, r.carrier_license_expiry, r.stage)
    on conflict on constraint notification_alert_log_unique do nothing;
  end loop;

  -- Odometers nobody updated. Once per last-update date: a new reading
  -- starts the count again.
  create temporary table if not exists pg_temp.odometer_stale_run (
    company_id uuid, vehicle_id uuid, vehicle_label text, last_update date, idle_days integer
  ) on commit drop;
  truncate pg_temp.odometer_stale_run;

  insert into pg_temp.odometer_stale_run
  select v.company_id, v.id,
         trim(both ' ' from coalesce(v.manufacturer, '') || ' ' || coalesce(v.model, '')) || ' (' || v.plate_number || ')',
         (coalesce(v.odometer_updated_at, v.created_at) at time zone 'Asia/Jerusalem')::date,
         today - (coalesce(v.odometer_updated_at, v.created_at) at time zone 'Asia/Jerusalem')::date
  from public.vehicles v
  join public.companies c on c.id = v.company_id and c.status = 'active'
  where v.status <> 'archived'
    and (coalesce(v.odometer_updated_at, v.created_at) at time zone 'Asia/Jerusalem')::date
        <= today - coalesce((c.notification_lead_days ->> 'vehicle_odometer_stale')::integer, 30)
    and not exists (
      select 1 from public.notification_alert_log l
      where l.notification_type = 'vehicle_odometer_stale'
        and l.subject_id = v.id
        and l.anchor_date = (coalesce(v.odometer_updated_at, v.created_at) at time zone 'Asia/Jerusalem')::date
        and l.stage = 'stale'
    );

  -- Managers: one line per vehicle, or a summary when many go stale at once.
  for g in
    select company_id, count(*) as vehicles from pg_temp.odometer_stale_run group by company_id
  loop
    if g.vehicles > 3 then
      insert into public.notifications (company_id, message, notification_type)
      values (g.company_id, 'ב-' || g.vehicles || ' רכבים הקילומטראז׳ לא עודכן זמן רב, ולכן התראות הטיפול בהם לא מדויקות',
              'vehicle_odometer_stale');
    else
      insert into public.notifications (company_id, message, notification_type, vehicle_id)
      select s.company_id, 'הקילומטראז׳ של הרכב ' || s.vehicle_label || ' לא עודכן ' || s.idle_days || ' ימים',
             'vehicle_odometer_stale', s.vehicle_id
      from pg_temp.odometer_stale_run s
      where s.company_id = g.company_id;
    end if;
  end loop;

  -- Drivers: their own vehicle, so they can update it.
  insert into public.notifications (company_id, recipient_id, message, notification_type, vehicle_id)
  select s.company_id, vd.driver_id,
         'הגיע הזמן לעדכן את הקילומטראז׳ ברכב ' || s.vehicle_label || ' (העדכון האחרון לפני ' || s.idle_days || ' ימים)',
         'vehicle_odometer_stale', s.vehicle_id
  from pg_temp.odometer_stale_run s
  join public.vehicle_drivers vd on vd.vehicle_id = s.vehicle_id and vd.unassigned_at is null and vd.driver_id is not null;

  insert into public.notification_alert_log (company_id, notification_type, subject_id, anchor_date, stage)
  select company_id, 'vehicle_odometer_stale', vehicle_id, last_update, 'stale' from pg_temp.odometer_stale_run
  on conflict on constraint notification_alert_log_unique do nothing;
end;
$$;

revoke all on function public.check_license_and_odometer_notifications() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'check-license-and-odometer-notifications';
select cron.schedule(
  'check-license-and-odometer-notifications',
  '0 3 * * *',
  $cron$ select public.check_license_and_odometer_notifications() $cron$
);

-- ------------------------------------------------------------
-- 4. A driver signed a document
-- ------------------------------------------------------------

-- Named to run after trg_resolve_signature_notifications, which marks the
-- request's earlier notifications read when it leaves "pending".
create or replace function private.notify_signature_completed()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  driver_name text;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' or new.driver_id is null then
    return new;
  end if;

  select coalesce(nullif(trim(p.full_name), ''), 'נהג') into driver_name
  from public.profiles p where p.id = new.driver_id;

  insert into public.notifications (company_id, actor_id, actor_name, message, notification_type, signature_request_id)
  values (
    new.company_id,
    new.driver_id,
    coalesce(driver_name, 'נהג'),
    coalesce(driver_name, 'נהג') || ' חתם/ה על המסמך "' || coalesce(nullif(trim(new.template_title), ''), 'מסמך') || '"',
    'signature_request_completed',
    new.id
  );
  return new;
end;
$$;

drop trigger if exists trg_signature_completed_notify on public.signature_requests;
create trigger trg_signature_completed_notify
  after update of status on public.signature_requests
  for each row execute function private.notify_signature_completed();

commit;
