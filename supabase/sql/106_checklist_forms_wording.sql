-- "רשימת סעיפים" forms are not only meetings (a training, a declaration...):
-- the reminders and the guard messages stop saying "מפגש".
--
-- Deployment draft: apply only with production approval, after 105.
--
-- Wording only. Both functions are copied from their current versions
-- (100_notification_lead_times.sql, 98_checklist_meeting_signing_fixes.sql);
-- the logic, the notification type and the sent-reminder ledger are untouched.
-- Each message still starts with the form's own name:
--   "הדרכת בטיחות: הגיע המועד אצל 5 נהגים"
--   "הדרכת בטיחות: ל-5 נהגים המועד בשבוע הקרוב"
--   "הדרכת בטיחות · אבי: המועד בעוד 7 ימים (10/10/2026) · פעם ראשונה"
-- lib/notificationLook.ts reads both the old and the new wording.

begin;

create or replace function public.check_checklist_meeting_due()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  today date := (now() at time zone 'Asia/Jerusalem')::date;
  g record;
  r record;
  message text;
begin
  create temporary table if not exists pg_temp.meeting_due_run (
    company_id uuid, template_id uuid, title text, driver_id uuid, driver_name text,
    next_due date, first_meeting boolean, stage text, lead_days integer
  ) on commit drop;
  truncate pg_temp.meeting_due_run;

  insert into pg_temp.meeting_due_run
  select p.company_id, p.template_id, p.title, p.driver_id, p.driver_name, p.next_due, p.first_meeting,
         case when p.next_due <= today then 'due' else 'before' end,
         coalesce((c.notification_lead_days ->> 'driver_meeting_due')::integer, 7)
  from private.checklist_meeting_plan(null) p
  join public.companies c on c.id = p.company_id
  where p.next_due <= today + coalesce((c.notification_lead_days ->> 'driver_meeting_due')::integer, 7)
    and c.status = 'active'
    and not exists (
      select 1 from public.checklist_due_alerts a
      where a.template_id = p.template_id
        and a.driver_id = p.driver_id
        and a.due_date = p.next_due
        and a.stage = case when p.next_due <= today then 'due' else 'before' end
    );

  for g in
    select company_id, template_id, min(title) as title, stage, count(*) as drivers, min(lead_days) as lead_days
    from pg_temp.meeting_due_run
    group by company_id, template_id, stage
  loop
    if g.drivers > 3 then
      message := g.title || ': ' || case
        when g.stage = 'due' then 'הגיע המועד אצל ' || g.drivers || ' נהגים'
        when g.lead_days = 7 then 'ל-' || g.drivers || ' נהגים המועד בשבוע הקרוב'
        else 'ל-' || g.drivers || ' נהגים המועד ב-' || g.lead_days || ' הימים הקרובים'
      end;
      insert into public.notifications (company_id, message, notification_type, folder_key)
      values (g.company_id, message, 'driver_meeting_due', g.template_id::text);
    else
      for r in
        select * from pg_temp.meeting_due_run
        where company_id = g.company_id and template_id = g.template_id and stage = g.stage
      loop
        message := r.title || ' · ' || r.driver_name || ': ' || case
          when r.next_due < today then 'המועד עבר ב-' || to_char(r.next_due, 'DD/MM/YYYY')
          when r.next_due = today then 'המועד היום'
          else 'המועד בעוד ' || (r.next_due - today) || ' ימים (' || to_char(r.next_due, 'DD/MM/YYYY') || ')'
        end || case when r.first_meeting then ' · פעם ראשונה' else '' end;
        insert into public.notifications (company_id, actor_id, actor_name, message, notification_type, folder_key)
        values (r.company_id, r.driver_id, r.driver_name, message, 'driver_meeting_due', r.template_id::text);
      end loop;
    end if;
  end loop;

  insert into public.checklist_due_alerts (company_id, template_id, driver_id, due_date, stage)
  select company_id, template_id, driver_id, next_due, stage from pg_temp.meeting_due_run
  on conflict on constraint checklist_due_alerts_unique do nothing;
end;
$$;

revoke all on function public.check_checklist_meeting_due() from public, anon, authenticated;

create or replace function private.enforce_checklist_meeting_integrity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  driver_company_id uuid;
  driver_role text;
  template_company_id uuid;
begin
  select company_id, role into driver_company_id, driver_role
  from public.profiles where id = new.driver_id;
  if driver_company_id is distinct from new.company_id or driver_role is distinct from 'driver' then
    raise exception 'אפשר למלא טופס רק עם נהג של אותה חברה';
  end if;

  if new.template_id is not null and (tg_op = 'INSERT' or new.template_id is distinct from old.template_id) then
    select company_id into template_company_id from public.signing_templates where id = new.template_id;
    if template_company_id is distinct from new.company_id then
      raise exception 'הטופס חייב להיות של אותה חברה';
    end if;
  end if;

  if tg_op = 'UPDATE' and (
    new.company_id is distinct from old.company_id
    or new.driver_id is distinct from old.driver_id
    or new.created_by is distinct from old.created_by
    or (old.status <> 'draft' and (
      new.form is distinct from old.form
      or new.answers is distinct from old.answers
      or new.officer_name is distinct from old.officer_name
      or new.officer_signature is distinct from old.officer_signature
      or new.meeting_date is distinct from old.meeting_date
    ))
  ) then
    raise exception 'אי אפשר לשנות טופס שכבר נחתם';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_checklist_meeting_integrity() from public, anon, authenticated;

commit;
