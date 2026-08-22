-- ============================================================
-- 27_remove_notifications_cron.sql
--
-- Reverts 26: a background job silently deleting old-but-still-unread
-- notifications would shrink the unread badge count without the admin
-- ever opening the notifications screen — breaking the rule that the
-- count only drops when they actually look. Cleanup now happens only
-- via lib/adminApi.ts's listNotifications(), which runs precisely when
-- the admin opens the screen (same moment everything gets marked read
-- anyway), so the two behaviors stay in sync with a single trigger.
-- ============================================================

select cron.unschedule('delete-old-notifications');
