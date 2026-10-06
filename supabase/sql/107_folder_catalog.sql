-- Folder catalog: folders the platform owner defines once, each company adds
-- the ones it wants to every driver's file, and creates the folder's form
-- from inside it (plans/folder_catalog_plan.md).
--
--   folder_catalog              the owner's folders (name, kind, defaults)
--   company_catalog_folders     which company added which folder (removed_at = removed)
--   signing_templates.catalog_folder_id
--                               the company's form for that folder; at most one
--                               per company and folder, ever (the row IS the folder)
--   signing_template_versions   earlier versions of a form ("replace form" updates
--                               the same row, so everything keyed by template_id
--                               - validity, renewals, schedule, reports, alerts -
--                               keeps working)
--   signature_requests.template_version
--                               the version a driver was sent
--
-- Every write goes through the server (Edge Functions, service role). The
-- browser only reads. The rules that matter live here, not only on screen.

begin;

-- ------------------------------------------------------------
-- 0. Helpers
-- ------------------------------------------------------------

-- Names that differ only in spaces or letter case are the same name
-- (company-signing-template's titleKey).
create or replace function private.title_key(value text)
returns text
language sql
immutable
set search_path to ''
as $$ select lower(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g')) $$;

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------

create table if not exists public.folder_catalog (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  kind text not null check (kind in ('document', 'checklist')),
  description text check (description is null or char_length(description) <= 300),
  sort_order integer not null default 0,
  default_valid_months smallint check (default_valid_months between 1 and 120),
  default_lead_days smallint not null default 30 check (default_lead_days between 1 and 90),
  default_repeat_months smallint check (default_repeat_months between 0 and 24),
  retired_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'document' or default_valid_months is null),
  check (kind = 'checklist' or default_repeat_months is null)
);

create unique index if not exists folder_catalog_title_key on public.folder_catalog (private.title_key(title));

create table if not exists public.company_catalog_folders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  catalog_id uuid not null references public.folder_catalog(id) on delete restrict,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.profiles(id) on delete set null,
  unique (company_id, catalog_id)
);

create index if not exists company_catalog_folders_catalog_idx on public.company_catalog_folders(catalog_id);

alter table public.signing_templates
  add column if not exists catalog_folder_id uuid references public.folder_catalog(id) on delete restrict,
  add column if not exists version integer not null default 1;

create unique index if not exists signing_templates_catalog_folder_key
  on public.signing_templates (company_id, catalog_folder_id)
  where catalog_folder_id is not null;

alter table public.signature_requests
  add column if not exists template_version integer;

create table if not exists public.signing_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.signing_templates(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  version integer not null,
  docuseal_template_id bigint,
  source_file_path text,
  source_file_name text,
  form_content jsonb,
  replaced_by uuid references public.profiles(id) on delete set null,
  replaced_at timestamptz not null default now(),
  unique (template_id, version)
);

create index if not exists signing_template_versions_company_idx on public.signing_template_versions(company_id);

-- ------------------------------------------------------------
-- 2. Access: read only from the browser
-- ------------------------------------------------------------

alter table public.folder_catalog enable row level security;
alter table public.company_catalog_folders enable row level security;
alter table public.signing_template_versions enable row level security;

revoke all on public.folder_catalog, public.company_catalog_folders, public.signing_template_versions from anon, authenticated;
grant select on public.folder_catalog, public.company_catalog_folders, public.signing_template_versions to authenticated;

drop policy if exists "managers read the folder catalog" on public.folder_catalog;
create policy "managers read the folder catalog" on public.folder_catalog
  for select to authenticated
  using (
    private.current_role_name() = 'owner'
    or (private.current_role_name() = 'admin' and private.current_company_is_active())
  );

drop policy if exists "managers read company catalog folders" on public.company_catalog_folders;
create policy "managers read company catalog folders" on public.company_catalog_folders
  for select to authenticated
  using ((select private.can_manage_company(company_id)));

drop policy if exists "managers read form versions" on public.signing_template_versions;
create policy "managers read form versions" on public.signing_template_versions
  for select to authenticated
  using ((select private.can_manage_company(company_id)));

-- Not reachable through the API, but no browser role should hold it.
revoke truncate on public.signing_templates, public.signature_requests, public.signing_template_rules from anon, authenticated;

-- ------------------------------------------------------------
-- 3. Integrity
-- ------------------------------------------------------------

-- A form linked to a folder: same kind, the folder's name, never unlinked,
-- active exactly while the company has the folder.
create or replace function private.enforce_catalog_template()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  folder public.folder_catalog%rowtype;
  added public.company_catalog_folders%rowtype;
begin
  if tg_op = 'UPDATE' and old.catalog_folder_id is not null
     and new.catalog_folder_id is distinct from old.catalog_folder_id then
    raise exception 'אי אפשר לנתק טופס מהתיקייה שלו';
  end if;
  if new.catalog_folder_id is null then
    return new;
  end if;
  if new.company_id is null then
    raise exception 'טופס של תיקייה חייב להיות של חברה';
  end if;

  select * into folder from public.folder_catalog where id = new.catalog_folder_id;
  if folder.kind is distinct from new.form_kind then
    raise exception 'סוג הטופס לא מתאים לתיקייה';
  end if;
  new.title := folder.title;

  select * into added from public.company_catalog_folders
  where company_id = new.company_id and catalog_id = new.catalog_folder_id
  for share;
  if not found then
    raise exception 'התיקייה לא נוספה לחברה';
  end if;

  -- Becoming active (created, linked or restored) needs the folder in place.
  if new.archived_at is null and added.removed_at is not null
     and (tg_op = 'INSERT' or old.archived_at is not null or old.catalog_folder_id is null) then
    raise exception 'התיקייה הוסרה מהחברה';
  end if;
  -- Archiving a folder's form is "remove the folder", nothing else.
  if tg_op = 'UPDATE' and new.archived_at is not null and old.archived_at is null and added.removed_at is null then
    raise exception 'כדי להעביר את הטופס לארכיון, הסירו את התיקייה';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_catalog_template() from public, anon, authenticated;

drop trigger if exists trg_enforce_catalog_template on public.signing_templates;
create trigger trg_enforce_catalog_template
  before insert or update of catalog_folder_id, title, form_kind, archived_at on public.signing_templates
  for each row execute function private.enforce_catalog_template();

create or replace function private.enforce_folder_catalog()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'אי אפשר לשנות את סוג התיקייה';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.enforce_folder_catalog() from public, anon, authenticated;

drop trigger if exists trg_enforce_folder_catalog on public.folder_catalog;
create trigger trg_enforce_folder_catalog
  before update on public.folder_catalog
  for each row execute function private.enforce_folder_catalog();

-- The source file of a form may change only through
-- replace_signing_template_version / restore_signing_template_version
-- (they set app.template_replace for that one row). Otherwise as before.
create or replace function private.enforce_signing_record_integrity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  template_company_id uuid;
  driver_company_id uuid;
  driver_role text;
  -- Global templates (company_id is null) store their source PDF under this
  -- reserved sentinel folder, since storage policies require a uuid-shaped
  -- first path segment. See import-docuseal-templates.
  global_sentinel uuid := '00000000-0000-0000-0000-000000000000';
begin
  if tg_table_name = 'signing_templates' then
    if new.source_file_path !~ ('^' || coalesce(new.company_id, global_sentinel)::text || '/signing-templates/[^/]+/[^/]+[.]pdf$') then
      raise exception 'נתיב קובץ המקור של התבנית אינו תקין';
    end if;
    if tg_op = 'UPDATE' and (
      new.company_id is distinct from old.company_id
      or new.created_by is distinct from old.created_by
      or (new.source_file_path is distinct from old.source_file_path
          and coalesce(current_setting('app.template_replace', true), '') <> new.id::text)
    ) then
      raise exception 'אין לשנות את הבעלות או קובץ המקור של תבנית חתימה';
    end if;
    return new;
  end if;

  if new.template_id is not null then
    select company_id into template_company_id
    from public.signing_templates
    where id = new.template_id;

    -- A global template (template_company_id is null) is shared by every
    -- company, so a request against it may belong to any company.
    if template_company_id is not null and template_company_id is distinct from new.company_id then
      raise exception 'בקשת חתימה חייבת להשתייך לתבנית מאותה חברה';
    end if;
  end if;

  select company_id, role into driver_company_id, driver_role
  from public.profiles
  where id = new.driver_id;

  if driver_company_id is distinct from new.company_id
     or driver_role is distinct from 'driver' then
    raise exception 'בקשת חתימה חייבת להשתייך לנהג מאותה חברה';
  end if;

  if new.signed_file_path is not null
     and new.signed_file_path <> format('%s/driver/%s/signed/%s.pdf', new.company_id, new.driver_id, new.id) then
    raise exception 'נתיב המסמך החתום אינו תקין';
  end if;

  if tg_op = 'UPDATE' and (
    new.company_id is distinct from old.company_id
    or new.driver_id is distinct from old.driver_id
    or new.created_by is distinct from old.created_by
    or (new.template_id is distinct from old.template_id and new.template_id is not null)
  ) then
    raise exception 'אין לשנות את הבעלות על בקשת חתימה';
  end if;

  return new;
end;
$function$;

-- ------------------------------------------------------------
-- 4. Server-only operations (each one transaction)
-- ------------------------------------------------------------

-- Add a folder to a company (or put it back). Returns the folder's form id,
-- or null when it has none yet. `link_template` turns an existing form of the
-- company into the folder's form.
create or replace function public.catalog_add_folder(
  target_company uuid, target_catalog uuid, actor uuid, link_template uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  folder public.folder_catalog%rowtype;
  existing public.company_catalog_folders%rowtype;
  current_form uuid;
  linked public.signing_templates%rowtype;
begin
  select * into folder from public.folder_catalog where id = target_catalog for share;
  if not found then
    raise exception 'התיקייה לא נמצאה';
  end if;

  select * into existing from public.company_catalog_folders
  where company_id = target_company and catalog_id = target_catalog
  for update;
  if not found and folder.retired_at is not null then
    raise exception 'התיקייה הוצאה משימוש';
  end if;

  insert into public.company_catalog_folders (company_id, catalog_id, added_by)
  values (target_company, target_catalog, actor)
  on conflict (company_id, catalog_id) do update
    set removed_at = null, removed_by = null, added_by = excluded.added_by, added_at = now()
    where public.company_catalog_folders.removed_at is not null;

  select id into current_form from public.signing_templates
  where company_id = target_company and catalog_folder_id = target_catalog
  for update;

  if current_form is not null then
    if link_template is not null and link_template <> current_form then
      raise exception 'לתיקייה כבר יש טופס';
    end if;
    update public.signing_templates
    set archived_at = null, archived_by = null
    where id = current_form and archived_at is not null;
    return current_form;
  end if;

  if link_template is null then
    return null;
  end if;

  select * into linked from public.signing_templates
  where id = link_template and company_id = target_company
  for update;
  if not found or linked.catalog_folder_id is not null or linked.archived_at is not null or linked.status <> 'ready' then
    raise exception 'אי אפשר לקשר את המסמך הזה';
  end if;
  if linked.form_kind <> folder.kind then
    raise exception 'סוג הטופס לא מתאים לתיקייה';
  end if;
  if exists (
    select 1 from public.signing_templates other
    where other.company_id = target_company and other.id <> link_template
      and other.status = 'ready' and other.archived_at is null
      and private.title_key(other.title) = private.title_key(folder.title)
  ) then
    raise exception 'יש מסמך אחר בשם של התיקייה';
  end if;

  update public.signing_templates set catalog_folder_id = target_catalog where id = link_template;
  return link_template;
end;
$$;

-- Remove a folder from a company. While drivers still wait to sign its form,
-- nothing changes and the count comes back (the server cancels them first).
-- Returns 0 once removed.
create or replace function public.catalog_remove_folder(target_company uuid, target_catalog uuid, actor uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  form_id uuid;
  waiting integer;
begin
  perform 1 from public.company_catalog_folders
  where company_id = target_company and catalog_id = target_catalog
  for update;
  if not found then
    raise exception 'התיקייה לא נוספה לחברה';
  end if;

  select id into form_id from public.signing_templates
  where company_id = target_company and catalog_folder_id = target_catalog
  for update;

  if form_id is not null then
    select count(*) into waiting from public.signature_requests
    where template_id = form_id and status = 'pending' and archived_at is null and deleted_at is null;
    if waiting > 0 then
      return waiting;
    end if;
  end if;

  update public.company_catalog_folders
  set removed_at = now(), removed_by = actor
  where company_id = target_company and catalog_id = target_catalog and removed_at is null;

  if form_id is not null then
    update public.signing_templates
    set archived_at = now(), archived_by = actor
    where id = form_id and archived_at is null;
  end if;
  return 0;
end;
$$;

-- "Replace form": the current version goes to the history and the same row
-- takes the new one. Returns the new version number, or null when someone
-- else replaced it first (expected_version is stale).
create or replace function public.replace_signing_template_version(
  target_template uuid, target_company uuid, expected_version integer,
  new_docuseal_template_id bigint, new_source_file_path text, new_source_file_name text,
  new_form_content jsonb, actor uuid
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
  if not found or current_row.catalog_folder_id is null then
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
    template_id, company_id, version, docuseal_template_id, source_file_path, source_file_name, form_content, replaced_by
  ) values (
    current_row.id, current_row.company_id, current_row.version, current_row.docuseal_template_id,
    current_row.source_file_path, current_row.source_file_name, current_row.form_content, actor
  );

  perform set_config('app.template_replace', target_template::text, true);
  update public.signing_templates
  set docuseal_template_id = case when form_kind = 'document' then new_docuseal_template_id else docuseal_template_id end,
      source_file_path = new_source_file_path,
      source_file_name = new_source_file_name,
      form_content = case when form_kind = 'checklist' then new_form_content else form_content end,
      status = 'ready',
      version = current_row.version + 1
  where id = target_template;
  perform set_config('app.template_replace', '', true);
  return current_row.version + 1;
end;
$$;

-- Bring back an earlier version: the same as a replace, with that version's
-- content (its DocuSeal template was never deleted). Returns the new version
-- number, or null when the form changed meanwhile.
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
    old_version.form_content, actor
  );
end;
$$;

-- Rename a catalog folder and every company's form in it. Blocked when a
-- company that has the folder already has another active document by that
-- name. Returns the DocuSeal ids to rename there too.
create or replace function public.catalog_rename(target_catalog uuid, new_title text)
returns table (docuseal_template_id bigint)
language plpgsql
security definer
set search_path to ''
as $$
declare
  clash text;
begin
  select company.name into clash
  from public.signing_templates t
  join public.company_catalog_folders f on f.company_id = t.company_id and f.catalog_id = target_catalog and f.removed_at is null
  join public.companies company on company.id = t.company_id
  where t.catalog_folder_id is distinct from target_catalog
    and t.status = 'ready' and t.archived_at is null
    and private.title_key(t.title) = private.title_key(new_title)
  limit 1;
  if clash is not null then
    raise exception 'לחברה "%" כבר יש מסמך בשם הזה', clash;
  end if;

  update public.folder_catalog set title = btrim(new_title) where id = target_catalog;
  if not found then
    raise exception 'התיקייה לא נמצאה';
  end if;
  update public.signing_templates set title = btrim(new_title) where catalog_folder_id = target_catalog;

  return query
    select t.docuseal_template_id from public.signing_templates t
    where t.catalog_folder_id = target_catalog and t.docuseal_template_id is not null;
end;
$$;

revoke all on function public.catalog_add_folder(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.catalog_remove_folder(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.replace_signing_template_version(uuid, uuid, integer, bigint, text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.restore_signing_template_version(uuid, uuid, integer, integer, uuid) from public, anon, authenticated;
revoke all on function public.catalog_rename(uuid, text) from public, anon, authenticated;
grant execute on function public.catalog_add_folder(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.catalog_remove_folder(uuid, uuid, uuid) to service_role;
grant execute on function public.replace_signing_template_version(uuid, uuid, integer, bigint, text, text, jsonb, uuid) to service_role;
grant execute on function public.restore_signing_template_version(uuid, uuid, integer, integer, uuid) to service_role;
grant execute on function public.catalog_rename(uuid, text) to service_role;

-- ------------------------------------------------------------
-- 5. Storage: a form's source files stay as they were
-- ------------------------------------------------------------

-- Is this draft folder already a form (or one of its versions)?
create or replace function private.signing_draft_in_use(company_text text, draft text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.signing_templates t
    where t.source_file_path like company_text || '/signing-templates/' || draft || '/%'
  ) or exists (
    select 1 from public.signing_template_versions v
    where v.source_file_path like company_text || '/signing-templates/' || draft || '/%'
  )
$$;

revoke all on function private.signing_draft_in_use(text, text) from public, anon;
grant execute on function private.signing_draft_in_use(text, text) to authenticated;

-- Managers keep writing anywhere they did before, except into a draft folder
-- that already became a form. Reading stays with
-- "company managers read documents in storage".
drop policy if exists "company managers manage non-evidence documents in storage" on storage.objects;
drop policy if exists "company managers upload non-evidence documents in storage" on storage.objects;
drop policy if exists "company managers update non-evidence documents in storage" on storage.objects;
drop policy if exists "company managers delete non-evidence documents in storage" on storage.objects;

create policy "company managers upload non-evidence documents in storage" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and private.can_manage_company(((storage.foldername(name))[1])::uuid)
    and coalesce((storage.foldername(name))[4], '') <> 'signed'
    and ((storage.foldername(name))[2] is distinct from 'signing-templates'
         or not private.signing_draft_in_use((storage.foldername(name))[1], (storage.foldername(name))[3]))
  );

create policy "company managers update non-evidence documents in storage" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and private.can_manage_company(((storage.foldername(name))[1])::uuid)
    and coalesce((storage.foldername(name))[4], '') <> 'signed'
    and ((storage.foldername(name))[2] is distinct from 'signing-templates'
         or not private.signing_draft_in_use((storage.foldername(name))[1], (storage.foldername(name))[3]))
  )
  with check (
    bucket_id = 'documents'
    and private.can_manage_company(((storage.foldername(name))[1])::uuid)
    and coalesce((storage.foldername(name))[4], '') <> 'signed'
    and ((storage.foldername(name))[2] is distinct from 'signing-templates'
         or not private.signing_draft_in_use((storage.foldername(name))[1], (storage.foldername(name))[3]))
  );

create policy "company managers delete non-evidence documents in storage" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and private.can_manage_company(((storage.foldername(name))[1])::uuid)
    and coalesce((storage.foldername(name))[4], '') <> 'signed'
    and ((storage.foldername(name))[2] is distinct from 'signing-templates'
         or not private.signing_draft_in_use((storage.foldername(name))[1], (storage.foldername(name))[3]))
  );

-- ------------------------------------------------------------
-- 6. Activity log
-- ------------------------------------------------------------

alter table public.activity_logs drop constraint if exists activity_logs_entity_type_check;
alter table public.activity_logs add constraint activity_logs_entity_type_check check (entity_type = any (array[
  'department', 'vehicle', 'driver', 'profile', 'compliance', 'document', 'assignment',
  'signing_template', 'signature_request', 'catalog_folder'
]));

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
    when 'company_catalog_folders' then 'catalog_folder'
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
    when 'company_catalog_folders' then (
      select folder.title from public.folder_catalog folder
      where folder.id = (row_data->>'catalog_id')::uuid
    )
    else null end;

  action_name := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;

  actor := coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);
  select person.full_name into actor_label from public.profiles person where person.id = actor;

  -- Vehicles: odometer, status (archive), department and primary driver are
  -- the changes an admin actually cares about seeing named explicitly.
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

  -- Driver details: archive/restore, department and license expiry.
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

  -- Profiles: the fields a driver's own card can change.
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
    if tg_op = 'INSERT' then
      detail := format('נוצר תבנית מסמך לחתימה: "%s"', label);
    elsif tg_op = 'UPDATE' and (old_data->>'archived_at') is null and (new_data->>'archived_at') is not null then
      detail := format('תבנית "%s" הועברה לארכיון', label);
    elsif tg_op = 'UPDATE' and (old_data->>'archived_at') is not null and (new_data->>'archived_at') is null then
      detail := format('הטופס "%s" חזר לשימוש', label);
    elsif tg_op = 'UPDATE' and (old_data->>'version') is distinct from (new_data->>'version') then
      detail := format('נוסח %s לטופס "%s"', new_data->>'version', label);
    elsif tg_op = 'UPDATE' and (old_data->>'catalog_folder_id') is null and (new_data->>'catalog_folder_id') is not null then
      detail := format('המסמך "%s" קושר לתיקייה', label);
    elsif tg_op = 'UPDATE' and (old_data->>'title') is distinct from (new_data->>'title') then
      detail := format('שם הטופס: %s ← %s', old_data->>'title', label);
    elsif tg_op = 'DELETE' then
      detail := format('תבנית "%s" נמחקה', label);
    end if;

  elsif tg_table_name = 'company_catalog_folders' then
    if tg_op = 'INSERT' then
      detail := format('נוספה התיקייה "%s" לתיק הנהג', label);
    elsif tg_op = 'UPDATE' and (old_data->>'removed_at') is null and (new_data->>'removed_at') is not null then
      detail := format('הוסרה התיקייה "%s" מתיק הנהג', label);
    elsif tg_op = 'UPDATE' and (old_data->>'removed_at') is not null and (new_data->>'removed_at') is null then
      detail := format('התיקייה "%s" נוספה שוב לתיק הנהג', label);
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

drop trigger if exists trg_activity_company_catalog_folders on public.company_catalog_folders;
create trigger trg_activity_company_catalog_folders
  after insert or update on public.company_catalog_folders
  for each row execute function private.log_company_activity();

commit;
