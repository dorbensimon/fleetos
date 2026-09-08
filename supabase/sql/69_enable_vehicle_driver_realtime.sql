-- Publish only the assignment table required by the manager detail screens.
-- The guard makes this safe to apply once in each environment.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vehicle_drivers'
  ) then
    alter publication supabase_realtime add table public.vehicle_drivers;
  end if;
end;
$$;
