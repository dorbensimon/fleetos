-- ============================================================
-- 94_company_settings.sql
--
-- Columns behind the desktop "הגדרות החברה" screen. Admins never write
-- `companies` directly (RLS is owner-only); they go through the
-- update-company-settings Edge Function, which validates every field.
--
-- Also lets an admin upload their own company's logo and stamp into
-- `company-logos/<company_id>/...`. Root-level files stay owner-only.
-- ============================================================

alter table public.companies
  add column if not exists carrier_license_expiry date,
  add column if not exists mobile_phone text,
  add column if not exists fax text,
  add column if not exists email text,
  add column if not exists files_email text,
  add column if not exists files_email_2 text,
  add column if not exists odometer_report_email text,
  add column if not exists odometer_report_enabled boolean not null default false,
  add column if not exists contacts jsonb not null default '[]'::jsonb,
  add column if not exists safety_officer_2_name text,
  add column if not exists safety_officer_2_phone text,
  add column if not exists stamp_url text;

alter table public.companies
  drop constraint if exists companies_contacts_is_array;
alter table public.companies
  add constraint companies_contacts_is_array
  check (jsonb_typeof(contacts) = 'array' and jsonb_array_length(contacts) <= 2);

alter table public.companies
  drop constraint if exists companies_report_needs_email;
alter table public.companies
  add constraint companies_report_needs_email
  check (not odometer_report_enabled or odometer_report_email is not null);

-- Admin branding uploads, scoped to their own company folder.
drop policy if exists "admins upload own company branding" on storage.objects;
drop policy if exists "admins update own company branding" on storage.objects;
drop policy if exists "admins delete own company branding" on storage.objects;

create policy "admins upload own company branding"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'company-logos'
    and private.current_role_name() = 'admin'
    and private.current_company_is_active()
    and (storage.foldername(name))[1] = private.current_company_id()::text
  );

create policy "admins update own company branding"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'company-logos'
    and private.current_role_name() = 'admin'
    and (storage.foldername(name))[1] = private.current_company_id()::text
  )
  with check (
    bucket_id = 'company-logos'
    and private.current_role_name() = 'admin'
    and (storage.foldername(name))[1] = private.current_company_id()::text
  );

create policy "admins delete own company branding"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'company-logos'
    and private.current_role_name() = 'admin'
    and (storage.foldername(name))[1] = private.current_company_id()::text
  );
