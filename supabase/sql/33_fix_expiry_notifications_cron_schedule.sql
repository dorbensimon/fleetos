-- ============================================================
-- 33_fix_expiry_notifications_cron_schedule.sql
--
-- Fixes the schedule set in 31_expiry_and_service_notifications.sql.
-- That migration scheduled the job at "04:00 UTC" with a comment
-- claiming it would run ahead of mika (05:40 IDT) and omer
-- (06:00 IDT). That math was wrong: 04:00 UTC = 07:00 IDT in
-- summer (UTC+3), i.e. *after* both of them, not before.
--
-- Decision (approved 2026-08-24): stop trying to stagger this job
-- ahead of mika/omer by a few minutes. Unify it into the same
-- 06:00 IDT slot as the rest of the daily routine instead.
-- 06:00 IDT (summer, UTC+3) = 03:00 UTC.
--
-- Note: pg_cron schedules run in UTC with no DST awareness, so this
-- fixed offset assumes IL summer time (UTC+3). If/when this needs
-- to stay correct across the DST boundary, that's a separate,
-- larger change (e.g. two schedules swapped twice a year, or a
-- timezone-aware external scheduler) — out of scope here.
--
-- Append-only: does not edit 31_expiry_and_service_notifications.sql.
-- ============================================================

select cron.unschedule('check-vehicle-expiry-notifications');

select cron.schedule(
  'check-vehicle-expiry-notifications',
  '0 3 * * *',  -- 03:00 UTC = 06:00 IDT (summer, UTC+3)
  $$ select public.check_vehicle_expiry_notifications() $$
);
