-- A notification about a task is marked read once the task is done, so the
-- red badge drops without anyone opening it.
--
--   signature_request_assigned  -> the request stops being pending
--                                  (signed, declined, cancelled, failed)
--   license_update_requested    -> the manager approved or rejected it
--   driver_meeting_due          -> a meeting with that driver on that form
--                                  was signed, or its date was moved
--   vehicle_*_expiry            -> the folder got a new, later expiry date
--   vehicle_service_due         -> the next service mileage moved forward
--
-- Notifications that only report something (a driver edited details, a
-- document was uploaded, the manager changed your file) are marked read by
-- the app when the user opens the place they talk about.
--
-- Ends with a one-time cleanup of notifications whose task is already done.

begin;

-- ------------------------------------------------------------
-- 1. Signing requests
-- ------------------------------------------------------------

create or replace function private.resolve_signature_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status is distinct from 'pending' then
    update public.notifications
       set read_at = now()
     where signature_request_id = new.id
       and read_at is null;
  end if;
  return new;
end;
$$;

revoke execute on function private.resolve_signature_notifications() from public, anon, authenticated;

drop trigger if exists trg_resolve_signature_notifications on public.signature_requests;
create trigger trg_resolve_signature_notifications
  after update of status on public.signature_requests
  for each row execute function private.resolve_signature_notifications();

-- ------------------------------------------------------------
-- 2. License update requests
-- ------------------------------------------------------------

create or replace function private.resolve_license_request_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status is distinct from 'pending' then
    update public.notifications
       set read_at = now()
     where notification_type = 'license_update_requested'
       and actor_id = new.driver_id
       and read_at is null;
  end if;
  return new;
end;
$$;

revoke execute on function private.resolve_license_request_notifications() from public, anon, authenticated;

drop trigger if exists trg_resolve_license_request_notifications on public.license_update_requests;
create trigger trg_resolve_license_request_notifications
  after update of status on public.license_update_requests
  for each row execute function private.resolve_license_request_notifications();

-- ------------------------------------------------------------
-- 3. Meetings that were due
-- ------------------------------------------------------------

create or replace function private.resolve_meeting_due_notifications(p_template_id uuid, p_driver_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
     set read_at = now()
   where notification_type = 'driver_meeting_due'
     and actor_id = p_driver_id
     and folder_key = p_template_id::text
     and read_at is null;
$$;

revoke execute on function private.resolve_meeting_due_notifications(uuid, uuid) from public, anon, authenticated;

create or replace function private.resolve_meeting_due_on_sign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'signed' and new.template_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'signed') then
    perform private.resolve_meeting_due_notifications(new.template_id, new.driver_id);
  end if;
  return new;
end;
$$;

revoke execute on function private.resolve_meeting_due_on_sign() from public, anon, authenticated;

drop trigger if exists trg_resolve_meeting_due_on_sign on public.checklist_meetings;
create trigger trg_resolve_meeting_due_on_sign
  after insert or update of status on public.checklist_meetings
  for each row execute function private.resolve_meeting_due_on_sign();

create or replace function private.resolve_meeting_due_on_move()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.next_due > old.next_due then
    perform private.resolve_meeting_due_notifications(new.template_id, new.driver_id);
  end if;
  return new;
end;
$$;

revoke execute on function private.resolve_meeting_due_on_move() from public, anon, authenticated;

drop trigger if exists trg_resolve_meeting_due_on_move on public.checklist_schedule;
create trigger trg_resolve_meeting_due_on_move
  after insert or update of next_due on public.checklist_schedule
  for each row execute function private.resolve_meeting_due_on_move();

-- ------------------------------------------------------------
-- 4. Vehicle folder expiry (the folders listed in 90)
-- ------------------------------------------------------------

create or replace function private.resolve_vehicle_expiry_notifications(p_vehicle_id uuid, p_folder_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
     set read_at = now()
   where vehicle_id = p_vehicle_id
     and folder_key = p_folder_key
     and notification_type like 'vehicle\_%\_expiry'
     and read_at is null;
$$;

revoke execute on function private.resolve_vehicle_expiry_notifications(uuid, text) from public, anon, authenticated;

create or replace function private.resolve_vehicle_expiry_on_compliance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_expiry date;
  old_expiry date;
begin
  if new.owner_type is distinct from 'vehicle' then
    return new;
  end if;
  new_expiry := case when new.item_type = 'annual_test' then coalesce(new.expiry_date, new.last_date + 365) else new.expiry_date end;
  if tg_op = 'UPDATE' then
    old_expiry := case when old.item_type = 'annual_test' then coalesce(old.expiry_date, old.last_date + 365) else old.expiry_date end;
  end if;
  if new_expiry is not null and new_expiry > current_date
     and (old_expiry is null or new_expiry > old_expiry) then
    perform private.resolve_vehicle_expiry_notifications(new.owner_id, new.item_type);
  end if;
  return new;
end;
$$;

revoke execute on function private.resolve_vehicle_expiry_on_compliance() from public, anon, authenticated;

drop trigger if exists trg_resolve_vehicle_expiry_on_compliance on public.compliance_items;
create trigger trg_resolve_vehicle_expiry_on_compliance
  after insert or update of expiry_date, last_date on public.compliance_items
  for each row execute function private.resolve_vehicle_expiry_on_compliance();

create or replace function private.resolve_vehicle_expiry_on_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_type = 'vehicle' and new.expiry_date is not null and new.expiry_date > current_date then
    perform private.resolve_vehicle_expiry_notifications(new.owner_id, new.category);
  end if;
  return new;
end;
$$;

revoke execute on function private.resolve_vehicle_expiry_on_document() from public, anon, authenticated;

drop trigger if exists trg_resolve_vehicle_expiry_on_document on public.documents;
create trigger trg_resolve_vehicle_expiry_on_document
  after insert or update of expiry_date on public.documents
  for each row execute function private.resolve_vehicle_expiry_on_document();

-- ------------------------------------------------------------
-- 5. Service due (these rows carry the plate in the message, not vehicle_id)
-- ------------------------------------------------------------

create or replace function private.resolve_service_due_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.next_service_km is not null
     and (old.next_service_km is null or new.next_service_km > old.next_service_km) then
    update public.notifications
       set read_at = now()
     where company_id = new.company_id
       and notification_type = 'vehicle_service_due'
       and (vehicle_id = new.id or (vehicle_id is null and position('(' || new.plate_number || ')' in message) > 0))
       and read_at is null;
  end if;
  return new;
end;
$$;

revoke execute on function private.resolve_service_due_notifications() from public, anon, authenticated;

drop trigger if exists trg_resolve_service_due_notifications on public.vehicles;
create trigger trg_resolve_service_due_notifications
  after update of next_service_km on public.vehicles
  for each row execute function private.resolve_service_due_notifications();

-- ------------------------------------------------------------
-- 6. One-time cleanup: tasks that are already done
-- ------------------------------------------------------------

-- Signing requests that are no longer pending.
update public.notifications n
   set read_at = now()
  from public.signature_requests r
 where n.signature_request_id = r.id
   and r.status <> 'pending'
   and n.read_at is null;

-- Older signing notifications saved without the request id: done when the
-- driver has nothing left to sign.
update public.notifications n
   set read_at = now()
 where n.notification_type = 'signature_request_assigned'
   and n.signature_request_id is null
   and n.read_at is null
   and n.recipient_id is not null
   and not exists (
     select 1 from public.signature_requests r
      where r.driver_id = n.recipient_id and r.status = 'pending'
   );

-- License requests already reviewed.
update public.notifications n
   set read_at = now()
 where n.notification_type = 'license_update_requested'
   and n.read_at is null
   and not exists (
     select 1 from public.license_update_requests r
      where r.driver_id = n.actor_id and r.status = 'pending'
   );

-- Meetings signed after the reminder was sent.
update public.notifications n
   set read_at = now()
 where n.notification_type = 'driver_meeting_due'
   and n.read_at is null
   and n.actor_id is not null
   and exists (
     select 1 from public.checklist_meetings m
      where m.driver_id = n.actor_id
        and m.template_id::text = n.folder_key
        and m.status = 'signed'
        and m.signed_at > n.created_at
   );

commit;
