-- ============================================================
-- 21_company_report_branding.sql
--
-- Fields needed to brand the PDF driver reports with the company's
-- letterhead: address, switchboard phone, and the fleet safety
-- officer's name/mobile. All optional - reports render fine with
-- blanks for whatever hasn't been filled in yet.
-- ============================================================

alter table public.companies
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists safety_officer_name text,
  add column if not exists safety_officer_phone text;
