-- DocuSeal templates prepared by company admins and per-driver signing requests.

create table if not exists public.signing_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  source_file_path text not null,
  source_file_name text,
  docuseal_template_id bigint unique,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signing_templates_status_check check (status in ('draft', 'ready'))
);

create table if not exists public.signature_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid not null references public.signing_templates(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  docuseal_submission_id bigint unique,
  docuseal_submitter_id bigint unique,
  docuseal_submitter_slug text,
  signed_file_path text,
  status text not null default 'pending',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signature_requests_status_check check (status in ('pending', 'completed', 'declined'))
);

create index if not exists signing_templates_company_idx
  on public.signing_templates(company_id, created_at desc);
create index if not exists signing_templates_created_by_idx
  on public.signing_templates(created_by);
create index if not exists signature_requests_driver_idx
  on public.signature_requests(driver_id, status, created_at desc);
create index if not exists signature_requests_company_idx
  on public.signature_requests(company_id, created_at desc);
create index if not exists signature_requests_template_idx
  on public.signature_requests(template_id);
create index if not exists signature_requests_created_by_idx
  on public.signature_requests(created_by);

drop trigger if exists signing_templates_touch on public.signing_templates;
create trigger signing_templates_touch before update on public.signing_templates
  for each row execute function public.touch_updated_at();

drop trigger if exists signature_requests_touch on public.signature_requests;
create trigger signature_requests_touch before update on public.signature_requests
  for each row execute function public.touch_updated_at();

alter table public.signing_templates enable row level security;
alter table public.signature_requests enable row level security;

create policy "read permitted signing templates"
  on public.signing_templates for select to authenticated
  using (
    (select public.can_manage_company(company_id))
    or (
      status = 'ready'
      and exists (
        select 1 from public.signature_requests request
        where request.template_id = signing_templates.id
          and request.driver_id = (select auth.uid())
      )
    )
  );

create policy "insert own company signing templates"
  on public.signing_templates for insert to authenticated
  with check ((select public.can_manage_company(company_id)));
create policy "update own company signing templates"
  on public.signing_templates for update to authenticated
  using ((select public.can_manage_company(company_id)))
  with check ((select public.can_manage_company(company_id)));
create policy "delete own company signing templates"
  on public.signing_templates for delete to authenticated
  using ((select public.can_manage_company(company_id)));

create policy "read permitted signature requests"
  on public.signature_requests for select to authenticated
  using (
    (select public.can_manage_company(company_id))
    or driver_id = (select auth.uid())
  );

create policy "insert own company signature requests"
  on public.signature_requests for insert to authenticated
  with check ((select public.can_manage_company(company_id)));
create policy "update own company signature requests"
  on public.signature_requests for update to authenticated
  using ((select public.can_manage_company(company_id)))
  with check ((select public.can_manage_company(company_id)));
create policy "delete own company signature requests"
  on public.signature_requests for delete to authenticated
  using ((select public.can_manage_company(company_id)));

grant select, insert, update, delete on
  public.signing_templates,
  public.signature_requests
to authenticated, service_role;
