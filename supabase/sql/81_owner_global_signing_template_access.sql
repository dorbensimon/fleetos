-- The platform owner manages global DocuSeal templates, even though an owner
-- does not belong to a tenant company. Migration 80 accidentally restricted
-- global-template reads to active company admins, leaving the Owner screen
-- empty under RLS.

drop policy if exists "read permitted signing templates" on public.signing_templates;
create policy "read permitted signing templates" on public.signing_templates
for select
using (
  private.can_manage_company(company_id)
  or (
    company_id is null
    and private.current_role_name() = 'owner'
  )
  or (
    company_id is null
    and private.current_role_name() = 'admin'
    and private.current_company_is_active()
  )
  or (
    private.current_company_is_active()
    and status = 'ready'
    and exists (
      select 1
      from public.signature_requests request
      where request.template_id = signing_templates.id
        and request.driver_id = (select auth.uid())
    )
  )
);
