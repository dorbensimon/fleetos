-- Managers retain signed documents as legal evidence after archive/removal.
-- Signing-document archive is no longer a product feature for drivers: any
-- archived or explicitly removed document must disappear from every direct
-- Data API and Edge Function access path as well as from the app's lists.
begin;

drop policy if exists "read permitted signature requests" on public.signature_requests;
create policy "read permitted signature requests"
  on public.signature_requests for select to authenticated
  using (
    private.can_manage_company(company_id)
    or (
      driver_id = (select auth.uid())
      and private.current_company_is_active()
      and not private.current_driver_is_archived()
      and deleted_at is null
      and archived_at is null
    )
  );

-- A driver only needs template metadata for documents that are still visible
-- to that driver. Admins/owners retain the existing catalogue access.
drop policy if exists "read permitted signing templates" on public.signing_templates;
create policy "read permitted signing templates"
  on public.signing_templates for select to authenticated
  using (
    private.current_role_name() = 'owner'
    or private.can_manage_company(company_id)
    or (
      company_id is null
      and private.current_role_name() = 'admin'
      and private.current_company_is_active()
      and status = 'ready'
      and archived_at is null
    )
    or (
      private.current_company_is_active()
      and exists (
        select 1
        from public.signature_requests request
        where request.template_id = signing_templates.id
          and request.driver_id = (select auth.uid())
          and request.deleted_at is null
          and request.archived_at is null
      )
    )
  );

commit;
