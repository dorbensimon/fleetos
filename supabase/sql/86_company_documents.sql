-- ============================================================
-- 86_company_documents.sql
--
-- Allows the `documents` table to hold company-level files (not tied
-- to a specific driver or vehicle), for the new "מסמכי חברה" admin
-- screen. RLS on public.documents ("manage own company documents")
-- and the storage bucket policy (24_documents_bucket_policies.sql)
-- are already keyed on company_id / the storage path's companyId
-- segment, not owner_type, so no other policy changes are needed.
-- ============================================================

alter table public.documents drop constraint documents_owner_type_check;
alter table public.documents add constraint documents_owner_type_check
  check (owner_type in ('vehicle', 'driver', 'company'));
