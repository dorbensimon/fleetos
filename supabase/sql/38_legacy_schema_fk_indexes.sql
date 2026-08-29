-- Cover every legacy foreign key reported by the performance advisor.
create index if not exists document_templates_created_by_idx
  on public.document_templates (created_by);
create index if not exists documents_compliance_item_id_idx
  on public.documents (compliance_item_id);
create index if not exists documents_uploaded_by_idx
  on public.documents (uploaded_by);
create index if not exists driver_details_department_id_idx
  on public.driver_details (department_id);
create index if not exists driver_document_sends_sent_by_idx
  on public.driver_document_sends (sent_by);
create index if not exists driver_document_sends_template_id_idx
  on public.driver_document_sends (template_id);
create index if not exists notifications_actor_id_idx
  on public.notifications (actor_id);
create index if not exists vehicle_driver_history_company_id_idx
  on public.vehicle_driver_history (company_id);
create index if not exists vehicles_department_id_idx
  on public.vehicles (department_id);
