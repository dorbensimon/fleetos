-- 128: backend hardening after the 2026-10-26 backend gap review.
--
-- 1. assign_vehicle_driver: the retry lookup by client_operation_id was not
--    scoped to the vehicle's company, so a known operation id could return a
--    row from another company. Now scoped.
-- 2. The two lead-day setters pin search_path to '' like every other
--    SECURITY DEFINER function.
-- 3. The owner hears about broken background work: an hourly check turns any
--    failed scheduled job (pg_cron) or failed call to an Edge Function
--    (pg_net, e.g. renew-expired-signatures) into one owner alert.

-- 1 ------------------------------------------------------------------------
create or replace function public.assign_vehicle_driver(p_vehicle_id uuid, p_driver_id uuid, p_is_primary boolean, p_operation_id uuid)
 returns vehicle_drivers
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_company_id uuid; v_status text; v_assignment public.vehicle_drivers%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(hashtext(p_vehicle_id::text));
  select company_id, status into v_company_id, v_status from public.vehicles where id = p_vehicle_id;
  if v_company_id is null then raise exception 'הרכב לא נמצא'; end if;
  if not private.can_manage_company(v_company_id) then raise exception 'אין הרשאה לעדכן את נהגי הרכב'; end if;
  if v_status = 'archived' then raise exception 'לא ניתן לשייך נהג לרכב שנמצא בארכיון'; end if;
  select * into v_assignment from public.vehicle_drivers
    where client_operation_id = p_operation_id and company_id = v_company_id;
  if found then return v_assignment; end if;
  insert into public.vehicle_drivers(vehicle_id, driver_id, is_primary, client_operation_id)
  values (p_vehicle_id, p_driver_id, p_is_primary, p_operation_id) returning * into v_assignment;
  return v_assignment;
end;
$function$;

-- 2 ------------------------------------------------------------------------
alter function public.set_notification_lead(uuid, text, integer) set search_path = '';
alter function public.set_vehicle_expiry_lead_days(uuid, integer) set search_path = '';

-- 3 ------------------------------------------------------------------------
alter table public.owner_notifications drop constraint if exists owner_notifications_notification_type_check;
alter table public.owner_notifications add constraint owner_notifications_notification_type_check check (
  notification_type in (
    'owner_company_activated', 'owner_admin_added', 'owner_company_not_activated', 'owner_company_inactive',
    'owner_carrier_license_expiry', 'owner_trial_ending', 'owner_renewal_due', 'owner_vehicle_limit',
    'owner_system_job_failed'
  )
);

-- Failures not yet reported become one alert. owner_alert_log keeps each
-- failure reported once (subject = the nil uuid, anchor = the run/request).
create or replace function private.check_failed_background_jobs()
returns void language plpgsql security definer set search_path to '' as $$
declare
  failures text[];
  first_failure text;
begin
  with found as (
    select 'cron:' || d.runid as anchor, j.jobname || ': ' || left(coalesce(d.return_message, ''), 200) as what
    from cron.job_run_details d join cron.job j using (jobid)
    where d.status = 'failed' and d.start_time > now() - interval '3 hours'
    union all
    select 'http:' || r.id, 'Edge Function ' || coalesce(r.status_code::text, '') || ' ' || left(coalesce(r.error_msg, r.content, ''), 200)
    from net._http_response r
    where (r.status_code >= 400 or r.error_msg is not null or r.timed_out) and r.created > now() - interval '3 hours'
  ), fresh as (
    insert into public.owner_alert_log (notification_type, subject_id, anchor)
    select 'owner_system_job_failed', '00000000-0000-0000-0000-000000000000'::uuid, anchor from found
    on conflict do nothing
    returning anchor
  )
  select array_agg(found.what) into failures from found join fresh using (anchor);

  if failures is null then return; end if;
  first_failure := failures[1];
  insert into public.owner_notifications (company_id, notification_type, title, message, tone)
  values (
    null, 'owner_system_job_failed', 'עבודת רקע נכשלה',
    case when array_length(failures, 1) = 1 then first_failure
         else array_length(failures, 1) || ' כשלים. הראשון: ' || first_failure end,
    'bad'
  );
end $$;

revoke all on function private.check_failed_background_jobs() from public, anon, authenticated;

select cron.unschedule('check-failed-background-jobs')
where exists (select 1 from cron.job where jobname = 'check-failed-background-jobs');
select cron.schedule('check-failed-background-jobs', '7 * * * *', $$ select private.check_failed_background_jobs() $$);
