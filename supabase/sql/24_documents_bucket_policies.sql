-- ============================================================
-- 24_documents_bucket_policies.sql
--
-- The `documents` storage bucket was created but never got RLS
-- policies on storage.objects, so EVERY upload (by anyone - admin,
-- owner, driver) has been silently rejected since the feature was
-- built ("upload failed"). Table-level RLS on public.documents is a
-- separate layer from bucket-level RLS on storage.objects — both are
-- required.
--
-- Path convention (see lib/documents.ts uploadDocument):
--   {companyId}/{ownerType}/{ownerId}/{timestamp}-{random}.{ext}
-- storage.foldername(name) splits that into an array of segments.
-- ============================================================

create policy "manage own company documents in storage"
  on storage.objects
  for all
  using (
    bucket_id = 'documents'
    and can_manage_company(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'documents'
    and can_manage_company(((storage.foldername(name))[1])::uuid)
  );

create policy "driver manages own documents in storage"
  on storage.objects
  for all
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[2] = 'driver'
    and (storage.foldername(name))[3] = auth.uid()::text
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[2] = 'driver'
    and (storage.foldername(name))[3] = auth.uid()::text
  );
