-- 134_manager_company_folders.sql
--
-- A company's manager adds, renames and removes the company's own document
-- folders (112), from the company settings screen; until now only the owner
-- could. Same rule as reading: private.can_manage_company (the owner, or an
-- active manager of that company). A folder with files still can't be
-- removed (keep_document_folder_with_files).
--
-- Applied to production with Dor's approval on 2026-11-03.

begin;

drop policy if exists "owner writes company document folders" on public.company_document_folders;
drop policy if exists "managers write company document folders" on public.company_document_folders;
create policy "managers write company document folders"
  on public.company_document_folders for all to authenticated
  using (private.can_manage_company(company_id))
  with check (private.can_manage_company(company_id));

commit;
