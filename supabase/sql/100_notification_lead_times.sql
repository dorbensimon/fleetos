-- A separate lead time for every timed notification.
--
-- Deployment draft: apply only with production approval, after 90 and 97.
--
-- Until now one company value (companies.vehicle_expiry_lead_days) decided
-- when every vehicle folder's "about to expire" alert went out, the service
-- alert was fixed at 1,000 km and the meeting reminder at 7 days. Managers
-- can now set each one on its own:
--
--   companies.notification_lead_days  jsonb, notification_type -> integer
--     vehicle folder expiry types  days before expiry   1-90
--     driver_meeting_due           days before the date  1-30
--     vehicle_service_due          km before the service 100-5000
--
-- A type with no key keeps its old rule: the folders fall back to
-- vehicle_expiry_lead_days (still the company default), the meeting to 7
-- days, the service to 1,000 km. So applying this changes nothing until a
-- manager moves a value.
--
-- The two daily scans are the live definitions (verified 2026-09-27) with
-- only the lead window changed, plus one wording change in the meeting
-- summary, which said "בשבוע הקרוב" regardless of the window.

begin;

-- ------------------------------------------------------------
-- 1. Per-type lead times
-- ------------------------------------------------------------

alter table public.companies
  add column if not exists notification_lead_days jsonb not null default '{}'::jsonb;

alter table public.companies drop constraint if exists companies_notification_lead_days_object;
alter table public.companies
  add constraint companies_notification_lead_days_object check (jsonb_typeof(notification_lead_days) = 'object');

-- The allowed range for one type, or null when the type has no lead time.
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
    ('vehicle_service_due', 100, 5000)
  ) as b(notification_type, min_value, max_value)
  where b.notification_type = p_type
$$;

-- Company rows are owner-only under RLS; admins change one type at a time
-- through this function. p_value null removes the type's own value, so it
-- goes back to the default.
create or replace function public.set_notification_lead(p_company_id uuid, p_type text, p_value integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  bounds record;
begin
  if not private.can_manage_company(p_company_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into bounds from private.notification_lead_bounds(p_type);
  if bounds.min_value is null then
    raise exception 'unknown notification type' using errcode = '22023';
  end if;
  if p_value is null then
    update public.companies set notification_lead_days = notification_lead_days - p_type where id = p_company_id;
    return;
  end if;
  if p_value < bounds.min_value or p_value > bounds.max_value then
    raise exception 'lead must be between % and %', bounds.min_value, bounds.max_value using errcode = '22023';
  end if;
  update public.companies
  set notification_lead_days = notification_lead_days || jsonb_build_object(p_type, p_value)
  where id = p_company_id;
end;
$$;

revoke execute on function public.set_notification_lead(uuid, text, integer) from public, anon;
grant execute on function public.set_notification_lead(uuid, text, integer) to authenticated;

-- ------------------------------------------------------------
-- 2. Vehicle folders and service: the daily scan
-- ------------------------------------------------------------

create or replace function public.check_vehicle_expiry_notifications()
returns void
language plpgsql
security definer
set search_path to 'public'
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
               when f.expiry_date - current_date <= coalesce(
                 (c.notification_lead_days ->> (case f.folder_key
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
$$;

-- ------------------------------------------------------------
-- 3. Driver meetings: the daily scan
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
    next_due date, first_meeting boolean, stage text, lead_days integer
  ) on commit drop;
  truncate pg_temp.meeting_due_run;

  insert into pg_temp.meeting_due_run
  select p.company_id, p.template_id, p.title, p.driver_id, p.driver_name, p.next_due, p.first_meeting,
         case when p.next_due <= today then 'due' else 'before' end,
         coalesce((c.notification_lead_days ->> 'driver_meeting_due')::integer, 7)
  from private.checklist_meeting_plan(null) p
  join public.companies c on c.id = p.company_id
  where p.next_due <= today + coalesce((c.notification_lead_days ->> 'driver_meeting_due')::integer, 7)
    and c.status = 'active'
    and not exists (
      select 1 from public.checklist_due_alerts a
      where a.template_id = p.template_id
        and a.driver_id = p.driver_id
        and a.due_date = p.next_due
        and a.stage = case when p.next_due <= today then 'due' else 'before' end
    );

  for g in
    select company_id, template_id, min(title) as title, stage, count(*) as drivers, min(lead_days) as lead_days
    from pg_temp.meeting_due_run
    group by company_id, template_id, stage
  loop
    if g.drivers > 3 then
      message := g.title || ': ' || case
        when g.stage = 'due' then 'הגיע המועד למפגש עם ' || g.drivers || ' נהגים'
        when g.lead_days = 7 then 'ל-' || g.drivers || ' נהגים המפגש הבא בשבוע הקרוב'
        else 'ל-' || g.drivers || ' נהגים המפגש הבא ב-' || g.lead_days || ' הימים הקרובים'
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
