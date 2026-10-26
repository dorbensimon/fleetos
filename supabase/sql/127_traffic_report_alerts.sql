-- 127_traffic_report_alerts.sql
--
-- Alerts for open traffic reports (documents.details, migration 124/126):
--   pay_by       the last day to pay the report
--   transfer_by  the last day to transfer it to the driver (the form fills
--                received date + 30 days, the admin may change it). No
--                transfer alert when the company itself is responsible.
--
-- One new alert kind, `traffic_report_due`, to the company's managers only.
-- Its lead time is a company setting like the other dates (default 7 days).
-- Each deadline sends one alert per stage ("before" / "overdue"). When the
-- report stops being open, or a deadline moves, its alerts are marked read.
--
-- Applied to production with Dor's approval on 2026-10-26.

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
    'signature_expiry', 'vehicle_custom_folder_expiry', 'driver_custom_folder_expiry', 'driver_extra_expiry',
    'vehicle_engineer_report_expiry', 'vehicle_license_annex_expiry', 'traffic_report_due'
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
    'vehicle_custom_folder_expiry', 'driver_custom_folder_expiry', 'driver_extra_expiry',
    'vehicle_engineer_report_expiry', 'vehicle_license_annex_expiry', 'traffic_report_due'
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
    ('vehicle_safety_check_due', 1, 30),
    ('traffic_report_due', 1, 30)
  ) as b(notification_type, min_value, max_value)
  where b.notification_type = p_type
$function$;

/* ---------------- daily check ---------------- */

create table if not exists public.traffic_report_alerts (
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  deadline text not null check (deadline in ('pay', 'transfer')),
  due_date date not null,
  stage text not null check (stage in ('before', 'overdue')),
  notification_id uuid references public.notifications(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint traffic_report_alerts_unique unique (document_id, deadline, due_date, stage)
);
alter table public.traffic_report_alerts enable row level security;
revoke all on public.traffic_report_alerts from anon, authenticated;

create or replace function public.check_traffic_report_notifications()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  new_id uuid;
  what text;
  date_label text;
begin
  for r in
    with reports as (
      select d.id as document_id, d.company_id, d.owner_id as driver_id, d.details
      from public.documents d
      where d.category = 'traffic_reports'
        and d.owner_type = 'driver'
        and d.details ->> 'status' = 'open'
    ),
    deadlines as (
      -- `rep`, not `r`: `r` is the loop variable below.
      select rep.*, 'pay' as deadline, rep.details ->> 'pay_by' as due_text from reports rep
      union all
      select rep.*, 'transfer', rep.details ->> 'transfer_by' from reports rep
      where coalesce(rep.details ->> 'responsibility', '') <> 'company'
    ),
    candidates as (
      select dl.document_id, dl.company_id, dl.driver_id, dl.deadline, dl.details,
             dl.due_text::date as due_date, p.full_name,
             case
               when dl.due_text::date < current_date then 'overdue'
               when dl.due_text::date - current_date <= coalesce((c.notification_lead_days ->> 'traffic_report_due')::integer, 7) then 'before'
             end as stage
      from deadlines dl
      join public.profiles p on p.id = dl.driver_id
      join public.companies c on c.id = dl.company_id and c.status = 'active'
      where dl.due_text ~ '^\d{4}-\d{2}-\d{2}$'
    )
    select ca.* from candidates ca
    where ca.stage is not null
      and not exists (
        select 1 from public.traffic_report_alerts a
        where a.document_id = ca.document_id and a.deadline = ca.deadline
          and a.due_date = ca.due_date and a.stage = ca.stage
      )
  loop
    date_label := to_char(r.due_date, 'DD/MM/YYYY');
    what := 'דוח תעבורה'
      || coalesce(' מס׳ ' || nullif(r.details ->> 'report_number', ''), '')
      || ' של הנהג ' || coalesce(r.full_name, '')
      || coalesce(' (' || nullif(r.details ->> 'vehicle_plate', '') || ')', '');

    insert into public.notifications (company_id, actor_id, actor_name, message, notification_type, folder_key)
    values (
      r.company_id, r.driver_id, r.full_name,
      case
        when r.deadline = 'pay' and r.stage = 'overdue' then what || ': עבר מועד התשלום (' || date_label || ')'
        when r.deadline = 'pay' then what || ': מועד התשלום בעוד ' || (r.due_date - current_date) || ' ימים (' || date_label || ')'
        when r.stage = 'overdue' then what || ': עבר מועד ההסבה (' || date_label || ')'
        else what || ': מועד ההסבה בעוד ' || (r.due_date - current_date) || ' ימים (' || date_label || ')'
      end,
      'traffic_report_due', 'traffic_reports'
    )
    returning id into new_id;

    insert into public.traffic_report_alerts (company_id, document_id, deadline, due_date, stage, notification_id)
    values (r.company_id, r.document_id, r.deadline, r.due_date, r.stage, new_id)
    on conflict on constraint traffic_report_alerts_unique do nothing;
  end loop;
end;
$function$;

revoke all on function public.check_traffic_report_notifications() from public, anon, authenticated;

/* ---------------- resolve ---------------- */

-- The report was paid, transferred, appealed or cancelled, or a deadline moved:
-- its alerts about that deadline are done.
create or replace function private.resolve_traffic_report_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.category <> 'traffic_reports' then
    return new;
  end if;
  update public.notifications n
     set read_at = now()
    from public.traffic_report_alerts a
   where a.document_id = new.id
     and n.id = a.notification_id
     and n.read_at is null
     and (
       coalesce(new.details ->> 'status', '') <> 'open'
       or a.due_date::text is distinct from new.details ->> (case a.deadline when 'pay' then 'pay_by' else 'transfer_by' end)
     );
  return new;
end;
$$;

revoke execute on function private.resolve_traffic_report_notifications() from public, anon, authenticated;

drop trigger if exists trg_resolve_traffic_report_notifications on public.documents;
create trigger trg_resolve_traffic_report_notifications
  after update of details on public.documents
  for each row execute function private.resolve_traffic_report_notifications();

select cron.schedule('check-traffic-report-notifications', '20 3 * * *', $$ select public.check_traffic_report_notifications() $$);
