-- Form templates replace the folder catalog (2026-10-07).
--
-- Every form a company sends is the company's own; each one is a folder in
-- every driver's file. The platform owner only offers ready templates a
-- company may start from: picking one copies its content into the company's
-- new form, which the company edits and saves as its own. Later changes to
-- the template never touch that copy.
--
--   form_templates                       the owner's templates (read by managers, written by the form-templates function)
--   signing_templates.source_template_id the template a form was started from (statistics only)
--   signing_templates.editor_content     a document written in the editor, as blocks + fields,
--                                        so a new version opens with the current text
--   signing_template_versions.editor_content
--
-- Every company form may now get a new version ("replace form") with its
-- history, not only a catalog folder's form.
--
-- The catalog (107/108) is removed: its forms stay as ordinary company forms
-- (nothing signed is lost), its folders, tables and functions go.

begin;

-- ------------------------------------------------------------
-- 1. The owner's templates
-- ------------------------------------------------------------

create table if not exists public.form_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  kind text not null check (kind in ('document', 'checklist')),
  description text check (description is null or char_length(description) <= 300),
  -- document: { blocks, fields } as the editor sends them; checklist: the form.
  -- Checked by the form-templates function before it is stored.
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 524288),
  sort_order integer not null default 0,
  -- Hidden from companies; forms already made from it stay as they are.
  hidden_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists form_templates_title_key on public.form_templates (private.title_key(title));

create or replace function private.enforce_form_template()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'אי אפשר לשנות את סוג השבלונה';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.enforce_form_template() from public, anon, authenticated;

drop trigger if exists trg_enforce_form_template on public.form_templates;
create trigger trg_enforce_form_template
  before update on public.form_templates
  for each row execute function private.enforce_form_template();

alter table public.form_templates enable row level security;

-- Read only from the browser; every write goes through the form-templates
-- function (service role), which checks the content.
revoke all on public.form_templates from anon, authenticated;
grant select on public.form_templates to authenticated;
-- This project's default privileges give the server role nothing (see 108).
grant select, insert, update, delete on public.form_templates to service_role;

drop policy if exists "owner and managers read form templates" on public.form_templates;
create policy "owner and managers read form templates" on public.form_templates
  for select to authenticated
  using (
    private.current_role_name() = 'owner'
    or (
      private.current_role_name() = 'admin'
      and private.current_company_is_active()
      and hidden_at is null
    )
  );

alter table public.signing_templates
  add column if not exists source_template_id uuid references public.form_templates(id) on delete set null,
  add column if not exists editor_content jsonb check (editor_content is null or jsonb_typeof(editor_content) = 'object');

create index if not exists signing_templates_source_template_idx
  on public.signing_templates (source_template_id)
  where source_template_id is not null;

alter table public.signing_template_versions
  add column if not exists editor_content jsonb;

-- ------------------------------------------------------------
-- 2. The catalog goes; its forms stay as company forms
-- ------------------------------------------------------------

drop trigger if exists trg_enforce_catalog_template on public.signing_templates;
drop trigger if exists trg_activity_company_catalog_folders on public.company_catalog_folders;

drop function if exists public.catalog_add_folder(uuid, uuid, uuid, uuid);
drop function if exists public.catalog_remove_folder(uuid, uuid, uuid);
drop function if exists public.catalog_rename(uuid, text);
drop function if exists private.enforce_catalog_template();

-- Drops the one-form-per-folder index with it. The rows keep every other
-- value: name, kind, versions, rules, requests and signatures.
alter table public.signing_templates drop column if exists catalog_folder_id;

drop table if exists public.company_catalog_folders;
drop table if exists public.folder_catalog;
drop function if exists private.enforce_folder_catalog();

-- ------------------------------------------------------------
-- 3. New versions for every company form
-- ------------------------------------------------------------

drop function if exists public.restore_signing_template_version(uuid, uuid, integer, integer, uuid);
drop function if exists public.replace_signing_template_version(uuid, uuid, integer, bigint, text, text, jsonb, uuid);

-- "Replace form": the current version goes to the history and the same row
-- takes the new one, so everything keyed by template_id (validity, renewals,
-- schedule, reports, alerts) keeps working. Returns the new version number,
-- or null when someone else replaced it first (expected_version is stale).
create or replace function public.replace_signing_template_version(
  target_template uuid, target_company uuid, expected_version integer,
  new_docuseal_template_id bigint, new_source_file_path text, new_source_file_name text,
  new_form_content jsonb, new_editor_content jsonb, actor uuid
)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  current_row public.signing_templates%rowtype;
begin
  select * into current_row from public.signing_templates
  where id = target_template and company_id = target_company
  for update;
  if not found or current_row.archived_at is not null or current_row.status <> 'ready' then
    raise exception 'הטופס לא נמצא';
  end if;
  if current_row.version <> expected_version then
    return null;
  end if;
  if current_row.form_kind = 'document' and new_docuseal_template_id is null then
    raise exception 'חסר מסמך חדש';
  end if;
  if current_row.form_kind = 'checklist' and (new_form_content is null or jsonb_typeof(new_form_content -> 'items') <> 'array') then
    raise exception 'הסעיפים בטופס אינם תקינים';
  end if;

  insert into public.signing_template_versions (
    template_id, company_id, version, docuseal_template_id, source_file_path, source_file_name, form_content, editor_content, replaced_by
  ) values (
    current_row.id, current_row.company_id, current_row.version, current_row.docuseal_template_id,
    current_row.source_file_path, current_row.source_file_name, current_row.form_content, current_row.editor_content, actor
  );

  perform set_config('app.template_replace', target_template::text, true);
  update public.signing_templates
  set docuseal_template_id = case when form_kind = 'document' then new_docuseal_template_id else docuseal_template_id end,
      source_file_path = new_source_file_path,
      source_file_name = new_source_file_name,
      form_content = case when form_kind = 'checklist' then new_form_content else form_content end,
      editor_content = case when form_kind = 'document' then new_editor_content else null end,
      status = 'ready',
      version = current_row.version + 1
  where id = target_template;
  perform set_config('app.template_replace', '', true);
  return current_row.version + 1;
end;
$$;

-- Bring back an earlier version: a replace with that version's content (its
-- DocuSeal template was never deleted). Returns the new version number, or
-- null when the form changed meanwhile.
create or replace function public.restore_signing_template_version(
  target_template uuid, target_company uuid, version_number integer, expected_version integer, actor uuid
)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  old_version public.signing_template_versions%rowtype;
begin
  select * into old_version from public.signing_template_versions
  where template_id = target_template and company_id = target_company and version = version_number;
  if not found then
    raise exception 'הנוסח לא נמצא';
  end if;
  return public.replace_signing_template_version(
    target_template, target_company, expected_version,
    old_version.docuseal_template_id, old_version.source_file_path, old_version.source_file_name,
    old_version.form_content, old_version.editor_content, actor
  );
end;
$$;

revoke all on function public.replace_signing_template_version(uuid, uuid, integer, bigint, text, text, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.restore_signing_template_version(uuid, uuid, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.replace_signing_template_version(uuid, uuid, integer, bigint, text, text, jsonb, jsonb, uuid) to service_role;
grant execute on function public.restore_signing_template_version(uuid, uuid, integer, integer, uuid) to service_role;

-- ------------------------------------------------------------
-- 4. Activity log: no catalog; a form started from a template says so
-- ------------------------------------------------------------

create or replace function private.log_company_activity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_data jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_data jsonb := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end;
  company uuid;
  label text;
  kind text;
  action_name text;
  actor uuid;
  actor_label text;
  changes text[] := array[]::text[];
  detail text;
  old_dept text;
  new_dept text;
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
    when 'signing_templates' then 'signing_template'
    when 'signature_requests' then 'signature_request'
    else 'compliance' end;

  label := case tg_table_name
    when 'departments' then row_data->>'name'
    when 'vehicles' then row_data->>'plate_number'
    when 'profiles' then row_data->>'full_name'
    when 'documents' then row_data->>'title'
    when 'driver_details' then (
      select person.full_name from public.profiles person
      where person.id = (row_data->>'id')::uuid
    )
    when 'vehicle_drivers' then row_data->>'driver_name'
    when 'signing_templates' then row_data->>'title'
    when 'signature_requests' then (
      select driver.full_name from public.profiles driver
      where driver.id = (row_data->>'driver_id')::uuid
    )
    else null end;

  action_name := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;

  actor := coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);
  select person.full_name into actor_label from public.profiles person where person.id = actor;

  if tg_table_name = 'vehicles' then
    if tg_op = 'UPDATE' then
      if (old_data->>'odometer') is distinct from (new_data->>'odometer') then
        changes := changes || format('קילומטר ברכב %s: %s ← %s', new_data->>'plate_number', old_data->>'odometer', new_data->>'odometer');
      end if;
      if (old_data->>'status') is distinct from (new_data->>'status') then
        changes := changes || case
          when new_data->>'status' = 'archived' then format('רכב %s הועבר לארכיון', new_data->>'plate_number')
          when old_data->>'status' = 'archived' then format('רכב %s שוחזר מהארכיון', new_data->>'plate_number')
          else format('סטטוס רכב %s: %s ← %s', new_data->>'plate_number', old_data->>'status', new_data->>'status')
        end;
      end if;
      if (old_data->>'department_id') is distinct from (new_data->>'department_id') then
        select name into old_dept from public.departments where id = (old_data->>'department_id')::uuid;
        select name into new_dept from public.departments where id = (new_data->>'department_id')::uuid;
        changes := changes || format('מחלקת רכב %s: %s ← %s', new_data->>'plate_number', coalesce(old_dept, 'ללא'), coalesce(new_dept, 'ללא'));
      end if;
      if (old_data->>'primary_driver_id') is distinct from (new_data->>'primary_driver_id') then
        changes := changes || format('נהג ראשי ברכב %s עודכן', new_data->>'plate_number');
      end if;
      if (old_data->>'plate_number') is distinct from (new_data->>'plate_number') then
        changes := changes || format('מספר רישוי: %s ← %s', old_data->>'plate_number', new_data->>'plate_number');
      end if;
    elsif tg_op = 'DELETE' then
      detail := format('רכב %s נמחק לצמיתות', old_data->>'plate_number');
    end if;

  elsif tg_table_name = 'driver_details' then
    if tg_op = 'UPDATE' then
      if (old_data->>'status') is distinct from (new_data->>'status') then
        changes := changes || case
          when new_data->>'status' = 'archived' then format('תיק הנהג %s הועבר לארכיון', label)
          else format('תיק הנהג %s שוחזר מהארכיון', label)
        end;
      end if;
      if (old_data->>'department_id') is distinct from (new_data->>'department_id') then
        select name into old_dept from public.departments where id = (old_data->>'department_id')::uuid;
        select name into new_dept from public.departments where id = (new_data->>'department_id')::uuid;
        changes := changes || format('מחלקת %s: %s ← %s', label, coalesce(old_dept, 'ללא'), coalesce(new_dept, 'ללא'));
      end if;
      if (old_data->>'license_expiry') is distinct from (new_data->>'license_expiry') then
        changes := changes || format('תוקף רישיון %s: %s ← %s', label, old_data->>'license_expiry', new_data->>'license_expiry');
      end if;
    elsif tg_op = 'DELETE' then
      detail := format('תיק הנהג %s נמחק לצמיתות', label);
    end if;

  elsif tg_table_name = 'profiles' then
    if tg_op = 'UPDATE' then
      if (old_data->>'full_name') is distinct from (new_data->>'full_name') then
        changes := changes || format('שם: %s ← %s', old_data->>'full_name', new_data->>'full_name');
      end if;
      if (old_data->>'phone') is distinct from (new_data->>'phone') then
        changes := changes || format('טלפון של %s עודכן', new_data->>'full_name');
      end if;
      if (old_data->>'role') is distinct from (new_data->>'role') then
        changes := changes || format('תפקיד %s: %s ← %s', new_data->>'full_name', old_data->>'role', new_data->>'role');
      end if;
    end if;

  elsif tg_table_name = 'departments' then
    detail := case tg_op
      when 'INSERT' then format('נוצרה מחלקה: %s', label)
      when 'DELETE' then format('מחלקה הוסרה: %s', label)
      else format('מחלקה שונתה: %s', label) end;

  elsif tg_table_name = 'documents' then
    detail := case tg_op
      when 'INSERT' then format('הועלה מסמך "%s"', label)
      when 'DELETE' then format('מסמך "%s" נמחק', label)
      else format('מסמך "%s" עודכן', label) end;

  elsif tg_table_name = 'vehicle_drivers' then
    if tg_op = 'INSERT' then
      detail := format('%s שוייך לרכב %s', label, (select plate_number from public.vehicles where id = (new_data->>'vehicle_id')::uuid));
    elsif tg_op = 'UPDATE' and (old_data->>'unassigned_at') is null and (new_data->>'unassigned_at') is not null then
      detail := format('שיוך %s לרכב %s בוטל', label, (select plate_number from public.vehicles where id = (new_data->>'vehicle_id')::uuid));
    elsif tg_op = 'UPDATE' and (old_data->>'is_primary') is distinct from (new_data->>'is_primary') and (new_data->>'is_primary')::boolean then
      detail := format('%s הוגדר כנהג ראשי ברכב %s', label, (select plate_number from public.vehicles where id = (new_data->>'vehicle_id')::uuid));
    end if;

  elsif tg_table_name = 'signing_templates' then
    if tg_op = 'INSERT' and (new_data->>'source_template_id') is not null then
      detail := format('נוצר טופס "%s" משבלונה מוכנה', label);
    elsif tg_op = 'INSERT' then
      detail := format('נוצר תבנית מסמך לחתימה: "%s"', label);
    elsif tg_op = 'UPDATE' and (old_data->>'archived_at') is null and (new_data->>'archived_at') is not null then
      detail := format('תבנית "%s" הועברה לארכיון', label);
    elsif tg_op = 'UPDATE' and (old_data->>'archived_at') is not null and (new_data->>'archived_at') is null then
      detail := format('הטופס "%s" חזר לשימוש', label);
    elsif tg_op = 'UPDATE' and (old_data->>'version') is distinct from (new_data->>'version') then
      detail := format('נוסח %s לטופס "%s"', new_data->>'version', label);
    elsif tg_op = 'UPDATE' and (old_data->>'title') is distinct from (new_data->>'title') then
      detail := format('שם הטופס: %s ← %s', old_data->>'title', label);
    elsif tg_op = 'DELETE' then
      detail := format('תבנית "%s" נמחקה', label);
    end if;

  elsif tg_table_name = 'signature_requests' then
    if tg_op = 'INSERT' then
      detail := format('נשלח מסמך "%s" לחתימת %s', label, (select full_name from public.profiles where id = (new_data->>'driver_id')::uuid));
    elsif tg_op = 'UPDATE' then
      if (old_data->>'status') is distinct from (new_data->>'status') then
        changes := changes || case new_data->>'status'
          when 'completed' then format('%s חתם על "%s"', label, (select title from public.signing_templates where id = (new_data->>'template_id')::uuid))
          when 'declined' then format('%s דחה את החתימה על "%s"', label, (select title from public.signing_templates where id = (new_data->>'template_id')::uuid))
          when 'cancelled' then format('בקשת החתימה של %s בוטלה', label)
          when 'failed' then format('שליחת המסמך ל-%s נכשלה', label)
          else format('סטטוס חתימה של %s: %s ← %s', label, old_data->>'status', new_data->>'status')
        end;
      end if;
      if (old_data->>'archived_at') is null and (new_data->>'archived_at') is not null then
        changes := changes || format('בקשת החתימה של %s הועברה לארכיון', label);
      end if;
    end if;
  end if;

  if detail is null and array_length(changes, 1) > 0 then
    detail := array_to_string(changes, '; ');
  end if;

  -- No detected field-level change on an UPDATE (e.g. an unrelated column
  -- touched by another trigger) still gets a generic line, never silence.
  if detail is null then
    detail := case action_name
      when 'created' then format('%s נוצר', coalesce(label, kind))
      when 'deleted' then format('%s נמחק', coalesce(label, kind))
      else format('%s עודכן', coalesce(label, kind)) end;
  end if;

  insert into public.activity_logs(company_id, actor_id, actor_name, action, entity_type, entity_id, entity_label, details)
  values (company, actor, actor_label, action_name, kind, (row_data->>'id')::uuid, label, detail);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $function$;

commit;
