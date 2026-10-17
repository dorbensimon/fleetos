-- תיקיות שהבעלים מוסיף לחברה: לרכבים ולתיק הנהג
--
-- The platform owner adds folders of its own to a company, beside the fixed
-- folders in the code: for its vehicles (managers upload into them) and for
-- its drivers' files (managers and the driver upload into them). A file in
-- such a folder is an ordinary row in public.documents whose category is
-- 'folder:<folder id>', so uploads, viewing, deleting and the storage rules
-- all work as they do for the fixed folders.
--
-- Only the owner creates, renames or removes a folder. A folder that still
-- holds files cannot be removed (the files would vanish from every screen).
-- A folder may track an expiry date: its files are then asked for one, and
-- the daily checks alert the company (and the vehicle's drivers / the driver)
-- before and when the latest file in it expires, like the fixed folders.

create table if not exists public.company_document_folders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  owner_type text not null check (owner_type in ('vehicle', 'driver')),
  title text not null check (char_length(btrim(title)) between 1 and 60),
  tracks_expiry boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists company_document_folders_title_unique
  on public.company_document_folders (company_id, owner_type, lower(btrim(title)));
create index if not exists company_document_folders_company
  on public.company_document_folders (company_id, owner_type, position);

alter table public.company_document_folders enable row level security;

-- Managers of the company (and the owner) see its folders; a driver sees the
-- driver-file folders of his own active company.
drop policy if exists "read company document folders" on public.company_document_folders;
create policy "read company document folders"
  on public.company_document_folders for select to authenticated
  using (
    private.can_manage_company(company_id)
    or (
      owner_type = 'driver'
      and private.current_role_name() = 'driver'
      and company_id = private.current_company_id()
      and private.current_company_is_active()
    )
  );

drop policy if exists "owner writes company document folders" on public.company_document_folders;
create policy "owner writes company document folders"
  on public.company_document_folders for all to authenticated
  using (private.current_role_name() = 'owner')
  with check (private.current_role_name() = 'owner');

revoke all on public.company_document_folders from anon;
grant select, insert, update, delete on public.company_document_folders to authenticated;

-- A folder with files stays: the owner sees the reason instead of losing them.
create or replace function private.keep_document_folder_with_files()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.documents d where d.company_id = old.company_id and d.category = 'folder:' || old.id::text) then
    raise exception 'folder_has_files' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_keep_document_folder_with_files on public.company_document_folders;
create trigger trg_keep_document_folder_with_files
  before delete on public.company_document_folders
  for each row
  -- A whole company being deleted takes its folders with it.
  when (pg_trigger_depth() = 0)
  execute function private.keep_document_folder_with_files();

/* ---------------- expiry alerts ---------------- */

-- The two new alert kinds join the allowed notification types.
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
    'signature_expiry', 'vehicle_custom_folder_expiry', 'driver_custom_folder_expiry'
  ]::text[])
);

-- …and can be switched off per person in the notification settings.
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
    'vehicle_custom_folder_expiry', 'driver_custom_folder_expiry'
  ]::text[])
);

-- How far ahead each new alert may be set (the notification settings screen).
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
    ('driver_meeting_due', 1, 30),
    ('vehicle_service_due', 100, 5000),
    ('driver_license_expiry', 1, 90),
    ('company_carrier_license_expiry', 1, 90),
    ('vehicle_odometer_stale', 7, 90),
    ('vehicle_safety_check_due', 1, 30)
  ) as b(notification_type, min_value, max_value)
  where b.notification_type = p_type
$function$;

-- Vehicles: the same daily check as before, plus the owner's folders that track an expiry.
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
          and (
            d.category in ('safety_officer_approval', 'tachograph_calibration', 'brakes_semiannual',
                           'brakes_annual', 'winter_inspection', 'child_detection')
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
                 (c.notification_lead_days ->> (case
                   when f.folder_key like 'folder:%' then 'vehicle_custom_folder_expiry'
                   else case f.folder_key
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

-- Drivers: one alert per stage for the latest file of each of the owner's
-- expiring driver-file folders (to the company's managers and to the driver).
create table if not exists public.driver_folder_expiry_alerts (
  company_id uuid not null references public.companies(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  folder_key text not null,
  expiry_date date not null,
  stage text not null check (stage in ('before', 'expired')),
  created_at timestamptz not null default now(),
  constraint driver_folder_expiry_alerts_unique unique (driver_id, folder_key, expiry_date, stage)
);
alter table public.driver_folder_expiry_alerts enable row level security;
revoke all on public.driver_folder_expiry_alerts from anon, authenticated;

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
    with latest as (
      select distinct on (d.owner_id, d.category)
             d.company_id, d.owner_id as driver_id, d.category as folder_key, d.expiry_date, f.title
      from public.documents d
      join public.company_document_folders f
        on 'folder:' || f.id::text = d.category and f.company_id = d.company_id
       and f.owner_type = 'driver' and f.tracks_expiry
      where d.owner_type = 'driver'
      order by d.owner_id, d.category, d.created_at desc
    ),
    candidates as (
      select l.*, p.full_name,
             case
               when l.expiry_date <= current_date then 'expired'
               when l.expiry_date - current_date <= coalesce((c.notification_lead_days ->> 'driver_custom_folder_expiry')::integer, 30) then 'before'
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

revoke all on function public.check_driver_folder_expiry_notifications() from public, anon, authenticated;

-- A newer file with a later date settles that folder's open alerts.
create or replace function private.resolve_driver_folder_expiry_on_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_type = 'driver' and new.category like 'folder:%'
     and new.expiry_date is not null and new.expiry_date > current_date then
    update public.notifications
       set read_at = now()
     where actor_id = new.owner_id
       and folder_key = new.category
       and notification_type = 'driver_custom_folder_expiry'
       and read_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_resolve_driver_folder_expiry_on_document on public.documents;
create trigger trg_resolve_driver_folder_expiry_on_document
  after insert or update of expiry_date on public.documents
  for each row execute function private.resolve_driver_folder_expiry_on_document();

select cron.unschedule('check-driver-folder-expiry-notifications')
where exists (select 1 from cron.job where jobname = 'check-driver-folder-expiry-notifications');
select cron.schedule('check-driver-folder-expiry-notifications', '0 3 * * *', $$ select public.check_driver_folder_expiry_notifications() $$);
