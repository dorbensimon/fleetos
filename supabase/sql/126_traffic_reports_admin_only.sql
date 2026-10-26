-- Driver folders: only an admin adds or changes traffic reports.
--
-- Since 2026-10-26 a traffic report is a file with its fields and status in
-- documents.details, added by the admin (lib/trafficReports.ts). A driver
-- may still see and download their reports, but not add, change or delete
-- them, the same rule procedure 6 already has. The three policies below are
-- the existing ones with 'traffic_reports' added beside 'procedure_6'.
--
-- Applied to production with Dor's approval on 2026-10-26.

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
      and category not in ('procedure_6', 'traffic_reports')
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
      and category not in ('procedure_6', 'traffic_reports')
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
      and category not in ('procedure_6', 'traffic_reports')
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
      and category not in ('procedure_6', 'traffic_reports')
    )
  );
