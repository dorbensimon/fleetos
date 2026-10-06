-- 107 created the folder tables without table rights for the server role
-- (this project's default privileges give service_role none), so every
-- folder-catalog call failed with "טעינת התיקיות נכשלה". Writes still go only
-- through the service-role edge functions; authenticated keeps SELECT only.
grant select, insert, update, delete on public.folder_catalog, public.company_catalog_folders, public.signing_template_versions to service_role;
