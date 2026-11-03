-- 135_company_folder_own_alerts.sql
--
-- Every company folder with an expiry date (112) gets an alert of its own
-- in the notification settings, like the fixed folders: a manager switches
-- it on or off and sets how many days ahead it warns. Until now all added
-- folders shared one row ("תוקף בתיקיות שנוספו").
--
-- The folder's key, 'folder:<id>', is what its notifications already carry
-- in notifications.folder_key, so it doubles as the setting's key:
--   notification_preferences.notification_type = 'folder:<id>'  (off for me)
--   companies.notification_lead_days ->> 'folder:<id>'          (days ahead)
-- A folder without its own lead keeps the shared value, then the default,
-- so applying this changes no alert until someone moves a value.
-- Managers' existing "off" on the shared rows becomes "off" on each folder.
--
-- Applied to production with Dor's approval on 2026-11-03.

begin;

-- 1. A preference may name one company folder.
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
    'email_daily_digest', 'vehicle_temperature_calibration_expiry', 'vehicle_leasing_end_expiry'
  ]::text[])
  or notification_type ~ '^folder:[0-9a-f-]{36}$'
);

-- 2. A folder switched off hides its notifications from that user.
drop policy if exists "users see relevant notifications" on public.notifications;
create policy "users see relevant notifications"
  on public.notifications for select to authenticated
  using (
    (
      (
        recipient_id = (select auth.uid())
        and company_id = private.current_company_id()
        and private.current_company_is_active()
        and not private.current_driver_is_archived()
        and not private.current_user_pending_password_setup()
      )
      or (recipient_id is null and (select private.can_manage_company(notifications.company_id)))
    )
    and (
      notification_type is null
      or not exists (
        select 1 from public.notification_preferences preference
        where preference.user_id = (select auth.uid())
          and preference.enabled = false
          and (preference.notification_type = notifications.notification_type
               or preference.notification_type = notifications.folder_key)
      )
    )
  );

-- The daily email follows the same rule.
create or replace function public.email_digest_recipients()
returns table (email text, full_name text, company_name text, messages text[])
language sql
stable
security definer
set search_path to ''
as $function$
  with lines as (
    select u.email::text as email, p.full_name, c.name as company, n.message, n.created_at
    from public.company_memberships m
    join public.profiles p on p.id = m.user_id and p.role = 'admin'
    join auth.users u on u.id = p.id
    join public.companies c on c.id = m.company_id and c.status = 'active'
    join public.notifications n
      on n.company_id = m.company_id
     and (n.recipient_id = p.id or n.recipient_id is null)
     and n.read_at is null
     and n.created_at > now() - interval '24 hours'
    where u.email is not null
      and not exists (
        select 1 from public.notification_preferences off
        where off.user_id = p.id and off.enabled = false
          and (off.notification_type in ('email_daily_digest', n.notification_type)
               or off.notification_type = n.folder_key)
      )
  ), spread as (
    select email, count(distinct company) as companies from lines group by email
  )
  select l.email, l.full_name, string_agg(distinct l.company, ' · '),
    array_agg(case when s.companies > 1 then l.company || ': ' || l.message else l.message end
              order by l.created_at desc)
  from lines l join spread s using (email)
  group by l.email, l.full_name
$function$;

-- 3. Days ahead for one folder of the company (1-90, like the others).
create or replace function public.set_notification_lead(p_company_id uuid, p_type text, p_value integer)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  bounds record;
begin
  if not private.can_manage_company(p_company_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_type like 'folder:%' then
    if not exists (
      select 1 from public.company_document_folders f
      where 'folder:' || f.id::text = p_type and f.company_id = p_company_id and f.tracks_expiry
    ) then
      raise exception 'unknown notification type' using errcode = '22023';
    end if;
    select 1 as min_value, 90 as max_value into bounds;
  else
    select * into bounds from private.notification_lead_bounds(p_type);
  end if;
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
$function$;

-- 4. The daily checks read the folder's own lead first.
create or replace function public.check_vehicle_expiry_notifications()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      select ci.company_id, ci.owner_id as vehicle_id, ci.item_type as folder_key, ci.expiry_date
      from public.compliance_items ci
      where ci.owner_type = 'vehicle'
        and ci.item_type in ('vehicle_license', 'operating_license', 'insurance_mandatory', 'insurance_comprehensive', 'engineer_report')
      union all
      select latest.company_id, latest.vehicle_id, latest.folder_key, latest.expiry_date
      from (
        select distinct on (d.owner_id, d.category)
               d.company_id, d.owner_id as vehicle_id, d.category as folder_key, d.expiry_date
        from public.documents d
        where d.owner_type = 'vehicle'
          and (
            d.category in ('license_annex', 'tachograph_calibration', 'brakes_semiannual',
                           'brakes_annual', 'winter_inspection', 'child_detection',
                           'temperature_calibration', 'leasing_end')
            or exists (
              select 1 from public.company_document_folders f
              where 'folder:' || f.id::text = d.category
                and f.company_id = d.company_id
                and f.owner_type = 'vehicle'
                and f.tracks_expiry
            )
          )
        order by d.owner_id, d.category, d.created_at desc
      ) latest
    ),
    candidates as (
      select f.company_id, f.vehicle_id, f.folder_key, f.expiry_date,
             v.plate_number, v.manufacturer, v.model,
             case
               when f.expiry_date <= current_date then 'expired'
               when f.expiry_date - current_date <= coalesce(
                 (c.notification_lead_days ->> (case when f.folder_key like 'folder:%' then f.folder_key end))::integer,
                 (c.notification_lead_days ->> (case
                   when f.folder_key like 'folder:%' then 'vehicle_custom_folder_expiry'
                   else case f.folder_key
                   when 'vehicle_license' then 'vehicle_license_expiry'
                   when 'operating_license' then 'vehicle_operating_license_expiry'
                   when 'insurance_mandatory' then 'vehicle_insurance_mandatory_expiry'
                   when 'insurance_comprehensive' then 'vehicle_insurance_comprehensive_expiry'
                   when 'engineer_report' then 'vehicle_engineer_report_expiry'
                   when 'license_annex' then 'vehicle_license_annex_expiry'
                   when 'tachograph_calibration' then 'vehicle_tachograph_calibration_expiry'
                   when 'brakes_semiannual' then 'vehicle_brakes_semiannual_expiry'
                   when 'brakes_annual' then 'vehicle_brakes_annual_expiry'
                   when 'winter_inspection' then 'vehicle_winter_inspection_expiry'
                   when 'child_detection' then 'vehicle_child_detection_expiry'
                   when 'temperature_calibration' then 'vehicle_temperature_calibration_expiry'
                   when 'leasing_end' then 'vehicle_leasing_end_expiry'
                   end
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
    if r.folder_key like 'folder:%' then
      select f.title into item_label from public.company_document_folders f where 'folder:' || f.id::text = r.folder_key;
      item_notification_type := 'vehicle_custom_folder_expiry';
    else
      item_label := case r.folder_key
        when 'vehicle_license' then 'רישיון רכב'
        when 'operating_license' then 'רישיון הפעלה'
        when 'insurance_mandatory' then 'ביטוח חובה'
        when 'insurance_comprehensive' then 'ביטוח מקיף'
        when 'engineer_report' then 'מסמך תסקיר מהנדס'
        when 'license_annex' then 'נספח לרישיון'
        when 'tachograph_calibration' then 'כיול טכוגרף'
        when 'brakes_semiannual' then 'בלמים חצי-שנתי'
        when 'brakes_annual' then 'בלמים שנתי'
        when 'winter_inspection' then 'בדיקת חורף'
        when 'child_detection' then 'שכחת ילדים'
        when 'temperature_calibration' then 'כיול טמפרטורה'
        when 'leasing_end' then 'סיום ליסינג'
      end;
      item_notification_type := case r.folder_key
        when 'vehicle_license' then 'vehicle_license_expiry'
        when 'operating_license' then 'vehicle_operating_license_expiry'
        when 'insurance_mandatory' then 'vehicle_insurance_mandatory_expiry'
        when 'insurance_comprehensive' then 'vehicle_insurance_comprehensive_expiry'
        when 'engineer_report' then 'vehicle_engineer_report_expiry'
        when 'license_annex' then 'vehicle_license_annex_expiry'
        when 'tachograph_calibration' then 'vehicle_tachograph_calibration_expiry'
        when 'brakes_semiannual' then 'vehicle_brakes_semiannual_expiry'
        when 'brakes_annual' then 'vehicle_brakes_annual_expiry'
        when 'winter_inspection' then 'vehicle_winter_inspection_expiry'
        when 'child_detection' then 'vehicle_child_detection_expiry'
        when 'temperature_calibration' then 'vehicle_temperature_calibration_expiry'
        when 'leasing_end' then 'vehicle_leasing_end_expiry'
      end;
    end if;
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
$function$;

create or replace function public.check_driver_folder_expiry_notifications()
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
    with folders as (
      select f.company_id, 'folder:' || f.id::text as folder_key, f.title
      from public.company_document_folders f
      where f.owner_type = 'driver' and f.tracks_expiry
    ),
    fixed(folder_key, title) as (values
      ('general', 'מסמכים כלליים'),
      ('transport_info', 'מסמכי מידע תעבורתי'),
      ('driver_file', 'תיק נהג'),
      ('notes_feedback', 'הערות ותגובות'),
      ('traffic_reports', 'דוחות תעבורה'),
      ('accompanying_drivers', 'נהגים נלווים'),
      ('procedure_6', 'נוהל 6'),
      ('certifications', 'הסמכות והכשרות'),
      ('hazmat', 'חומרים מסוכנים'),
      ('trainings', 'הדרכות והכשרות')
    ),
    latest as (
      select distinct on (d.owner_id, d.category)
             d.company_id, d.owner_id as driver_id, d.category as folder_key, d.expiry_date,
             coalesce(f.title, x.title) as title
      from public.documents d
      left join folders f on f.folder_key = d.category and f.company_id = d.company_id
      left join fixed x on x.folder_key = d.category
      where d.owner_type = 'driver'
        and (f.folder_key is not null or x.folder_key is not null)
      order by d.owner_id, d.category, d.created_at desc
    ),
    candidates as (
      select l.*, p.full_name,
             case
               when l.expiry_date <= current_date then 'expired'
               when l.expiry_date - current_date <= coalesce(
                 (c.notification_lead_days ->> (case when l.folder_key like 'folder:%' then l.folder_key end))::integer,
                 (c.notification_lead_days ->> 'driver_custom_folder_expiry')::integer,
                 30
               ) then 'before'
             end as stage
      from latest l
      join public.profiles p on p.id = l.driver_id and p.role = 'driver'
      left join public.driver_details dd on dd.id = l.driver_id
      join public.companies c on c.id = l.company_id and c.status = 'active'
      where l.expiry_date is not null
        and coalesce(dd.status, '') <> 'archived'
    )
    select ca.* from candidates ca
    where ca.stage is not null
      and not exists (
        select 1 from public.driver_folder_expiry_alerts a
        where a.driver_id = ca.driver_id and a.folder_key = ca.folder_key
          and a.expiry_date = ca.expiry_date and a.stage = ca.stage
      )
  loop
    date_label := to_char(r.expiry_date, 'DD/MM/YYYY');

    insert into public.notifications (company_id, actor_id, actor_name, message, notification_type, folder_key)
    values (
      r.company_id, r.driver_id, r.full_name,
      case when r.stage = 'expired'
        then 'תוקף ' || r.title || ' של הנהג ' || coalesce(r.full_name, '') || ' פג ב-' || date_label
        else 'תוקף ' || r.title || ' של הנהג ' || coalesce(r.full_name, '') || ' יפוג בעוד ' || (r.expiry_date - current_date) || ' ימים (' || date_label || ')'
      end,
      'driver_custom_folder_expiry', r.folder_key
    );

    insert into public.notifications (company_id, recipient_id, actor_id, actor_name, message, notification_type, folder_key)
    values (
      r.company_id, r.driver_id, r.driver_id, r.full_name,
      case when r.stage = 'expired'
        then 'תוקף ' || r.title || ' שלך פג ב-' || date_label
        else 'תוקף ' || r.title || ' שלך יפוג בעוד ' || (r.expiry_date - current_date) || ' ימים (' || date_label || ')'
      end,
      'driver_custom_folder_expiry', r.folder_key
    );

    insert into public.driver_folder_expiry_alerts (company_id, driver_id, folder_key, expiry_date, stage)
    values (r.company_id, r.driver_id, r.folder_key, r.expiry_date, r.stage)
    on conflict on constraint driver_folder_expiry_alerts_unique do nothing;
  end loop;
end;
$function$;

-- 5. A manager who had the shared row off keeps every folder off.
insert into public.notification_preferences (user_id, notification_type, enabled)
select pref.user_id, 'folder:' || f.id::text, false
from public.notification_preferences pref
join public.profiles p on p.id = pref.user_id and p.role = 'admin'
join public.company_memberships m on m.user_id = pref.user_id
join public.company_document_folders f
  on f.company_id = m.company_id and f.tracks_expiry
 and f.owner_type = case pref.notification_type when 'vehicle_custom_folder_expiry' then 'vehicle' else 'driver' end
where pref.enabled = false
  and pref.notification_type in ('vehicle_custom_folder_expiry', 'driver_custom_folder_expiry')
on conflict on constraint notification_preferences_user_type_unique do nothing;

delete from public.notification_preferences pref
using public.profiles p
where p.id = pref.user_id and p.role = 'admin'
  and pref.notification_type in ('vehicle_custom_folder_expiry', 'driver_custom_folder_expiry');

commit;
