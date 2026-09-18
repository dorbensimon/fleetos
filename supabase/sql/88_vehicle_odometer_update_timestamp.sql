-- Keep the odometer update timestamp accurate regardless of who made the change.
-- This runs for manager edits as well as driver-submitted odometer readings.

create or replace function private.set_vehicle_odometer_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.odometer is distinct from old.odometer then
    new.odometer_updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_vehicle_odometer_updated_at on public.vehicles;

create trigger trg_set_vehicle_odometer_updated_at
before update of odometer on public.vehicles
for each row
execute function private.set_vehicle_odometer_updated_at();

revoke all on function private.set_vehicle_odometer_updated_at() from public, anon, authenticated;
