-- ============================================================
-- 64_driver_archive_and_permanent_deletion.sql
--
-- Turns "driver archive" into a real, two-stage lifecycle:
--
--   active  --archive-->  archived (no app access)  --delete-->  gone
--
-- Until now `driver_details.status = 'archived'` only hid the driver from
-- the fleet list — the account stayed fully usable. Permanent deletion, in
-- turn, removed the Auth user and let foreign keys cascade, which quietly
-- left behind the driver's uploaded documents, compliance items and the
-- files backing them, while destroying the "who drove this vehicle" audit
-- trail that the vehicle side still needs.
--
-- This migration adds:
--   1. archived_at / archived_by, so the archive screen can show when the
--      driver was archived and by whom.
--   2. A durable driver-name snapshot on vehicle_drivers, plus ON DELETE
--      SET NULL, so vehicle assignment history survives driver deletion.
--   3. actor_name on activity_logs, so the log stays readable after the
--      actor (or subject) is deleted, and an actor override the service
--      role can set when it acts on an admin's behalf.
--   4. delete_company_driver_records() — the atomic counterpart of
--      delete_company_vehicle_records(): one transaction that removes every
--      driver-owned row and hands the caller the storage paths to clean up.
--      It refuses to run on a driver that has not been archived first.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Archive metadata on driver_details
-- ------------------------------------------------------------

alter table public.driver_details
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

-- Rows archived before this migration have no timestamp of their own; the
-- last update is the closest honest approximation, and is better than an
-- empty column in the archive screen.
update public.driver_details
set archived_at = updated_at
where status = 'archived'
  and archived_at is null;

create index if not exists driver_details_company_archived_idx
  on public.driver_details(company_id, archived_at desc)
  where status = 'archived';


-- ------------------------------------------------------------
-- 2. Vehicle assignment history survives driver deletion
--
-- `vehicle_drivers` is the audit trail for "who drove this vehicle and
-- when" (rows are unassigned, never deleted). It pointed at the driver by
-- id only, so deleting the driver cascaded the history away with them.
-- A name snapshot + ON DELETE SET NULL keeps the row readable forever.
-- ------------------------------------------------------------

alter table public.vehicle_drivers
  add column if not exists driver_name text;

update public.vehicle_drivers assignment
set driver_name = driver.full_name
from public.profiles driver
where driver.id = assignment.driver_id
  and assignment.driver_name is null;

alter table public.vehicle_drivers
  alter column driver_id drop not null;

alter table public.vehicle_drivers
  drop constraint if exists vehicle_drivers_driver_id_fkey;

alter table public.vehicle_drivers
  add constraint vehicle_drivers_driver_id_fkey
  foreign key (driver_id) references public.profiles(id) on delete set null;

-- The rules trigger now has three new jobs: skip validation for a row the
-- foreign key just detached (driver_id became null), snapshot the driver's
-- name on the way in, and refuse to assign a driver who sits in the
-- archive — an archived driver has no app access and must not appear as
-- the active driver of a vehicle.
create or replace function public.enforce_vehicle_drivers_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle_company_id uuid;
  v_driver_company_id  uuid;
  v_driver_role        text;
  v_driver_name        text;
  v_driver_status      text;
  v_active_count       int;
  v_primary_exists     boolean;
  v_pair_exists        boolean;
begin
  -- ON DELETE SET NULL on driver_id fires this trigger as an UPDATE. The
  -- row is now pure history: there is no driver left to validate, and the
  -- name snapshot taken at assignment time is what keeps it readable.
  if new.driver_id is null then
    return new;
  end if;

  select company_id into v_vehicle_company_id
  from public.vehicles
  where id = new.vehicle_id;

  if v_vehicle_company_id is null then
    raise exception 'הרכב לא נמצא';
  end if;

  -- Always derived from the vehicle — never trusted from the client,
  -- same defense-in-depth pattern as 32's driver_details trigger.
  new.company_id := v_vehicle_company_id;

  select company_id, role, full_name
    into v_driver_company_id, v_driver_role, v_driver_name
  from public.profiles
  where id = new.driver_id;

  if v_driver_company_id is null then
    raise exception 'הנהג לא נמצא';
  end if;

  if v_driver_role is distinct from 'driver' then
    raise exception 'ניתן לשייך לרכב רק משתמש בתפקיד נהג';
  end if;

  if v_driver_company_id is distinct from v_vehicle_company_id then
    raise exception 'הנהג אינו שייך לאותה חברה כמו הרכב';
  end if;

  -- Snapshotted on every write so a later rename is picked up while the
  -- driver still exists, and the last known name survives their deletion.
  new.driver_name := v_driver_name;

  -- Only rows that are (becoming) active need the capacity/primary/
  -- duplicate checks — a row being unassigned only frees up capacity.
  if new.unassigned_at is null then
    select status into v_driver_status
    from public.driver_details
    where id = new.driver_id;

    if v_driver_status = 'archived' then
      raise exception 'לא ניתן לשייך לרכב נהג שנמצא בארכיון';
    end if;

    -- Serializes concurrent inserts/reactivations for the same vehicle
    -- so two simultaneous requests can't both pass the COUNT check
    -- below and jointly exceed the 2-driver cap. Released automatically
    -- at transaction end.
    perform pg_advisory_xact_lock(hashtext(new.vehicle_id::text));

    select count(*) into v_active_count
    from public.vehicle_drivers
    where vehicle_id = new.vehicle_id
      and unassigned_at is null
      and id is distinct from new.id;

    if v_active_count >= 2 then
      raise exception 'לא ניתן לשייך יותר משני נהגים לרכב אחד';
    end if;

    if new.is_primary then
      select exists (
        select 1 from public.vehicle_drivers
        where vehicle_id = new.vehicle_id
          and is_primary
          and unassigned_at is null
          and id is distinct from new.id
      ) into v_primary_exists;

      if v_primary_exists then
        raise exception 'לרכב זה כבר יש נהג ראשי פעיל — יש להסיר אותו לפני קביעת נהג ראשי חדש';
      end if;
    end if;

    select exists (
      select 1 from public.vehicle_drivers
      where vehicle_id = new.vehicle_id
        and driver_id = new.driver_id
        and unassigned_at is null
        and id is distinct from new.id
    ) into v_pair_exists;

    if v_pair_exists then
      raise exception 'הנהג כבר משויך לרכב זה';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_vehicle_drivers_rules() from public, anon, authenticated;


-- ------------------------------------------------------------
-- 3. The activity log keeps names after the people are gone
--
-- actor_id is "on delete set null", so deleting an admin used to erase
-- their name from every line they ever wrote. The name is snapshotted at
-- write time instead. `app.actor_id` lets a service-role RPC say who it is
-- acting for, since auth.uid() is null under the service role.
-- ------------------------------------------------------------

alter table public.activity_logs
  add column if not exists actor_name text;

update public.activity_logs log
set actor_name = actor.full_name
from public.profiles actor
where actor.id = log.actor_id
  and log.actor_name is null;

create or replace function private.log_company_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  company uuid;
  label text;
  kind text;
  action_name text;
  actor uuid;
  actor_label text;
begin
  company := (row_data->>'company_id')::uuid;
  if company is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  kind := case tg_table_name
    when 'departments' then 'department'
    when 'vehicles' then 'vehicle'
    when 'driver_details' then 'driver'
    when 'profiles' then 'profile'
    when 'documents' then 'document'
    when 'vehicle_drivers' then 'assignment'
    else 'compliance' end;

  label := case tg_table_name
    when 'departments' then row_data->>'name'
    when 'vehicles' then row_data->>'plate_number'
    when 'profiles' then row_data->>'full_name'
    when 'documents' then row_data->>'title'
    -- driver_details has no name of its own; it shares the profile's id.
    when 'driver_details' then (
      select person.full_name from public.profiles person
      where person.id = (row_data->>'id')::uuid
    )
    when 'vehicle_drivers' then row_data->>'driver_name'
    else null end;

  action_name := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;

  -- Under the service role auth.uid() is null, so an RPC acting on an
  -- admin's behalf announces that admin through a transaction-local
  -- setting rather than leaving the line unattributed.
  actor := coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);
  select person.full_name into actor_label from public.profiles person where person.id = actor;

  insert into public.activity_logs(company_id, actor_id, actor_name, action, entity_type, entity_id, entity_label)
  values (company, actor, actor_label, action_name, kind, (row_data->>'id')::uuid, label);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;


-- ------------------------------------------------------------
-- 4. Atomic permanent deletion of one driver
--
-- Mirrors delete_company_vehicle_records (51): every database row the
-- driver owns goes in a single transaction, and the caller gets back the
-- storage paths to delete afterwards. Storage cleanup running after the
-- transaction may at worst leave an unreachable orphan file; it can never
-- leave a live row pointing at a file that is already gone.
--
-- Deliberately NOT deleted here:
--   * signature_requests — they cascade with the Auth user, which the
--     caller deletes next. The signed copies stay in DocuSeal, which is
--     the system of record for signatures; the app simply stops showing
--     them. Our own cached PDFs are returned for deletion below.
--   * vehicle_drivers — kept as vehicle history (see section 2); the rows
--     are unassigned and their driver link is dropped instead.
-- ------------------------------------------------------------

-- `require_archived` is true for the normal, admin-facing path (delete from
-- the archive). The bulk "delete every driver in this company" action
-- (delete-company-drivers) passes false: it is its own explicitly confirmed,
-- company-wide operation and has no per-driver archive step to go through.
-- The tombstone survives the profile/Auth cascade. It makes the external Auth
-- and Storage steps resumable if one of them fails after the database cleanup
-- has committed, while keeping the storage paths out of client-visible tables.
create table if not exists public.driver_deletion_tombstones (
  driver_id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  driver_name text,
  storage_paths jsonb not null default '[]'::jsonb,
  database_cleaned_at timestamptz not null default now()
);

alter table public.driver_deletion_tombstones enable row level security;
revoke all on table public.driver_deletion_tombstones from public, anon, authenticated;
grant select, insert, update, delete on table public.driver_deletion_tombstones to service_role;

create or replace function public.delete_company_driver_records(
  target_driver_id uuid,
  target_company_id uuid,
  acting_admin_id uuid default null,
  require_archived boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_name text;
  v_driver_status text;
  v_storage_paths text[];
  v_tombstone public.driver_deletion_tombstones%rowtype;
begin
  -- Attribute everything this function triggers to the admin who asked
  -- for it, for the whole transaction.
  if acting_admin_id is not null then
    perform set_config('app.actor_id', acting_admin_id::text, true);
  end if;

  select * into v_tombstone
  from public.driver_deletion_tombstones
  where driver_id = target_driver_id
    and company_id = target_company_id;

  if found then
    return jsonb_build_object(
      'ok', true,
      'already_cleaned', true,
      'driver_name', v_tombstone.driver_name,
      'storage_paths', v_tombstone.storage_paths
    );
  end if;

  select person.full_name, details.status
    into v_driver_name, v_driver_status
  from public.profiles person
  join public.driver_details details on details.id = person.id
  where person.id = target_driver_id
    and person.company_id = target_company_id
    and details.company_id = target_company_id
    and person.role = 'driver';

  if v_driver_status is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Permanent deletion is only ever reachable through the archive. The UI
  -- enforces the two-step flow; this makes it true regardless of caller.
  if require_archived and v_driver_status <> 'archived' then
    return jsonb_build_object('ok', false, 'reason', 'not_archived');
  end if;

  select coalesce(array_agg(path), '{}'::text[])
  into v_storage_paths
  from (
    select document.file_path as path
    from public.documents document
    where document.company_id = target_company_id
      and document.owner_type = 'driver'
      and document.owner_id = target_driver_id
      and document.file_path is not null
    union
    select request.signed_file_path as path
    from public.signature_requests request
    where request.company_id = target_company_id
      and request.driver_id = target_driver_id
      and request.signed_file_path is not null
  ) paths;

  insert into public.driver_deletion_tombstones(driver_id, company_id, driver_name, storage_paths)
  values (target_driver_id, target_company_id, v_driver_name, to_jsonb(v_storage_paths));

  -- Vehicle history: close the assignment and keep the row. The name was
  -- snapshotted on write; refresh it here so the very last state is right
  -- even for rows written before this migration.
  update public.vehicle_drivers
  set driver_name = coalesce(driver_name, v_driver_name),
      unassigned_at = coalesce(unassigned_at, now())
  where driver_id = target_driver_id;

  delete from public.documents
  where company_id = target_company_id
    and owner_type = 'driver'
    and owner_id = target_driver_id;

  delete from public.compliance_items
  where company_id = target_company_id
    and owner_type = 'driver'
    and owner_id = target_driver_id;

  -- Deleted while the profile still exists, so the activity-log trigger
  -- can still resolve the driver's name for the log line.
  delete from public.driver_details
  where id = target_driver_id
    and company_id = target_company_id;

  return jsonb_build_object(
    'ok', true,
    'driver_name', v_driver_name,
    'storage_paths', to_jsonb(v_storage_paths)
  );
end;
$$;

revoke execute on function public.delete_company_driver_records(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.delete_company_driver_records(uuid, uuid, uuid, boolean) to service_role;


-- ------------------------------------------------------------
-- 5. Cutting off a live session immediately
--
-- Banning an Auth user stops future logins and token refreshes, but an
-- access token already in the driver's pocket stays signature-valid until
-- it expires. Dropping their Auth sessions revokes the refresh side at
-- once, so the app can never renew itself; the client-side archived check
-- (lib/CompanyContext.tsx) closes the remaining minutes.
-- ------------------------------------------------------------

create or replace function public.revoke_user_sessions(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.refresh_tokens where user_id = target_user_id::text;
  delete from auth.sessions where user_id = target_user_id;
end;
$$;

revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;


-- ------------------------------------------------------------
-- 6. Archive / restore as one transaction each
--
-- Archiving touches three tables (status, vehicle assignments, pending
-- reminders) and must not be able to half-succeed — a driver whose status
-- says "archived" while a vehicle still lists them as its active driver is
-- the worst of both states. Doing it in the database also lets the caller
-- pass `acting_admin_id`, so the activity log attributes the change to the
-- admin instead of leaving it unsigned under the service role.
--
-- Auth (ban / unban / session revocation) stays in the Edge Function: it
-- is an external API call and has no place inside a transaction.
-- ------------------------------------------------------------

create or replace function public.archive_company_driver_record(
  target_driver_id uuid,
  target_company_id uuid,
  acting_admin_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if acting_admin_id is not null then
    perform set_config('app.actor_id', acting_admin_id::text, true);
  end if;

  select details.status into v_status
  from public.driver_details details
  join public.profiles person on person.id = details.id
  where details.id = target_driver_id
    and details.company_id = target_company_id
    and person.company_id = target_company_id
    and person.role = 'driver';

  if v_status is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Archiving an already-archived driver is a no-op rather than an error:
  -- it must not overwrite who archived them, or when.
  if v_status = 'archived' then
    return jsonb_build_object('ok', true, 'already_archived', true);
  end if;

  update public.driver_details
  set status = 'archived',
      archived_at = now(),
      archived_by = acting_admin_id
  where id = target_driver_id
    and company_id = target_company_id;

  -- Rows are closed, never deleted: vehicle_drivers is the vehicle's
  -- "who drove this, and when" history.
  update public.vehicle_drivers
  set unassigned_at = now()
  where driver_id = target_driver_id
    and company_id = target_company_id
    and unassigned_at is null;

  -- Nothing should keep emailing a driver who can no longer open the app.
  update public.signature_requests
  set next_email_reminder_at = null,
      email_reminder_locked_until = null
  where driver_id = target_driver_id
    and company_id = target_company_id
    and status = 'pending';

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.archive_company_driver_record(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.archive_company_driver_record(uuid, uuid, uuid) to service_role;


create or replace function public.restore_company_driver_record(
  target_driver_id uuid,
  target_company_id uuid,
  acting_admin_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if acting_admin_id is not null then
    perform set_config('app.actor_id', acting_admin_id::text, true);
  end if;

  select details.status into v_status
  from public.driver_details details
  join public.profiles person on person.id = details.id
  where details.id = target_driver_id
    and details.company_id = target_company_id
    and person.company_id = target_company_id
    and person.role = 'driver';

  if v_status is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Vehicle assignments are deliberately not restored: they were closed on
  -- archive and are history now. Re-assigning is a separate, explicit act.
  update public.driver_details
  set status = 'active',
      archived_at = null,
      archived_by = null
  where id = target_driver_id
    and company_id = target_company_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.restore_company_driver_record(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.restore_company_driver_record(uuid, uuid, uuid) to service_role;
