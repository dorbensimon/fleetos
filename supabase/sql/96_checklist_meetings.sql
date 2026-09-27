-- "רשימת סעיפים": forms a manager or safety officer fills in a meeting with a
-- driver (lib/checklistForms.ts, supabase/functions/checklist-meeting).
--
-- Deployment draft: apply only with production approval.
--
-- 1. A signing template can now be a checklist form. It keeps its items in
--    form_content and has no DocuSeal template of its own; each meeting
--    renders its own document. source_file_path still points at a blank PDF
--    of the form, used for its preview and its card.
-- 2. checklist_meetings: one row per meeting. It keeps its own copy of the
--    form, so editing the template later never changes a meeting already
--    held. Once the officer signs, the driver's side is an ordinary
--    signature_requests row (signature_request_id).
--
-- Managers read their company's meetings. Every write goes through the
-- checklist-meeting Edge Function, which checks the form, the answers and the
-- signing order; the table itself takes no writes from the app.

begin;

alter table public.signing_templates
  add column if not exists form_kind text not null default 'document',
  add column if not exists form_content jsonb;

alter table public.signing_templates drop constraint if exists signing_templates_form_kind_check;
alter table public.signing_templates add constraint signing_templates_form_kind_check
  check (form_kind in ('document', 'checklist'));

alter table public.signing_templates drop constraint if exists signing_templates_checklist_content_check;
alter table public.signing_templates add constraint signing_templates_checklist_content_check
  check (form_kind <> 'checklist' or (form_content is not null and jsonb_typeof(form_content -> 'items') = 'array'));

create table if not exists public.checklist_meetings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- The form survives its template: the meeting holds its own copy.
  template_id uuid references public.signing_templates(id) on delete set null,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null check (length(title) between 1 and 120),
  form jsonb not null check (jsonb_typeof(form -> 'items') = 'array'),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'signed', 'cancelled')),
  meeting_date date not null default ((now() at time zone 'Asia/Jerusalem')::date),
  officer_name text check (officer_name is null or length(officer_name) <= 80),
  signature_request_id uuid unique references public.signature_requests(id) on delete set null,
  signing_locked_until timestamptz,
  signed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checklist_meetings_signed_check check (status <> 'signed' or (signed_at is not null and officer_name is not null))
);

create index if not exists checklist_meetings_driver_idx
  on public.checklist_meetings(driver_id, created_at desc);
create index if not exists checklist_meetings_company_idx
  on public.checklist_meetings(company_id, meeting_date desc);
create index if not exists checklist_meetings_template_idx
  on public.checklist_meetings(template_id);
create index if not exists checklist_meetings_created_by_idx
  on public.checklist_meetings(created_by);
create index if not exists checklist_meetings_cancelled_by_idx
  on public.checklist_meetings(cancelled_by);

drop trigger if exists checklist_meetings_touch on public.checklist_meetings;
create trigger checklist_meetings_touch before update on public.checklist_meetings
  for each row execute function public.touch_updated_at();

-- A meeting belongs to one of the company's drivers, and to a template of the same company.
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
    or (old.status <> 'draft' and (new.form is distinct from old.form or new.answers is distinct from old.answers or new.officer_name is distinct from old.officer_name or new.meeting_date is distinct from old.meeting_date))
  ) then
    raise exception 'אי אפשר לשנות מפגש שכבר נחתם';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_checklist_meeting_integrity() from public, anon, authenticated;

drop trigger if exists checklist_meetings_integrity on public.checklist_meetings;
create trigger checklist_meetings_integrity before insert or update on public.checklist_meetings
  for each row execute function private.enforce_checklist_meeting_integrity();

alter table public.checklist_meetings enable row level security;

revoke all on public.checklist_meetings from anon, authenticated;
grant select on public.checklist_meetings to authenticated;
grant select, insert, update, delete on public.checklist_meetings to service_role;

drop policy if exists "managers read company meetings" on public.checklist_meetings;
create policy "managers read company meetings" on public.checklist_meetings
for select to authenticated
using (
  private.can_manage_company(company_id)
  and (private.current_role_name() = 'owner' or private.current_company_is_active())
);

commit;
