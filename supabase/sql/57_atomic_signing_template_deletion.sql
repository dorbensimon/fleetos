-- Permanently deleting an archived template used to run three separate writes
-- (snapshot the title onto signed requests, drop the non-completed requests,
-- drop the template) plus external DocuSeal/storage calls. A crash mid-way
-- could leave the DB half-updated: e.g. non-completed requests gone but the
-- template still present, or vice versa. Collapse the three DB writes into one
-- transaction so they always succeed or fail together, matching the pattern
-- already used for vehicle deletion (delete_company_vehicle_records).

create or replace function public.delete_signing_template_records(
  target_template_id uuid,
  target_company_id uuid,
  template_title_snapshot text
)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.signing_templates template
    where template.id = target_template_id
      and template.company_id = target_company_id
  ) then
    return false;
  end if;

  -- Signed requests survive the template; snapshot its title so they stay
  -- readable once the template row is gone.
  update public.signature_requests
  set template_title = template_title_snapshot
  where template_id = target_template_id
    and company_id = target_company_id
    and status = 'completed';

  delete from public.signature_requests
  where template_id = target_template_id
    and company_id = target_company_id
    and status <> 'completed';

  delete from public.signing_templates
  where id = target_template_id
    and company_id = target_company_id;

  return true;
end;
$$;

revoke execute on function public.delete_signing_template_records(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.delete_signing_template_records(uuid, uuid, text) to service_role;
