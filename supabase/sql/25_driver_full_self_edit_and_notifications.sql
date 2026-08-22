-- ============================================================
-- 25_driver_full_self_edit_and_notifications.sql
--
-- Two things:
--
-- 1. Drivers can now self-edit driver_details too (previously
--    read-only there — only profiles.full_name/phone were
--    self-editable, per migration 22). Official fields (ת.ז, מספר
--    עובד, דרגת רישיון, תוקף רישיון, מחלקה) become self-service.
--
-- 2. A notifications table + trigger logs every driver self-edit
--    (on profiles OR driver_details) so admins/owner can see who
--    changed what, without restricting the driver from doing it.
-- ============================================================

create policy "driver updates own details"
  on public.driver_details
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_name  text,
  message     text not null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_company_idx on public.notifications(company_id, created_at desc);

alter table public.notifications enable row level security;

create policy "company managers see own notifications"
  on public.notifications
  for select
  using (can_manage_company(company_id));

create policy "company managers update own notifications"
  on public.notifications
  for update
  using (can_manage_company(company_id))
  with check (can_manage_company(company_id));

grant select, insert, update, delete on public.notifications to authenticated, service_role;

-- ------------------------------------------------------------
-- Trigger: logs a notification whenever a driver edits their own
-- profiles or driver_details row. Admin/owner edits of the same
-- rows are not logged here — this is specifically about drivers
-- updating themselves.
-- ------------------------------------------------------------

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
  -- `is distinct from` (not `<>`) so this bails out safely when there's
  -- no authenticated caller at all (e.g. a service_role update) instead
  -- of letting NULL comparisons silently fall through.
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

  insert into public.notifications (company_id, actor_id, actor_name, message)
  values (
    actor_company,
    auth.uid(),
    coalesce(actor_full_name, 'נהג'),
    coalesce(actor_full_name, 'נהג') || ' עדכן/ה: ' || array_to_string(changed, ', ')
  );

  return new;
end;
$$;

drop trigger if exists trg_log_driver_self_edit_profiles on public.profiles;
create trigger trg_log_driver_self_edit_profiles
  after update on public.profiles
  for each row
  execute function public.log_driver_self_edit();

drop trigger if exists trg_log_driver_self_edit_details on public.driver_details;
create trigger trg_log_driver_self_edit_details
  after update on public.driver_details
  for each row
  execute function public.log_driver_self_edit();
