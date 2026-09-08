-- Keep the two-step primary-driver change inside one database transaction.
-- The caller is still authorized from its JWT; SECURITY DEFINER is used only
-- so the coordinated updates can safely bypass row-by-row RLS checks.
create or replace function public.set_vehicle_primary_driver(
  p_vehicle_id uuid,
  p_assignment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  select v.company_id into v_company_id
  from public.vehicles v
  where v.id = p_vehicle_id;

  if v_company_id is null then
    raise exception 'הרכב לא נמצא';
  end if;

  if not private.can_manage_company(v_company_id) then
    raise exception 'אין הרשאה לעדכן את נהגי הרכב';
  end if;

  perform 1
  from public.vehicle_drivers vd
  where vd.id = p_assignment_id
    and vd.vehicle_id = p_vehicle_id
    and vd.company_id = v_company_id
    and vd.unassigned_at is null;

  if not found then
    raise exception 'שיוך הנהג הפעיל לא נמצא עבור רכב זה';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(hashtext(p_vehicle_id::text));

  update public.vehicle_drivers
  set is_primary = false
  where vehicle_id = p_vehicle_id
    and unassigned_at is null
    and is_primary
    and id <> p_assignment_id;

  update public.vehicle_drivers
  set is_primary = true
  where id = p_assignment_id
    and vehicle_id = p_vehicle_id
    and unassigned_at is null;
end;
$$;

revoke execute on function public.set_vehicle_primary_driver(uuid, uuid) from public, anon;
grant execute on function public.set_vehicle_primary_driver(uuid, uuid) to authenticated, service_role;

-- Synchronization must be single-flight per signing request. The webhook is
-- intentionally allowed to finish a request while a poll is in flight; all
-- poll writes below are conditional on the request remaining pending.
alter table public.signature_requests
  add column if not exists sync_locked_until timestamptz;

create index if not exists signature_requests_pending_sync_lock_idx
  on public.signature_requests(sync_locked_until)
  where status = 'pending' and sync_locked_until is not null;
