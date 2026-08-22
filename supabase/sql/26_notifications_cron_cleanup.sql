-- ============================================================
-- 26_notifications_cron_cleanup.sql
--
-- Belt-and-suspenders for the 7-day notification lifetime: the app
-- already trims old rows opportunistically whenever an admin opens
-- the notifications list (see lib/adminApi.ts listNotifications), but
-- that only runs if someone actually opens the screen. This adds a
-- daily scheduled job so expiry happens regardless.
-- ============================================================

create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'delete-old-notifications',
  '0 3 * * *',  -- 03:00 UTC daily
  $$ delete from public.notifications where created_at < now() - interval '7 days' $$
);
