-- Company-document metadata is separate from expiry_date.  It lets the
-- documents shelf show the business date and optional explanation entered by
-- the admin without affecting compliance rules or expiry notifications.

alter table public.documents
  add column if not exists document_date date,
  add column if not exists description text;

create index if not exists documents_company_category_date_idx
  on public.documents (company_id, category, document_date desc nulls last);
