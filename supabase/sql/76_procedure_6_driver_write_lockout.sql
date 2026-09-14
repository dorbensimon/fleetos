-- Procedure 6 reports are created only by company managers.  Keep the
-- existing manager branch intact, but prevent a driver from creating,
-- changing, or deleting one through a modified client.

drop policy if exists "authenticated insert access" on public.documents;
create policy "authenticated insert access" on public.documents
for insert to authenticated
with check (
  private.can_manage_company(company_id)
  or (
    private.current_company_is_active()
    and owner_type = 'driver'
    and owner_id = (select auth.uid())
    and company_id = private.current_company_id()
    and not private.current_driver_is_archived()
    and not private.current_user_pending_password_setup()
    and category <> 'procedure_6'
    and (
      compliance_item_id is null
      or exists (
        select 1 from public.compliance_items item
        where item.id = documents.compliance_item_id
          and item.owner_type = 'driver'
          and item.owner_id = (select auth.uid())
          and item.company_id = private.current_company_id()
      )
    )
  )
);

drop policy if exists "authenticated update access" on public.documents;
create policy "authenticated update access" on public.documents
for update to authenticated
using (
  private.can_manage_company(company_id)
  or (
    private.current_company_is_active()
    and owner_type = 'driver'
    and owner_id = (select auth.uid())
    and company_id = private.current_company_id()
    and not private.current_driver_is_archived()
    and not private.current_user_pending_password_setup()
    and category <> 'procedure_6'
  )
)
with check (
  private.can_manage_company(company_id)
  or (
    private.current_company_is_active()
    and owner_type = 'driver'
    and owner_id = (select auth.uid())
    and company_id = private.current_company_id()
    and not private.current_driver_is_archived()
    and not private.current_user_pending_password_setup()
    and category <> 'procedure_6'
    and (
      compliance_item_id is null
      or exists (
        select 1 from public.compliance_items item
        where item.id = documents.compliance_item_id
          and item.owner_type = 'driver'
          and item.owner_id = (select auth.uid())
          and item.company_id = private.current_company_id()
      )
    )
  )
);

drop policy if exists "authenticated delete access" on public.documents;
create policy "authenticated delete access" on public.documents
for delete to authenticated
using (
  private.can_manage_company(company_id)
  or (
    private.current_company_is_active()
    and owner_type = 'driver'
    and owner_id = (select auth.uid())
    and company_id = private.current_company_id()
    and not private.current_driver_is_archived()
    and not private.current_user_pending_password_setup()
    and category <> 'procedure_6'
  )
);
