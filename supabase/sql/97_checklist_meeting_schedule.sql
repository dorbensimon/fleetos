-- Recurring "רשימת סעיפים" meetings (stage 2 of 96_checklist_meetings.sql).
--
-- Deployment draft: apply only with production approval, after 96.
--
-- A checklist form may repeat: form_content.repeatMonths (1-24) is how often
-- each active driver needs a meeting on it. 0 or missing means a one-time form.
--
-- When is a driver's next meeting due (the same rule as lib/meetingPlan.ts)?
--   1. checklist_schedule.next_due, when set. The checklist-meeting function
--      writes it when the officer signs (meeting date + repeatMonths), and a
--      manager can move it by hand for one driver.
--   2. Otherwise the last signed meeting's date + repeatMonths.
--   3. Otherwise this is the driver's first meeting: 14 days after the later
--      of the day they joined and the day the form was created. So a new
--      driver gets a first-meeting reminder, and a new form does not flag
--      every existing driver as late on day one.
-- Archived drivers never appear.
--
-- A daily scan tells the company's managers 7 days before a meeting is due
-- and again on the day (or at once, when it is found already late). Up to
-- three drivers get a notification each, opening that driver's folder; more
-- than that in one run become a single summary, opening the form's
-- "מפגש חדש" list where the due drivers come first.

begin;

-- ------------------------------------------------------------
-- 1. The next meeting, per form and driver
-- ------------------------------------------------------------

create table if not exists public.checklist_schedule (
  template_id uuid not null references public.signing_templates(id) on delete cascade,
  driver_id   uuid not null references public.profiles(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  next_due    date not null,
  -- The meeting whose signing set this date; null when a manager set it by hand.
  meeting_id  uuid references public.checklist_meetings(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (template_id, driver_id)
);

create index if not exists checklist_schedule_company_idx on public.checklist_schedule(company_id, next_due);
create index if not exists checklist_schedule_driver_idx on public.checklist_schedule(driver_id);
create index if not exists checklist_schedule_meeting_idx on public.checklist_schedule(meeting_id);
create index if not exists checklist_schedule_updated_by_idx on public.checklist_schedule(updated_by);

alter table public.checklist_schedule enable row level security;
revoke all on public.checklist_schedule from anon, authenticated;
grant select on public.checklist_schedule to authenticated;
grant select, insert, update, delete on public.checklist_schedule to service_role;

drop policy if exists "managers read company meeting schedule" on public.checklist_schedule;
create policy "managers read company meeting schedule" on public.checklist_schedule
for select to authenticated
using (
  private.can_manage_company(company_id)
  and (private.current_role_name() = 'owner' or private.current_company_is_active())
);

-- ------------------------------------------------------------
-- 2. Sent-reminder ledger
-- ------------------------------------------------------------
-- One row per (form, driver, due date, stage). Moving the date or holding
-- the meeting gives a new due date, so its reminders fire again on their own.

create table if not exists public.checklist_due_alerts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  template_id uuid not null references public.signing_templates(id) on delete cascade,
  driver_id   uuid not null references public.profiles(id) on delete cascade,
  due_date    date not null,
  stage       text not null check (stage in ('before', 'due')),
  sent_at     timestamptz not null default now(),
  constraint checklist_due_alerts_unique unique (template_id, driver_id, due_date, stage)
);

create index if not exists checklist_due_alerts_company_idx on public.checklist_due_alerts(company_id);
create index if not exists checklist_due_alerts_driver_idx on public.checklist_due_alerts(driver_id);

alter table public.checklist_due_alerts enable row level security;
revoke all on public.checklist_due_alerts from anon, authenticated;
grant select, insert, update, delete on public.checklist_due_alerts to service_role;

-- ------------------------------------------------------------
-- 3. Notification type
-- ------------------------------------------------------------
-- The lists are the ones in 90, plus 'driver_meeting_due'.

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
    'driver_meeting_due'
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
    'driver_meeting_due'
  )
);

-- ------------------------------------------------------------
-- 4. Who needs a meeting, and when
-- ------------------------------------------------------------

create or replace function private.checklist_meeting_plan(p_company_id uuid default null)
returns table (
  company_id uuid,
  template_id uuid,
  title text,
  driver_id uuid,
  driver_name text,
  last_meeting date,
  next_due date,
  first_meeting boolean
)
language sql
stable
security definer
set search_path to ''
as $$
  with templates as (
    select t.id, t.company_id, t.title,
           -- Checked before the cast: SQL does not promise the order of AND.
           case when jsonb_typeof(t.form_content -> 'repeatMonths') = 'number'
                     and (t.form_content ->> 'repeatMonths') ~ '^[0-9]{1,2}$'
                then (t.form_content ->> 'repeatMonths')::int else 0 end as months,
           (t.created_at at time zone 'Asia/Jerusalem')::date as created_on
    from public.signing_templates t
    where t.form_kind = 'checklist'
      and t.status = 'ready'
      and t.archived_at is null
      and t.company_id is not null
      and (p_company_id is null or t.company_id = p_company_id)
  ),
  forms as (
    select * from templates where months between 1 and 24
  ),
  drivers as (
    select p.id, p.company_id, coalesce(nullif(trim(p.full_name), ''), 'נהג') as name,
           coalesce(dd.employment_start_date, (dd.created_at at time zone 'Asia/Jerusalem')::date) as joined_on
    from public.profiles p
    join public.driver_details dd on dd.id = p.id and dd.status = 'active'
    where p.role = 'driver'
      and (p_company_id is null or p.company_id = p_company_id)
  )
  select f.company_id, f.id, f.title, d.id, d.name,
         last.meeting_date,
         coalesce(
           s.next_due,
           (last.meeting_date + make_interval(months => f.months))::date,
           greatest(d.joined_on, f.created_on) + 14
         ),
         last.meeting_date is null
  from forms f
  join drivers d on d.company_id = f.company_id
  left join public.checklist_schedule s on s.template_id = f.id and s.driver_id = d.id
  left join lateral (
    select m.meeting_date
    from public.checklist_meetings m
    where m.template_id = f.id and m.driver_id = d.id and m.status = 'signed'
    order by m.meeting_date desc
    limit 1
  ) last on true;
$$;

revoke all on function private.checklist_meeting_plan(uuid) from public, anon, authenticated;

-- The same plan for the app (lib/meetingPlan.ts): the company's managers only.
create or replace function public.list_checklist_meeting_plan(p_company_id uuid)
returns table (
  template_id uuid,
  title text,
  driver_id uuid,
  driver_name text,
  last_meeting date,
  next_due date,
  first_meeting boolean
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
    select p.template_id, p.title, p.driver_id, p.driver_name, p.last_meeting, p.next_due, p.first_meeting
    from private.checklist_meeting_plan(p_company_id) p
    order by p.next_due, p.driver_name;
end;
$$;

revoke all on function public.list_checklist_meeting_plan(uuid) from public, anon;
grant execute on function public.list_checklist_meeting_plan(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. The daily scan
-- ------------------------------------------------------------

create or replace function public.check_checklist_meeting_due()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  g record;
  r record;
  message text;
begin
  create temporary table if not exists pg_temp.meeting_due_run (
    company_id uuid, template_id uuid, title text, driver_id uuid, driver_name text,
    next_due date, first_meeting boolean, stage text
  ) on commit drop;
  truncate pg_temp.meeting_due_run;

  insert into pg_temp.meeting_due_run
  select p.company_id, p.template_id, p.title, p.driver_id, p.driver_name, p.next_due, p.first_meeting,
         case when p.next_due <= today then 'due' else 'before' end
  from private.checklist_meeting_plan(null) p
  join public.companies c on c.id = p.company_id
  where p.next_due <= today + 7
    and c.status = 'active'
    and not exists (
      select 1 from public.checklist_due_alerts a
      where a.template_id = p.template_id
        and a.driver_id = p.driver_id
        and a.due_date = p.next_due
        and a.stage = case when p.next_due <= today then 'due' else 'before' end
    );

  for g in
    select company_id, template_id, min(title) as title, stage, count(*) as drivers
    from pg_temp.meeting_due_run
    group by company_id, template_id, stage
  loop
    if g.drivers > 3 then
      message := g.title || ': ' || case
        when g.stage = 'due' then 'הגיע המועד למפגש עם ' || g.drivers || ' נהגים'
        else 'ל-' || g.drivers || ' נהגים המפגש הבא בשבוע הקרוב'
      end;
      insert into public.notifications (company_id, message, notification_type, folder_key)
      values (g.company_id, message, 'driver_meeting_due', g.template_id::text);
    else
      for r in
        select * from pg_temp.meeting_due_run
        where company_id = g.company_id and template_id = g.template_id and stage = g.stage
      loop
        message := r.title || ' · ' || r.driver_name || ': ' || case
          when r.next_due < today then 'המועד עבר ב-' || to_char(r.next_due, 'DD/MM/YYYY')
          when r.next_due = today then 'המועד היום'
          else 'המועד בעוד ' || (r.next_due - today) || ' ימים (' || to_char(r.next_due, 'DD/MM/YYYY') || ')'
        end || case when r.first_meeting then ' · מפגש ראשון' else '' end;
        insert into public.notifications (company_id, actor_id, actor_name, message, notification_type, folder_key)
        values (r.company_id, r.driver_id, r.driver_name, message, 'driver_meeting_due', r.template_id::text);
      end loop;
    end if;
  end loop;

  insert into public.checklist_due_alerts (company_id, template_id, driver_id, due_date, stage)
  select company_id, template_id, driver_id, next_due, stage from pg_temp.meeting_due_run
  on conflict on constraint checklist_due_alerts_unique do nothing;
end;
$$;

revoke all on function public.check_checklist_meeting_due() from public, anon, authenticated;

commit;

-- ------------------------------------------------------------
-- 6. Schedule (separate step, after the functions are deployed)
-- ------------------------------------------------------------
-- 03:00 UTC = 06:00 IDT, with the rest of the daily routine (see 33).

select cron.unschedule(jobid) from cron.job where jobname = 'check-checklist-meeting-due';
select cron.schedule(
  'check-checklist-meeting-due',
  '0 3 * * *',
  $$ select public.check_checklist_meeting_due() $$
);
