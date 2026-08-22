-- ============================================================
-- 20_company_business_details.sql
--
-- Adds the business-registration fields to `companies`, shown on the
-- owner's company-creation form. Both are optional — plenty of
-- companies won't have them on hand at signup time.
-- ============================================================

alter table public.companies
  add column if not exists company_type text check (company_type in ('בע״מ', 'עוסק מורשה')),
  add column if not exists business_id text;
