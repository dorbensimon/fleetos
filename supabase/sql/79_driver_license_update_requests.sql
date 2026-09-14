-- Lets a driver scan/submit their own license update, without weakening the
-- lockout from 76_procedure_6_driver_write_lockout.sql (drivers still cannot
-- write license_number/license_expiry/license_classes on driver_details
-- directly). A driver's submission is staged here as 'pending' and only
-- takes effect on driver_details once a manager approves it. A manager's own
-- submission (via the same RPC) applies immediately — no approval needed for
-- their own writes, since can_manage_company() already gates those.

create table if not exists public.license_update_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  requested_license_number text not null,
  requested_license_expiry date not null,
  requested_license_classes text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists license_update_requests_company_idx on public.license_update_requests(company_id);
create index if not exists license_update_requests_driver_idx on public.license_update_requests(driver_id);
create index if not exists license_update_requests_pending_idx on public.license_update_requests(company_id, status) where status = 'pending';

alter table public.license_update_requests enable row level security;

-- Keep table access deliberately read-only for app users. The policy below
-- still limits rows to the driver's own requests or a manager's company.
grant select on public.license_update_requests to authenticated;

drop trigger if exists license_update_requests_touch on public.license_update_requests;
create trigger license_update_requests_touch before update on public.license_update_requests
  for each row execute function public.touch_updated_at();

-- A driver reads only their own requests; a manager reads their company's.
drop policy if exists "authenticated select access" on public.license_update_requests;
create policy "authenticated select access" on public.license_update_requests
for select to authenticated
using (
  private.can_manage_company(company_id)
  or driver_id = (select auth.uid())
);

-- No direct insert/update/delete — only the RPCs below (security definer)
-- write this table, so the pending/approved/rejected lifecycle can't be
-- forged or skipped by a modified client.
revoke insert, update, delete on public.license_update_requests from authenticated, anon;

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (
  notification_type is null or notification_type in (
    'driver_profile_update','driver_document_upload','vehicle_insurance_mandatory_expiry',
    'vehicle_insurance_comprehensive_expiry','vehicle_annual_test_expiry','vehicle_inspection_last_date_expiry',
    'vehicle_service_due','driver_document_renewal','signature_request_assigned','vehicle_assignment',
    'driver_profile_updated_by_manager','driver_odometer_update',
    'license_update_requested','license_update_reviewed'
  )
);

-- Submits a license update. A manager's submission applies immediately; a
-- driver's submission is staged as 'pending' until a manager reviews it.
create or replace function public.submit_license_update(
  p_driver_id uuid,
  p_license_number text,
  p_license_expiry date,
  p_license_classes text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  target_company uuid;
  caller_id uuid := (select auth.uid());
  request_id uuid;
begin
  if p_license_number is null or btrim(p_license_number) = '' then raise exception 'מספר רישיון חובה'; end if;
  if p_license_expiry is null then raise exception 'תאריך תוקף חובה'; end if;
  if p_license_classes is null or btrim(p_license_classes) = '' then raise exception 'דרגת רישיון חובה'; end if;

  select company_id into target_company from public.driver_details where id = p_driver_id;
  if target_company is null then raise exception 'נהג לא נמצא'; end if;

  select role into caller_role from public.profiles where id = caller_id;

  if private.can_manage_company(target_company) then
    update public.driver_details
      set license_number = p_license_number,
          license_expiry = p_license_expiry,
          license_classes = p_license_classes,
          updated_at = now()
      where id = p_driver_id;

    -- A manager's own edit supersedes any still-pending driver-submitted
    -- request, so it can't later be approved and overwrite this with stale
    -- data.
    update public.license_update_requests
      set status = 'rejected', reviewed_by = caller_id, reviewed_at = now()
      where driver_id = p_driver_id and status = 'pending';

    return jsonb_build_object('status', 'applied');
  end if;

  if caller_role = 'driver' and caller_id = p_driver_id then
    if private.current_driver_is_archived() then raise exception 'חשבון הנהג אינו פעיל'; end if;
    if not private.current_company_is_active() then raise exception 'החברה אינה פעילה'; end if;

    -- Re-scanning while a request is already pending updates it in place
    -- instead of stacking duplicate rows and re-notifying managers per scan.
    select id into request_id from public.license_update_requests
      where driver_id = p_driver_id and status = 'pending'
      order by created_at desc limit 1;

    if request_id is not null then
      update public.license_update_requests
        set requested_license_number = p_license_number,
            requested_license_expiry = p_license_expiry,
            requested_license_classes = p_license_classes
        where id = request_id;
      return jsonb_build_object('status', 'pending', 'request_id', request_id);
    end if;

    insert into public.license_update_requests(
      company_id, driver_id, requested_license_number, requested_license_expiry,
      requested_license_classes, submitted_by
    ) values (
      target_company, p_driver_id, p_license_number, p_license_expiry, p_license_classes, caller_id
    ) returning id into request_id;

    insert into public.notifications(company_id, actor_id, actor_name, message, notification_type)
    select target_company, p.id, p.full_name,
      coalesce(p.full_name, 'נהג') || ' שלח/ה עדכון רישיון נהיגה לאישור', 'license_update_requested'
    from public.profiles p where p.id = caller_id;

    return jsonb_build_object('status', 'pending', 'request_id', request_id);
  end if;

  raise exception 'אין הרשאה לעדכן רישיון עבור נהג זה';
end;
$$;

revoke all on function public.submit_license_update(uuid, text, date, text) from public, anon;
grant execute on function public.submit_license_update(uuid, text, date, text) to authenticated;

-- Approves or rejects a pending driver-submitted request. Only a manager of
-- the request's company may call this.
create or replace function public.review_license_update_request(
  p_request_id uuid,
  p_approve boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.license_update_requests;
  caller_id uuid := (select auth.uid());
begin
  select * into req from public.license_update_requests where id = p_request_id for update;
  if req.id is null then raise exception 'הבקשה לא נמצאה'; end if;
  if not private.can_manage_company(req.company_id) then raise exception 'אין הרשאה'; end if;
  if req.status <> 'pending' then raise exception 'הבקשה כבר טופלה'; end if;

  if p_approve then
    update public.driver_details
      set license_number = req.requested_license_number,
          license_expiry = req.requested_license_expiry,
          license_classes = req.requested_license_classes,
          updated_at = now()
      where id = req.driver_id;
  end if;

  update public.license_update_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        reviewed_by = caller_id,
        reviewed_at = now()
    where id = p_request_id;

  insert into public.notifications(company_id, actor_id, actor_name, recipient_id, message, notification_type)
  select req.company_id, p.id, p.full_name, req.driver_id,
    case when p_approve then 'עדכון הרישיון שלך אושר' else 'עדכון הרישיון שלך נדחה, פנה/י למנהל' end,
    'license_update_reviewed'
  from public.profiles p where p.id = caller_id;

  return jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end);
end;
$$;

revoke all on function public.review_license_update_request(uuid, boolean) from public, anon;
grant execute on function public.review_license_update_request(uuid, boolean) to authenticated;
