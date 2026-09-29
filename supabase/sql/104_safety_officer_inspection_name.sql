-- 104: the inspections are called "בדיקת קצין בטיחות" (Dor, 2026-09-28).
-- Only the reminder texts change; the function is otherwise the one from 103.
-- The app still tells a heads-up from an urgent reminder by "המועד בעוד" /
-- "מתקרבת" (lib/notificationLook.ts), which both texts keep.

begin;

create or replace function public.check_vehicle_safety_check_due()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  g record;
  message text;
begin
  create temporary table if not exists pg_temp.safety_check_due_run (
    company_id uuid, vehicle_id uuid, vehicle_label text, next_due date, first_inspection boolean, stage text
  ) on commit drop;
  truncate pg_temp.safety_check_due_run;

  insert into pg_temp.safety_check_due_run
  select p.company_id, p.vehicle_id,
         case when p.vehicle_label = '' then p.plate_number else p.vehicle_label || ' (' || p.plate_number || ')' end,
         p.next_due, p.first_inspection,
         case when p.next_due <= today then 'expired' else 'before' end
  from private.vehicle_inspection_plan(null) p
  join public.companies c on c.id = p.company_id
  where c.status = 'active'
    and p.next_due is not null
    and p.next_due <= today + coalesce((c.notification_lead_days ->> 'vehicle_safety_check_due')::integer, 7)
    and not exists (
      select 1 from public.notification_alert_log l
      where l.notification_type = 'vehicle_safety_check_due'
        and l.subject_id = p.vehicle_id
        and l.anchor_date = p.next_due
        and l.stage = case when p.next_due <= today then 'expired' else 'before' end
    );

  for g in
    select company_id, stage, count(*) as vehicles from pg_temp.safety_check_due_run group by company_id, stage
  loop
    if g.vehicles > 3 then
      message := case
        when g.stage = 'expired' then 'הגיע הזמן לבדיקת קצין בטיחות ב-' || g.vehicles || ' רכבים'
        else 'ב-' || g.vehicles || ' רכבים בדיקת קצין הבטיחות הבאה מתקרבת'
      end;
      insert into public.notifications (company_id, message, notification_type)
      values (g.company_id, message, 'vehicle_safety_check_due');
    else
      insert into public.notifications (company_id, message, notification_type, vehicle_id)
      select r.company_id,
             'בדיקת קצין בטיחות · ' || r.vehicle_label || ': ' || case
               when r.next_due < today then 'המועד עבר ב-' || to_char(r.next_due, 'DD/MM/YYYY')
               when r.next_due = today then 'המועד היום'
               else 'המועד בעוד ' || (r.next_due - today) || ' ימים (' || to_char(r.next_due, 'DD/MM/YYYY') || ')'
             end || case when r.first_inspection then ' · בדיקה ראשונה' else '' end,
             'vehicle_safety_check_due', r.vehicle_id
      from pg_temp.safety_check_due_run r
      where r.company_id = g.company_id and r.stage = g.stage;
    end if;
  end loop;

  insert into public.notification_alert_log (company_id, notification_type, subject_id, anchor_date, stage)
  select company_id, 'vehicle_safety_check_due', vehicle_id, next_due, stage from pg_temp.safety_check_due_run
  on conflict on constraint notification_alert_log_unique do nothing;
end;
$$;

revoke all on function public.check_vehicle_safety_check_due() from public, anon, authenticated;

commit;
