-- Reliability fixes for checklist meetings. Apply only with production approval.
-- Keeps a manager-set next date while a signed meeting is active, and stores the
-- officer's signature so the signed-meeting screen can render it after reload.

begin;

alter table public.checklist_meetings
  add column if not exists officer_signature text;

alter table public.checklist_schedule
  add column if not exists manual_next_due date;

-- Rows without a source meeting are existing manager-set overrides.
update public.checklist_schedule
set manual_next_due = next_due
where meeting_id is null and manual_next_due is null;

-- Signed meetings are immutable evidence, including the officer's signature.
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
    raise exception 'מפגש חייב להיות עם נהג של אותה חברה';
  end if;

  if new.template_id is not null and (tg_op = 'INSERT' or new.template_id is distinct from old.template_id) then
    select company_id into template_company_id from public.signing_templates where id = new.template_id;
    if template_company_id is distinct from new.company_id then
      raise exception 'מפגש חייב להשתמש בטופס של אותה חברה';
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
    raise exception 'אי אפשר לשנות מפגש שכבר נחתם';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_checklist_meeting_integrity() from public, anon, authenticated;

commit;
