-- ============================================================
-- 35_notification_preferences.sql
--
-- Implements `.claude/prds/notification-settings.md` (approved,
-- 2026-08-24): per-user "Settings" toggles for the 6 existing
-- notification sources (25, 28, 31). Two parts:
--
--   1. `notification_preferences(user_id, notification_type, enabled)`
--      — per-user opt-out, default "everything on" (absence of a row
--      = enabled). RLS: a user only ever sees/edits their own rows.
--
--   2. Tag every `notifications` insert with a `notification_type`
--      (new nullable column — nullable so existing historical rows,
--      which predate this concept, don't need backfilling/guessing)
--      from the closed list of 6 values in the PRD, and enforce the
--      opt-out.
--
-- Design decision on *where* the opt-out is enforced — read carefully,
-- this deviates from a literal reading of the PRD's "insert" wording
-- and that's intentional:
--
-- `notifications` rows are NOT per-recipient. A single row is written
-- per event (scoped by `company_id` only) and made visible to *every*
-- admin/owner of that company via the existing SELECT RLS policy
-- (`can_manage_company(company_id)`). There is no recipient column.
--
-- Given that, filtering at INSERT time is the wrong mechanism: it
-- would suppress the notification for *all* company admins the moment
-- any single one of them opts out, which directly violates the PRD's
-- own acceptance criterion ("...לא משפיע על משתמשים אחרים באונה
-- חברה"). The PRD's own wording anticipates this — user story 3
-- explicitly allows "מנגנון סינון מקביל שמונע את ה-insert/את הצגתה
-- למשתמש הרלוונטי" (an insert-blocking mechanism *or* an equivalent
-- one that prevents the notification from being shown to the specific
-- user). So: the row is still written once (cheap, keeps the existing
-- "log of everything that happened" semantics other admins rely on),
-- and the opt-out is enforced as a per-viewer filter on the existing
-- SELECT policy — the only mechanism that can honor "off for me,
-- still on for my colleague" against a shared row. This is a
-- server-side enforcement (RLS), not a UI-only filter, so it still
-- satisfies "not just hidden in the UI".
-- ============================================================


-- ------------------------------------------------------------
-- 1. notification_preferences
-- ------------------------------------------------------------

create table if not exists public.notification_preferences (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'driver_profile_update',
    'driver_document_upload',
    'vehicle_insurance_mandatory_expiry',
    'vehicle_insurance_comprehensive_expiry',
    'vehicle_annual_test_expiry',
    'vehicle_service_due'
  )),
  enabled           boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint notification_preferences_user_type_unique unique (user_id, notification_type)
);

-- Covers both the RLS filter join below (user_id, notification_type)
-- and simple per-user listing for the settings screen; the unique
-- constraint above already creates this exact index, kept explicit
-- here only for documentation purposes (no duplicate index created).

alter table public.notification_preferences enable row level security;

drop policy if exists "user manages own notification_preferences" on public.notification_preferences;
create policy "user manages own notification_preferences"
  on public.notification_preferences
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.notification_preferences to authenticated, service_role;

drop trigger if exists trg_notification_preferences_updated_at on public.notification_preferences;
create trigger trg_notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.touch_updated_at();


-- ------------------------------------------------------------
-- 2. notifications.notification_type
--
-- Nullable: historical rows (pre-this-migration) and any future
-- notification source that isn't one of the 6 classified types stay
-- unclassified rather than being force-fit or blocked. Unclassified
-- rows are never opt-out-able (see filter below) — they always show,
-- same as today's behavior.
-- ------------------------------------------------------------

alter table public.notifications
  add column if not exists notification_type text;

alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type is null or notification_type in (
    'driver_profile_update',
    'driver_document_upload',
    'vehicle_insurance_mandatory_expiry',
    'vehicle_insurance_comprehensive_expiry',
    'vehicle_annual_test_expiry',
    'vehicle_service_due'
  ));

create index if not exists notifications_type_idx on public.notifications(notification_type);


-- ------------------------------------------------------------
-- 3. Tag the 3 existing notification sources with their type.
--    (`create or replace function` — same functions from 25/28/31,
--    body updated in place via this new migration; 25/28/31 files
--    themselves are not edited.)
-- ------------------------------------------------------------

-- 25: driver self-edit of profiles/driver_details -> driver_profile_update
create or replace function public.log_driver_self_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed text[] := '{}';
  actor_company uuid;
  actor_full_name text;
begin
  if auth.uid() is null
     or public.current_role_name() is distinct from 'driver'
     or new.id is distinct from auth.uid() then
    return new;
  end if;

  if TG_TABLE_NAME = 'profiles' then
    if new.full_name is distinct from old.full_name then changed := array_append(changed, 'שם מלא'); end if;
    if new.phone is distinct from old.phone then changed := array_append(changed, 'טלפון'); end if;
  elsif TG_TABLE_NAME = 'driver_details' then
    if new.national_id is distinct from old.national_id then changed := array_append(changed, 'תעודת זהות'); end if;
    if new.employee_number is distinct from old.employee_number then changed := array_append(changed, 'מספר עובד'); end if;
    if new.license_classes is distinct from old.license_classes then changed := array_append(changed, 'דרגת רישיון'); end if;
    if new.license_expiry is distinct from old.license_expiry then changed := array_append(changed, 'תוקף רישיון'); end if;
    if new.department_id is distinct from old.department_id then changed := array_append(changed, 'מחלקה'); end if;
  end if;

  if array_length(changed, 1) is null then
    return new;
  end if;

  select company_id, full_name into actor_company, actor_full_name
  from public.profiles where id = auth.uid();

  insert into public.notifications (company_id, actor_id, actor_name, message, notification_type)
  values (
    actor_company,
    auth.uid(),
    coalesce(actor_full_name, 'נהג'),
    coalesce(actor_full_name, 'נהג') || ' עדכן/ה: ' || array_to_string(changed, ', '),
    'driver_profile_update'
  );

  return new;
end;
$$;

-- 28: driver document upload -> driver_document_upload
create or replace function public.log_driver_document_upload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_full_name text;
begin
  if auth.uid() is null
     or public.current_role_name() is distinct from 'driver'
     or new.owner_type is distinct from 'driver' then
    return new;
  end if;

  select full_name into actor_full_name from public.profiles where id = auth.uid();

  insert into public.notifications (company_id, actor_id, actor_name, message, notification_type)
  values (
    new.company_id,
    auth.uid(),
    coalesce(actor_full_name, 'נהג'),
    coalesce(actor_full_name, 'נהג') || ' העלה/תה מסמך: ' || new.title,
    'driver_document_upload'
  );

  return new;
end;
$$;

-- 31: expiry/service scan -> the 4 vehicle_* types
create or replace function public.check_vehicle_expiry_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  item_label text;
  vehicle_label text;
  item_notification_type text;
begin
  for r in
    select ci.id as compliance_id, ci.company_id, ci.item_type, ci.expiry_date,
           v.plate_number, v.manufacturer, v.model
    from public.compliance_items ci
    join public.vehicles v on v.id = ci.owner_id and ci.owner_type = 'vehicle'
    where ci.item_type in ('insurance_mandatory', 'insurance_comprehensive', 'annual_test')
      and ci.expiry_date is not null
      and ci.expiry_date - current_date between 0 and 20
      and ci.expiry_notified_at is null
  loop
    item_label := case r.item_type
      when 'insurance_mandatory' then 'ביטוח חובה'
      when 'insurance_comprehensive' then 'ביטוח מקיף'
      when 'annual_test' then 'טסט שנתי'
      else r.item_type
    end;
    item_notification_type := case r.item_type
      when 'insurance_mandatory' then 'vehicle_insurance_mandatory_expiry'
      when 'insurance_comprehensive' then 'vehicle_insurance_comprehensive_expiry'
      when 'annual_test' then 'vehicle_annual_test_expiry'
    end;
    vehicle_label := trim(both ' ' from coalesce(r.manufacturer, '') || ' ' || coalesce(r.model, ''))
      || ' (' || r.plate_number || ')';

    insert into public.notifications (company_id, message, notification_type)
    values (
      r.company_id,
      'לרכב ' || vehicle_label || ' נותרו ' || (r.expiry_date - current_date)
        || ' ימים לחידוש ' || item_label || ' (בתוקף עד ' || to_char(r.expiry_date, 'DD/MM/YYYY') || ')',
      item_notification_type
    );

    update public.compliance_items set expiry_notified_at = now() where id = r.compliance_id;
  end loop;

  for r in
    select v.id as vehicle_id, v.company_id, v.plate_number, v.manufacturer, v.model,
           v.odometer, v.next_service_km
    from public.vehicles v
    where v.next_service_km is not null
      and v.next_service_km - v.odometer between 0 and 1000
      and v.service_notified_at is null
  loop
    vehicle_label := trim(both ' ' from coalesce(r.manufacturer, '') || ' ' || coalesce(r.model, ''))
      || ' (' || r.plate_number || ')';

    insert into public.notifications (company_id, message, notification_type)
    values (
      r.company_id,
      'לרכב ' || vehicle_label || ' נותרו ' || (r.next_service_km - r.odometer) || ' ק"מ לטיפול הבא',
      'vehicle_service_due'
    );

    update public.vehicles set service_notified_at = now() where id = r.vehicle_id;
  end loop;
end;
$$;


-- ------------------------------------------------------------
-- 4. Enforce the opt-out on read (see design note at top of file).
--    Replaces the SELECT policy from 25 with the same
--    can_manage_company scope, plus a per-viewer preference filter.
--    Unclassified rows (notification_type is null) are never
--    filtered, matching current behavior.
-- ------------------------------------------------------------

drop policy if exists "company managers see own notifications" on public.notifications;
create policy "company managers see own notifications"
  on public.notifications
  for select
  using (
    can_manage_company(company_id)
    and (
      notification_type is null
      or not exists (
        select 1 from public.notification_preferences np
        where np.user_id = auth.uid()
          and np.notification_type = notifications.notification_type
          and np.enabled = false
      )
    )
  );
