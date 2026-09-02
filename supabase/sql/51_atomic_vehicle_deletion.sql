-- Keep permanent vehicle deletion atomic. Storage cleanup happens after this
-- transaction and may safely leave only an inaccessible orphan file on failure;
-- it can no longer leave live database rows pointing at already-deleted files.

create or replace function public.delete_company_vehicle_records(
  target_vehicle_id uuid,
  target_company_id uuid
)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.vehicles vehicle
    where vehicle.id = target_vehicle_id
      and vehicle.company_id = target_company_id
  ) then
    return false;
  end if;

  delete from public.documents
  where company_id = target_company_id
    and owner_type = 'vehicle'
    and owner_id = target_vehicle_id;

  delete from public.compliance_items
  where company_id = target_company_id
    and owner_type = 'vehicle'
    and owner_id = target_vehicle_id;

  delete from public.vehicles
  where id = target_vehicle_id
    and company_id = target_company_id;

  return true;
end;
$$;

revoke execute on function public.delete_company_vehicle_records(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_company_vehicle_records(uuid, uuid) to service_role;
