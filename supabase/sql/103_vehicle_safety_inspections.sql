-- "בדיקות בטיחות": the safety officer's periodic check of a vehicle
-- (plans/vehicle-safety-inspection-plan.html, approved 2026-09-27).
--
-- Deployment draft: apply only with production approval, after 102.
--
-- It works like the "רשימת סעיפים" meetings (96-98): a manager marks every
-- item, types the officer's name and signs by hand, and the driver signs
-- after, on the same device or from their own phone. The difference: an
-- inspection belongs to a vehicle, and a "לא תקין" item is a defect.
--
-- 1. vehicle_inspection_settings: per company, how often each vehicle is
--    checked (default every month) and the company's own list of items
--    (null = the ready-made list in supabase/functions/_shared/inspectionDocument.ts).
-- 2. vehicle_inspections: one row per inspection. It keeps its own copy of
--    the list, so a later edit never changes an inspection already held.
--      draft      being filled
--      signed     the officer signed; the driver's side is an ordinary
--                 signature_requests row (signature_request_id)
--      closed     the driver never signed; a manager closed it with a note
--                 and the document was issued with the officer's signature only
--      cancelled  kept for the record, marked "בוטל"
--    A signed inspection is never deleted; only a draft can be thrown away.
-- 3. vehicle_inspection_schedule: the next inspection per vehicle.
-- 4. A plan of every vehicle's next inspection, for the app and the daily scan.
-- 5. Notification type vehicle_safety_check_due and its daily scan.
--
-- Managers read their company's rows. Every write goes through the
-- vehicle-inspection Edge Function; the tables take no writes from the app.

begin;

-- ------------------------------------------------------------
-- 1. Company settings
-- ------------------------------------------------------------

create table if not exists public.vehicle_inspection_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  -- 0 = no reminders.
  repeat_months integer not null default 1 check (repeat_months between 0 and 12),
  -- The company's own list; null keeps the ready-made one.
  form jsonb check (form is null or jsonb_typeof(form -> 'groups') = 'array'),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicle_inspection_settings_updated_by_idx on public.vehicle_inspection_settings(updated_by);

drop trigger if exists vehicle_inspection_settings_touch on public.vehicle_inspection_settings;
create trigger vehicle_inspection_settings_touch before update on public.vehicle_inspection_settings
  for each row execute function public.touch_updated_at();

-- Every existing company starts today, so the first-inspection rule below
-- (14 days after a vehicle joins) does not flag the whole fleet on day one.
insert into public.vehicle_inspection_settings (company_id)
select id from public.companies
on conflict (company_id) do nothing;

alter table public.vehicle_inspection_settings enable row level security;
revoke all on public.vehicle_inspection_settings from anon, authenticated;
grant select on public.vehicle_inspection_settings to authenticated;
grant select, insert, update, delete on public.vehicle_inspection_settings to service_role;

drop policy if exists "managers read inspection settings" on public.vehicle_inspection_settings;
create policy "managers read inspection settings" on public.vehicle_inspection_settings
for select to authenticated
using (
  private.can_manage_company(company_id)
  and (private.current_role_name() = 'owner' or private.current_company_is_active())
);

-- ------------------------------------------------------------
-- 2. Inspections
-- ------------------------------------------------------------

create table if not exists public.vehicle_inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  -- The driver who signs. Chosen while filling; required to sign.
  driver_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null check (length(title) between 1 and 120),
  form jsonb not null check (jsonb_typeof(form -> 'groups') = 'array'),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  -- Defects written freely, beyond the list.
  extra_defects jsonb not null default '[]'::jsonb check (jsonb_typeof(extra_defects) = 'array'),
  -- "לא תקין" items plus extra defects, counted when the officer signs.
  defect_count integer not null default 0 check (defect_count >= 0),
  odometer integer check (odometer is null or odometer between 0 and 9999999),
  inspection_date date not null default ((now() at time zone 'Asia/Jerusalem')::date),
  officer_name text check (officer_name is null or length(officer_name) <= 80),
  officer_signature text,
  -- The vehicle and driver details printed on the document, as they were that day.
  facts jsonb,
  status text not null default 'draft' check (status in ('draft', 'signed', 'closed', 'cancelled')),
  signature_request_id uuid unique references public.signature_requests(id) on delete set null,
  signing_locked_until timestamptz,
  signed_at timestamptz,
  closed_note text check (closed_note is null or length(closed_note) <= 300),
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  -- The document issued when closing without the driver.
  closing_submission_id bigint,
  file_path text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The driver is checked by the function when the officer signs; the row
  -- itself must survive that driver's profile being deleted later.
  constraint vehicle_inspections_signed_check check (
    status = 'draft' or (signed_at is not null and officer_name is not null)
  ),
  constraint vehicle_inspections_closed_check check (status <> 'closed' or closed_at is not null)
);

create index if not exists vehicle_inspections_vehicle_idx on public.vehicle_inspections(vehicle_id, inspection_date desc);
create index if not exists vehicle_inspections_company_idx on public.vehicle_inspections(company_id, inspection_date desc);
create index if not exists vehicle_inspections_driver_idx on public.vehicle_inspections(driver_id);
create index if not exists vehicle_inspections_created_by_idx on public.vehicle_inspections(created_by);
create index if not exists vehicle_inspections_closed_by_idx on public.vehicle_inspections(closed_by);
create index if not exists vehicle_inspections_cancelled_by_idx on public.vehicle_inspections(cancelled_by);

drop trigger if exists vehicle_inspections_touch on public.vehicle_inspections;
create trigger vehicle_inspections_touch before update on public.vehicle_inspections
  for each row execute function public.touch_updated_at();

-- An inspection is of one of the company's vehicles, with one of its drivers,
-- and what the officer signed never changes afterwards.
create or replace function private.enforce_vehicle_inspection_integrity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  vehicle_company_id uuid;
  driver_company_id uuid;
  driver_role text;
begin
  select company_id into vehicle_company_id from public.vehicles where id = new.vehicle_id;
  if vehicle_company_id is distinct from new.company_id then
    raise exception 'בדיקה חייבת להיות של רכב מאותה חברה';
  end if;

  if new.driver_id is not null and (tg_op = 'INSERT' or new.driver_id is distinct from old.driver_id) then
    select company_id, role into driver_company_id, driver_role from public.profiles where id = new.driver_id;
    if driver_company_id is distinct from new.company_id or driver_role is distinct from 'driver' then
      raise exception 'הנהג בבדיקה חייב להיות נהג של אותה חברה';
    end if;
  end if;

  if tg_op = 'UPDATE' and (
    new.company_id is distinct from old.company_id
    or new.vehicle_id is distinct from old.vehicle_id
    -- A deleted manager's profile clears these on its own (on delete set null).
    or (new.created_by is distinct from old.created_by and new.created_by is not null)
    or (old.status <> 'draft' and (
      new.form is distinct from old.form
      or new.answers is distinct from old.answers
      or new.extra_defects is distinct from old.extra_defects
      or new.defect_count is distinct from old.defect_count
      or new.odometer is distinct from old.odometer
      or new.inspection_date is distinct from old.inspection_date
      or new.officer_name is distinct from old.officer_name
      or new.officer_signature is distinct from old.officer_signature
      or new.facts is distinct from old.facts
      or new.signed_at is distinct from old.signed_at
      or (new.driver_id is distinct from old.driver_id and new.driver_id is not null)
    ))
    -- Only forward: signed -> closed / cancelled, closed -> cancelled.
    or (old.status = 'signed' and new.status not in ('signed', 'closed', 'cancelled'))
    or (old.status = 'closed' and new.status not in ('closed', 'cancelled'))
    or (old.status = 'cancelled' and new.status <> 'cancelled')
  ) then
    raise exception 'אי אפשר לשנות בדיקה שכבר נחתמה';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_vehicle_inspection_integrity() from public, anon, authenticated;

drop trigger if exists vehicle_inspections_integrity on public.vehicle_inspections;
create trigger vehicle_inspections_integrity before insert or update on public.vehicle_inspections
  for each row execute function private.enforce_vehicle_inspection_integrity();

alter table public.vehicle_inspections enable row level security;
revoke all on public.vehicle_inspections from anon, authenticated;
grant select on public.vehicle_inspections to authenticated;
grant select, insert, update, delete on public.vehicle_inspections to service_role;

drop policy if exists "managers read company inspections" on public.vehicle_inspections;
create policy "managers read company inspections" on public.vehicle_inspections
for select to authenticated
using (
  private.can_manage_company(company_id)
  and (private.current_role_name() = 'owner' or private.current_company_is_active())
);

-- ------------------------------------------------------------
-- 3. The next inspection, per vehicle
-- ------------------------------------------------------------

create table if not exists public.vehicle_inspection_schedule (
  vehicle_id uuid primary key references public.vehicles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  next_due date not null,
  -- A date a manager set by hand; it comes back if the inspection that
  -- replaced it is cancelled.
  manual_next_due date,
  -- The inspection whose signing set this date; null when set by hand.
  inspection_id uuid references public.vehicle_inspections(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists vehicle_inspection_schedule_company_idx on public.vehicle_inspection_schedule(company_id, next_due);
create index if not exists vehicle_inspection_schedule_inspection_idx on public.vehicle_inspection_schedule(inspection_id);
create index if not exists vehicle_inspection_schedule_updated_by_idx on public.vehicle_inspection_schedule(updated_by);

alter table public.vehicle_inspection_schedule enable row level security;
revoke all on public.vehicle_inspection_schedule from anon, authenticated;
grant select on public.vehicle_inspection_schedule to authenticated;
grant select, insert, update, delete on public.vehicle_inspection_schedule to service_role;

drop policy if exists "managers read inspection schedule" on public.vehicle_inspection_schedule;
create policy "managers read inspection schedule" on public.vehicle_inspection_schedule
for select to authenticated
using (
  private.can_manage_company(company_id)
  and (private.current_role_name() = 'owner' or private.current_company_is_active())
);

-- ------------------------------------------------------------
-- 4. Every vehicle's next inspection
-- ------------------------------------------------------------
-- The same rule as lib/inspectionPlan.ts:
--   1. vehicle_inspection_schedule.next_due, when set (written when the
--      officer signs: inspection date + the company's months; or by hand).
--      With reminders off (repeat_months = 0) only a date set by hand counts.
--   2. Otherwise the last inspection's date + the company's months.
--   3. Otherwise a first inspection: 14 days after the later of the day the
--      vehicle joined and the day the company started using inspections.
-- Only vehicles in use: archived and disabled vehicles never appear. A
-- company with repeat_months = 0 gets no dates unless one was set by hand.
-- "Last inspection" is the newest one the officer signed and nobody cancelled.

create or replace function private.vehicle_inspection_plan(p_company_id uuid default null)
returns table (
  company_id uuid,
  vehicle_id uuid,
  vehicle_label text,
  plate_number text,
  last_inspection_id uuid,
  last_inspection date,
  last_defects integer,
  next_due date,
  first_inspection boolean
)
language sql
stable
security definer
set search_path to ''
as $$
  select v.company_id, v.id,
         trim(both ' ' from coalesce(v.manufacturer, '') || ' ' || coalesce(v.model, '')),
         v.plate_number,
         last.id, last.inspection_date, last.defect_count,
         case
           -- With reminders off, only a date a manager set by hand still counts.
           when s.next_due is not null and (coalesce(st.repeat_months, 1) > 0 or s.inspection_id is null) then s.next_due
           when coalesce(st.repeat_months, 1) = 0 then null
           when last.inspection_date is not null then (last.inspection_date + make_interval(months => coalesce(st.repeat_months, 1)))::date
           else greatest((v.created_at at time zone 'Asia/Jerusalem')::date,
                         (coalesce(st.created_at, c.created_at) at time zone 'Asia/Jerusalem')::date) + 14
         end,
         last.id is null
  from public.vehicles v
  join public.companies c on c.id = v.company_id
  left join public.vehicle_inspection_settings st on st.company_id = v.company_id
  left join public.vehicle_inspection_schedule s on s.vehicle_id = v.id
  left join lateral (
    select i.id, i.inspection_date, i.defect_count
    from public.vehicle_inspections i
    where i.vehicle_id = v.id and i.status in ('signed', 'closed')
    order by i.inspection_date desc, i.signed_at desc
    limit 1
  ) last on true
  where v.status not in ('archived', 'disabled')
    and (p_company_id is null or v.company_id = p_company_id);
$$;

revoke all on function private.vehicle_inspection_plan(uuid) from public, anon, authenticated;

-- The same plan for the app: the company's managers only.
create or replace function public.list_vehicle_inspection_plan(p_company_id uuid)
returns table (
  vehicle_id uuid,
  vehicle_label text,
  plate_number text,
  last_inspection_id uuid,
  last_inspection date,
  last_defects integer,
  next_due date,
  first_inspection boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if p_company_id is null
    or not private.can_manage_company(p_company_id)
    or not (private.current_role_name() = 'owner' or private.current_company_is_active()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select p.vehicle_id, p.vehicle_label, p.plate_number, p.last_inspection_id, p.last_inspection,
           p.last_defects, p.next_due, p.first_inspection
    from private.vehicle_inspection_plan(p_company_id) p
    order by p.next_due nulls last, p.plate_number;
end;
$$;

revoke all on function public.list_vehicle_inspection_plan(uuid) from public, anon;
grant execute on function public.list_vehicle_inspection_plan(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. Notification type
-- ------------------------------------------------------------
-- The live lists (verified 2026-09-27, after 102) plus 'vehicle_safety_check_due'.

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
    'vehicle_safety_check_due'
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
    'vehicle_safety_check_due'
  )
);

-- The live bounds plus the inspection reminder: 1-30 days before, default 7.
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
    ('vehicle_odometer_stale', 7, 90),
    ('vehicle_safety_check_due', 1, 30)
  ) as b(notification_type, min_value, max_value)
  where b.notification_type = p_type
$$;

-- ------------------------------------------------------------
-- 6. The daily scan
-- ------------------------------------------------------------
-- The company's managers hear about a vehicle's inspection N days before
-- (notification_lead_days.vehicle_safety_check_due, default 7) and again on
-- the day, or at once when it is found already late. Up to three vehicles
-- get a notification each, opening that vehicle; more in one run become a
-- single summary, opening the "בדיקות בטיחות" page. Each (vehicle, date,
-- stage) goes out once, recorded in notification_alert_log (101).

create or replace function public.check_vehicle_safety_check_due()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  g record;
  message text;
begin
  create temporary table if not exists pg_temp.safety_check_due_run (
    company_id uuid, vehicle_id uuid, vehicle_label text, next_due date, first_inspection boolean, stage text
  ) on commit drop;
  truncate pg_temp.safety_check_due_run;

  insert into pg_temp.safety_check_due_run
  select p.company_id, p.vehicle_id,
         case when p.vehicle_label = '' then p.plate_number else p.vehicle_label || ' (' || p.plate_number || ')' end,
         p.next_due, p.first_inspection,
         case when p.next_due <= today then 'expired' else 'before' end
  from private.vehicle_inspection_plan(null) p
  join public.companies c on c.id = p.company_id
  where c.status = 'active'
    and p.next_due is not null
    and p.next_due <= today + coalesce((c.notification_lead_days ->> 'vehicle_safety_check_due')::integer, 7)
    and not exists (
      select 1 from public.notification_alert_log l
      where l.notification_type = 'vehicle_safety_check_due'
        and l.subject_id = p.vehicle_id
        and l.anchor_date = p.next_due
        and l.stage = case when p.next_due <= today then 'expired' else 'before' end
    );

  for g in
    select company_id, stage, count(*) as vehicles from pg_temp.safety_check_due_run group by company_id, stage
  loop
    if g.vehicles > 3 then
      message := case
        when g.stage = 'expired' then 'הגיע הזמן לבדיקת בטיחות ב-' || g.vehicles || ' רכבים'
        else 'ב-' || g.vehicles || ' רכבים בדיקת הבטיחות הבאה מתקרבת'
      end;
      insert into public.notifications (company_id, message, notification_type)
      values (g.company_id, message, 'vehicle_safety_check_due');
    else
      insert into public.notifications (company_id, message, notification_type, vehicle_id)
      select r.company_id,
             'בדיקת בטיחות · ' || r.vehicle_label || ': ' || case
               when r.next_due < today then 'המועד עבר ב-' || to_char(r.next_due, 'DD/MM/YYYY')
               when r.next_due = today then 'המועד היום'
               else 'המועד בעוד ' || (r.next_due - today) || ' ימים (' || to_char(r.next_due, 'DD/MM/YYYY') || ')'
             end || case when r.first_inspection then ' · בדיקה ראשונה' else '' end,
             'vehicle_safety_check_due', r.vehicle_id
      from pg_temp.safety_check_due_run r
      where r.company_id = g.company_id and r.stage = g.stage;
    end if;
  end loop;

  insert into public.notification_alert_log (company_id, notification_type, subject_id, anchor_date, stage)
  select company_id, 'vehicle_safety_check_due', vehicle_id, next_due, stage from pg_temp.safety_check_due_run
  on conflict on constraint notification_alert_log_unique do nothing;
end;
$$;

revoke all on function public.check_vehicle_safety_check_due() from public, anon, authenticated;

commit;

-- ------------------------------------------------------------
-- 7. Schedule (separate step, after the function is deployed)
-- ------------------------------------------------------------
-- 03:00 UTC = 06:00 IDT, with the rest of the daily routine.

select cron.unschedule(jobid) from cron.job where jobname = 'check-vehicle-safety-check-due';
select cron.schedule(
  'check-vehicle-safety-check-due',
  '0 3 * * *',
  $$ select public.check_vehicle_safety_check_due() $$
);
