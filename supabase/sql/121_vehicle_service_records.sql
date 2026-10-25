-- מסמכי טיפולים לרכב: חשבונית לכל טיפול, עם הפרטים שנסרקו ממנה
--
-- One row per treatment (service, repair, inspection) of a vehicle: its date,
-- free-text type, supplier, invoice number and amount before VAT. The invoice
-- file itself is an ordinary row in public.documents (category
-- 'service_docs'); document_id points at it and goes null if the file is
-- removed. Only the company's managers (and the owner) read or write it.

create table if not exists public.vehicle_service_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  service_date date not null,
  service_type text check (service_type is null or char_length(service_type) <= 120),
  supplier text check (supplier is null or char_length(supplier) <= 120),
  invoice_number text check (invoice_number is null or char_length(invoice_number) <= 60),
  amount_before_vat numeric(12, 2) check (amount_before_vat is null or amount_before_vat >= 0),
  details text check (details is null or char_length(details) <= 1000),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vehicle_service_records_vehicle
  on public.vehicle_service_records (vehicle_id, service_date desc);
create index if not exists vehicle_service_records_company
  on public.vehicle_service_records (company_id);
create index if not exists vehicle_service_records_document
  on public.vehicle_service_records (document_id) where document_id is not null;

drop trigger if exists trg_vehicle_service_records_updated_at on public.vehicle_service_records;
create trigger trg_vehicle_service_records_updated_at
  before update on public.vehicle_service_records
  for each row execute function public.touch_updated_at();

-- The vehicle and the file must belong to the record's own company.
create or replace function private.service_record_same_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.vehicles v where v.id = new.vehicle_id and v.company_id = new.company_id
  ) then
    raise exception 'vehicle_not_in_company' using errcode = 'P0001';
  end if;
  if new.document_id is not null and not exists (
    select 1 from public.documents d
    where d.id = new.document_id and d.company_id = new.company_id
      and d.owner_type = 'vehicle' and d.owner_id = new.vehicle_id
  ) then
    raise exception 'document_not_in_vehicle' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vehicle_service_records_same_company on public.vehicle_service_records;
create trigger trg_vehicle_service_records_same_company
  before insert or update of company_id, vehicle_id, document_id on public.vehicle_service_records
  for each row execute function private.service_record_same_company();

alter table public.vehicle_service_records enable row level security;
drop policy if exists "managers manage vehicle_service_records" on public.vehicle_service_records;
create policy "managers manage vehicle_service_records" on public.vehicle_service_records
  for all to authenticated
  using (private.can_manage_company(company_id))
  with check (private.can_manage_company(company_id));
revoke all on public.vehicle_service_records from anon;
grant select, insert, update, delete on public.vehicle_service_records to authenticated;
