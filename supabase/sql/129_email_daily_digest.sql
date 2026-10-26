-- 129: a daily email summary for managers.
--
-- The site has no phone app, so push reaches almost nobody: a manager only
-- sees an alert when they open the site. Once a day the Edge Function
-- email-daily-digest asks email_digest_recipients() for every manager's
-- unread alerts from the last 24 hours and sends one email each (Resend).
-- No alerts, no email. A manager turns it off with the switch
-- 'email_daily_digest' on the notification settings screen; switching off
-- an alert type also keeps it out of the email.

-- The new switch.
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
    'vehicle_engineer_report_expiry', 'vehicle_license_annex_expiry', 'traffic_report_due',
    'email_daily_digest'
  ]::text[])
);

-- One row per manager with something unread from the last 24 hours. Same
-- visibility as the "users see relevant notifications" policy: alerts to
-- the manager, plus company-wide alerts (recipient_id null), minus types
-- the manager switched off.
create or replace function public.email_digest_recipients()
returns table (email text, full_name text, company_name text, messages text[])
language sql
stable
security definer
set search_path to ''
as $$
  select u.email::text, p.full_name, c.name, array_agg(n.message order by n.created_at desc)
  from public.profiles p
  join auth.users u on u.id = p.id
  join public.companies c on c.id = p.company_id and c.status = 'active'
  join public.notifications n
    on n.company_id = p.company_id
   and (n.recipient_id = p.id or n.recipient_id is null)
   and n.read_at is null
   and n.created_at > now() - interval '24 hours'
  where p.role = 'admin'
    and u.email is not null
    and not exists (
      select 1 from public.notification_preferences off
      where off.user_id = p.id and off.enabled = false
        and off.notification_type in ('email_daily_digest', n.notification_type)
    )
  group by u.email, p.full_name, c.name
$$;

revoke execute on function public.email_digest_recipients() from public, anon, authenticated;
grant execute on function public.email_digest_recipients() to service_role;

-- 07:00 in Israel in summer, 06:00 in winter; after the 03:00–03:30 checks
-- that create the day's alerts. Reuses the cron secret the other daily
-- Edge Function (renew-expired-signatures) is called with.
select cron.unschedule('email-daily-digest')
where exists (select 1 from cron.job where jobname = 'email-daily-digest');
select cron.schedule('email-daily-digest', '0 4 * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
        || '/functions/v1/email-daily-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
        'x-signing-reminder-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'signing_reminder_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
$cron$);
