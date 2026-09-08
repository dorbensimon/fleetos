-- Signed PDFs are evidence. Clients may read their own documents, but neither
-- drivers nor company managers may create, replace, or delete the signed path.
-- Trusted Edge Functions use the service role for that server-side work.
drop policy if exists "manage own company documents in storage" on storage.objects;
drop policy if exists "driver manages own documents in storage" on storage.objects;

create policy "company managers read documents in storage"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and private.can_manage_company(((storage.foldername(name))[1])::uuid)
  );

create policy "company managers manage non-evidence documents in storage"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'documents'
    and private.can_manage_company(((storage.foldername(name))[1])::uuid)
    and coalesce((storage.foldername(name))[4], '') <> 'signed'
  )
  with check (
    bucket_id = 'documents'
    and private.can_manage_company(((storage.foldername(name))[1])::uuid)
    and coalesce((storage.foldername(name))[4], '') <> 'signed'
  );

create policy "drivers read their own documents in storage"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and private.current_company_is_active()
    and not private.current_driver_is_archived()
    and (storage.foldername(name))[1] = private.current_company_id()::text
    and (storage.foldername(name))[2] = 'driver'
    and (storage.foldername(name))[3] = (select auth.uid())::text
  );

create policy "drivers manage their own non-evidence documents in storage"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'documents'
    and private.current_company_is_active()
    and not private.current_driver_is_archived()
    and (storage.foldername(name))[1] = private.current_company_id()::text
    and (storage.foldername(name))[2] = 'driver'
    and (storage.foldername(name))[3] = (select auth.uid())::text
    and coalesce((storage.foldername(name))[4], '') <> 'signed'
  )
  with check (
    bucket_id = 'documents'
    and private.current_company_is_active()
    and not private.current_driver_is_archived()
    and (storage.foldername(name))[1] = private.current_company_id()::text
    and (storage.foldername(name))[2] = 'driver'
    and (storage.foldername(name))[3] = (select auth.uid())::text
    and coalesce((storage.foldername(name))[4], '') <> 'signed'
  );

-- A short durable claim serializes provider provisioning. A timeout can then
-- be recovered with DocuSeal's external_id lookup without issuing a duplicate.
alter table public.signature_requests
  add column if not exists provisioning_locked_until timestamptz;

create index if not exists signature_requests_provisioning_lock_idx
  on public.signature_requests(provisioning_locked_until)
  where status = 'pending' and docuseal_submitter_id is null;
