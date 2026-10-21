-- 115: a vehicle's next safety inspection comes from the company settings only.
-- The next date is the last inspection plus the repeat interval; with no
-- interval set (repeat_months = 0) there is no next date. Dates a manager set
-- by hand are no longer offered in the app, so they are cleared and ignored.

create or replace function private.vehicle_inspection_plan(p_company_id uuid default null)
returns table (
  company_id uuid,
  vehicle_id uuid,
  vehicle_label text,
  plate_number text,
  last_inspection_id uuid,
  last_inspection date,
  last_defects integer,
  next_due date,
  first_inspection boolean
)
language sql
stable
security definer
set search_path to ''
as $$
  select v.company_id, v.id,
         trim(both ' ' from coalesce(v.manufacturer, '') || ' ' || coalesce(v.model, '')),
         v.plate_number,
         last.id, last.inspection_date, last.defect_count,
         case
           when coalesce(st.repeat_months, 1) = 0 then null
           when last.inspection_date is not null then (last.inspection_date + make_interval(months => coalesce(st.repeat_months, 1)))::date
           else greatest((v.created_at at time zone 'Asia/Jerusalem')::date,
                         (coalesce(st.created_at, c.created_at) at time zone 'Asia/Jerusalem')::date) + 14
         end,
         last.id is null
  from public.vehicles v
  join public.companies c on c.id = v.company_id
  left join public.vehicle_inspection_settings st on st.company_id = v.company_id
  left join lateral (
    select i.id, i.inspection_date, i.defect_count
    from public.vehicle_inspections i
    where i.vehicle_id = v.id and i.status in ('signed', 'closed')
    order by i.inspection_date desc, i.signed_at desc
    limit 1
  ) last on true
  where v.status not in ('archived', 'disabled')
    and (p_company_id is null or v.company_id = p_company_id);
$$;
revoke all on function private.vehicle_inspection_plan(uuid) from public, anon, authenticated;

-- Hand-set dates are forgotten; the plan above no longer reads the schedule.
update public.vehicle_inspection_schedule set manual_next_due = null where manual_next_due is not null;
