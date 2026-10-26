-- 130: database upkeep before the data grows. No data changes.
--
-- 1. An index on every foreign key that had none (Supabase advisor
--    "unindexed_foreign_keys", 25). Without one, deleting a driver, vehicle,
--    user or notification scans the whole referencing table.
-- 2. A primary key on the three alert logs that had none. They are written
--    with `on conflict on constraint <name>_unique`, so those constraints stay
--    exactly as they are; each table gets a new identity column instead.
-- 3. The eight alert/bookkeeping tables with RLS on and no policy are read and
--    written only by the server (security definer functions, cron, Edge
--    Functions with the service role), all of which bypass RLS. An explicit
--    deny-all policy says so, instead of looking like a forgotten policy.
--
-- Every statement is idempotent; the tables are small, so plain (not
-- concurrent) index builds hold their lock for milliseconds.

-- 1. Foreign-key indexes.
create index if not exists activity_logs_actor_id_idx on public.activity_logs (actor_id);
create index if not exists company_notes_created_by_idx on public.company_notes (created_by);
create index if not exists company_signing_settings_updated_by_idx on public.company_signing_settings (updated_by);
create index if not exists driver_date_expiry_alerts_company_id_idx on public.driver_date_expiry_alerts (company_id);
create index if not exists driver_deletion_tombstones_company_id_idx on public.driver_deletion_tombstones (company_id);
create index if not exists driver_details_archived_by_idx on public.driver_details (archived_by);
create index if not exists driver_folder_expiry_alerts_company_id_idx on public.driver_folder_expiry_alerts (company_id);
create index if not exists form_templates_created_by_idx on public.form_templates (created_by);
create index if not exists license_update_requests_reviewed_by_idx on public.license_update_requests (reviewed_by);
create index if not exists license_update_requests_submitted_by_idx on public.license_update_requests (submitted_by);
create index if not exists notification_alert_log_company_id_idx on public.notification_alert_log (company_id);
create index if not exists schedule_blocks_driver_id_idx on public.schedule_blocks (driver_id);
create index if not exists schedule_blocks_vehicle_id_idx on public.schedule_blocks (vehicle_id);
create index if not exists schedule_series_created_by_idx on public.schedule_series (created_by);
create index if not exists schedule_series_driver_id_idx on public.schedule_series (driver_id);
create index if not exists schedule_series_vehicle_id_idx on public.schedule_series (vehicle_id);
create index if not exists schedule_trips_created_by_idx on public.schedule_trips (created_by);
create index if not exists schedule_trips_driver_id_idx on public.schedule_trips (driver_id);
create index if not exists schedule_trips_vehicle_id_idx on public.schedule_trips (vehicle_id);
create index if not exists signature_requests_deleted_by_idx on public.signature_requests (deleted_by);
create index if not exists signing_template_versions_replaced_by_idx on public.signing_template_versions (replaced_by);
create index if not exists traffic_report_alerts_company_id_idx on public.traffic_report_alerts (company_id);
create index if not exists traffic_report_alerts_notification_id_idx on public.traffic_report_alerts (notification_id);
create index if not exists vehicle_expiry_alerts_company_id_idx on public.vehicle_expiry_alerts (company_id);
create index if not exists vehicle_service_records_created_by_idx on public.vehicle_service_records (created_by);

-- 2. Primary keys (inserts name their columns, so a new column is harmless).
alter table public.driver_date_expiry_alerts add column if not exists id bigint generated always as identity primary key;
alter table public.driver_folder_expiry_alerts add column if not exists id bigint generated always as identity primary key;
alter table public.traffic_report_alerts add column if not exists id bigint generated always as identity primary key;

-- 3. Server-only tables: nobody signed in reads or writes them directly.
do $$
declare
  t text;
begin
  foreach t in array array[
    'checklist_due_alerts', 'driver_date_expiry_alerts', 'driver_deletion_tombstones',
    'driver_folder_expiry_alerts', 'notification_alert_log', 'owner_alert_log',
    'traffic_report_alerts', 'vehicle_expiry_alerts'
  ] loop
    execute format('drop policy if exists "server only" on public.%I', t);
    execute format('create policy "server only" on public.%I as restrictive for all to anon, authenticated using (false) with check (false)', t);
    execute format('comment on table public.%I is %L', t,
      'Server-only bookkeeping (cron, security definer functions, service-role Edge Functions). Deny-all policy on purpose.');
  end loop;
end $$;
