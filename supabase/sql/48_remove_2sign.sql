-- Remove all 2Sign records before removing the provider-specific schema.
-- Signature requests for those templates are deleted by the existing FK cascade.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'signing_templates'
      and column_name = 'signing_provider'
  ) then
    delete from public.signing_templates where signing_provider = '2sign';
  end if;
end $$;

drop index if exists public.signing_templates_company_2sign_template_unique;

alter table public.signature_requests
  drop column if exists two_sign_task_guid;

alter table public.signing_templates
  drop constraint if exists signing_templates_provider_check,
  drop constraint if exists signing_templates_2sign_signature_page_check,
  drop constraint if exists signing_templates_2sign_signature_slot_check,
  drop column if exists two_sign_template_id,
  drop column if exists two_sign_signature_page,
  drop column if exists two_sign_signature_slot,
  drop column if exists signing_provider;
