-- How long a signature stays good, and the alerts before it runs out.
--
-- Deployment draft: apply only with production approval, after 104.
--
-- A company sets, per signing document (its own or a global one), how many
-- months a driver's signature is good for and how many days before the end
-- the alert goes out. No row = the signature never expires (as before).
--
--   signing_template_rules   company_id, template_id, valid_months, lead_days
--   signature_expiry         notification type: managers and the driver
--
-- The daily scan below sends the "before" alert. The day a signature runs
-- out, the renew-expired-signatures function (scheduled at the end) sends the
-- driver a new request to sign and tells the managers; it reads the list
-- from signature_renewals_due(). Each stage goes out once per signature,
-- recorded in notification_alert_log (subject = the signed request).
-- Checklist forms keep their own "repeat every" (migration 97).

begin;

-- ------------------------------------------------------------
-- 1. The rule per document
-- ------------------------------------------------------------

create table if not exists public.signing_template_rules (
  company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid not null references public.signing_templates(id) on delete cascade,
  valid_months smallint not null check (valid_months between 1 and 120),
  lead_days smallint not null default 30 check (lead_days between 1 and 90),
  updated_at timestamptz not null default now(),
  primary key (company_id, template_id)
);

create index if not exists signing_template_rules_template_idx on public.signing_template_rules(template_id);

alter table public.signing_template_rules enable row level security;
revoke all on public.signing_template_rules from anon;
grant select, insert, update, delete on public.signing_template_rules to authenticated;

drop policy if exists "managers read signing rules" on public.signing_template_rules;
create policy "managers read signing rules" on public.signing_template_rules
  for select to authenticated using ((select private.can_manage_company(company_id)));

drop policy if exists "managers write signing rules" on public.signing_template_rules;
create policy "managers write signing rules" on public.signing_template_rules
  for all to authenticated
  using ((select private.can_manage_company(company_id)))
  with check (
    (select private.can_manage_company(company_id))
    and exists (
      select 1 from public.signing_templates t
      where t.id = template_id
        and (t.company_id = signing_template_rules.company_id or t.company_id is null)
        and t.form_kind = 'document'
    )
  );

-- ------------------------------------------------------------
-- 2. The new type
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
    'signature_request_completed',
    'vehicle_safety_check_due',
    'signature_expiry'
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
    'signature_request_completed',
    'owner_company_activated',
    'owner_admin_added',
    'owner_company_not_activated',
    'owner_company_inactive',
    'owner_carrier_license_expiry',
    'owner_trial_ending',
    'owner_renewal_due',
    'owner_vehicle_limit',
    'vehicle_safety_check_due',
    'signature_expiry'
  )
);

-- ------------------------------------------------------------
-- 3. Each driver's latest signature on a document with a rule
-- ------------------------------------------------------------

-- One row per active driver and document: the newest signature, the day it
-- runs out, and whether a newer request to sign is already waiting.
create or replace function private.signature_validity()
returns table (
  company_id uuid, template_id uuid, driver_id uuid, request_id uuid,
  driver_name text, title text, expires_on date, lead_days integer, renewal_waiting boolean
)
language sql
stable
set search_path to ''
as $$
  select s.company_id, s.template_id, s.driver_id, s.id,
         coalesce(nullif(trim(p.full_name), ''), 'נהג'),
         coalesce(nullif(trim(t.title), ''), nullif(trim(s.template_title), ''), 'מסמך'),
         ((s.completed_at at time zone 'Asia/Jerusalem')::date + make_interval(months => r.valid_months))::date,
         r.lead_days,
         exists (
           select 1 from public.signature_requests w
           where w.driver_id = s.driver_id and w.template_id = s.template_id
             and w.status = 'pending' and w.archived_at is null and w.deleted_at is null
         )
  from (
    select distinct on (q.driver_id, q.template_id) q.*
    from public.signature_requests q
    where q.status = 'completed' and q.completed_at is not null and q.template_id is not null
      and q.archived_at is null and q.deleted_at is null
    order by q.driver_id, q.template_id, q.completed_at desc
  ) s
  join public.signing_template_rules r on r.company_id = s.company_id and r.template_id = s.template_id
  join public.signing_templates t on t.id = s.template_id and t.archived_at is null and t.form_kind = 'document'
  join public.companies c on c.id = s.company_id and c.status = 'active'
  join public.driver_details d on d.id = s.driver_id and d.company_id = s.company_id
    and d.status = 'active' and d.archived_at is null
  join public.profiles p on p.id = s.driver_id
$$;

revoke all on function private.signature_validity() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. The daily scan: "your signature runs out in N days"
-- ------------------------------------------------------------

create or replace function public.check_signature_expiry_notifications()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  r record;
  when_text text;
begin
  for r in
    select v.* from private.signature_validity() v
    where v.expires_on > today
      and v.expires_on <= today + v.lead_days
      and not v.renewal_waiting
      and not exists (
        select 1 from public.notification_alert_log l
        where l.notification_type = 'signature_expiry'
          and l.subject_id = v.request_id
          and l.anchor_date = v.expires_on
          and l.stage = 'before'
      )
  loop
    when_text := ' על "' || r.title || '" תפוג בעוד ' || (r.expires_on - today) || ' ימים ('
      || to_char(r.expires_on, 'DD/MM/YYYY') || ')';

    insert into public.notifications (company_id, actor_id, actor_name, message, notification_type, signature_request_id)
    values (r.company_id, r.driver_id, r.driver_name, 'החתימה של ' || r.driver_name || when_text, 'signature_expiry', r.request_id);

    insert into public.notifications (company_id, recipient_id, message, notification_type, signature_request_id)
    values (r.company_id, r.driver_id, 'החתימה שלך' || when_text, 'signature_expiry', r.request_id);

    insert into public.notification_alert_log (company_id, notification_type, subject_id, anchor_date, stage)
    values (r.company_id, 'signature_expiry', r.request_id, r.expires_on, 'before')
    on conflict on constraint notification_alert_log_unique do nothing;
  end loop;
end;
$$;

revoke all on function public.check_signature_expiry_notifications() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. Signatures that ran out and still need a new request
-- ------------------------------------------------------------

-- Read by renew-expired-signatures (service role). A driver who
-- already has a request waiting is left alone; the edge function records
-- the 'expired' stage once it has tried.
create or replace function public.signature_renewals_due()
returns table (company_id uuid, template_id uuid, driver_id uuid, request_id uuid, driver_name text, title text, expires_on date)
language sql
stable
security definer
set search_path to ''
as $$
  select v.company_id, v.template_id, v.driver_id, v.request_id, v.driver_name, v.title, v.expires_on
  from private.signature_validity() v
  where v.expires_on <= (now() at time zone 'Asia/Jerusalem')::date
    and not v.renewal_waiting
    and not exists (
      select 1 from public.notification_alert_log l
      where l.notification_type = 'signature_expiry'
        and l.subject_id = v.request_id
        and l.anchor_date = v.expires_on
        and l.stage = 'expired'
    )
  order by v.expires_on
  limit 50
$$;

revoke all on function public.signature_renewals_due() from public, anon, authenticated;
grant execute on function public.signature_renewals_due() to service_role;

-- ------------------------------------------------------------
-- 6. Schedules (UTC): the scan, then the renewals
-- ------------------------------------------------------------

select cron.unschedule(jobid) from cron.job where jobname = 'check-signature-expiry-notifications';
select cron.schedule(
  'check-signature-expiry-notifications',
  '15 3 * * *',
  $cron$ select public.check_signature_expiry_notifications() $cron$
);

select cron.unschedule(jobid) from cron.job where jobname = 'renew-expired-signatures';
select cron.schedule(
  'renew-expired-signatures',
  '30 3 * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
        || '/functions/v1/renew-expired-signatures',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
        'x-signing-reminder-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'signing_reminder_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$
);

commit;
