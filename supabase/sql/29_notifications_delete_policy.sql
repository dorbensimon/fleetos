-- ============================================================
-- 29_notifications_delete_policy.sql
--
-- Migration 25 enabled RLS on public.notifications but only ever
-- created select/update policies. The table-level `grant ... delete`
-- at the end of 25 is not enough on its own: with RLS on and no
-- matching `for delete` policy, PostgreSQL filters out every row, so
-- the DELETE succeeds with 0 rows affected and no error.
--
-- That silently broke the 7-day cleanup 27 relies on:
-- listNotifications() in lib/adminApi.ts fires the DELETE on every
-- open of the notifications screen, gets a clean success back, and
-- deletes nothing — so the table grows forever.
--
-- Same audience as the existing update policy: managers of the
-- company the notification belongs to.
-- ============================================================

drop policy if exists "company managers delete own notifications" on public.notifications;

create policy "company managers delete own notifications"
  on public.notifications
  for delete
  using (can_manage_company(company_id));
