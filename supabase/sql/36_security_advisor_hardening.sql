-- ============================================================
-- 36_security_advisor_hardening.sql
--
-- Fixes the two classes of finding from Supabase's security
-- advisors (checked live against production via MCP, 2026-08-24):
--
--   A. function_search_path_mutable (WARN)
--      my_role, my_company_id, touch_updated_at,
--      reset_compliance_notified, reset_service_notified
--
--      None of these pin `search_path`, so if a role with CREATE
--      privilege on `public` (or any schema earlier in a caller's
--      search_path) ever plants an object shadowing an unqualified
--      identifier the function relies on, behavior could be hijacked.
--      Low likelihood here (no untrusted roles have CREATE on public
--      today), but it's a one-line fix with no behavior change, so
--      there's no reason to leave it. `touch_updated_at`,
--      `reset_compliance_notified`, `reset_service_notified` bodies
--      are already fully qualified (`new.x`, no bare table refs), so
--      pinning search_path is pure hardening, zero behavior change.
--
--      `my_role()` / `my_company_id()` are NOT defined in any file in
--      this repo — they predate migration tracking (referenced from
--      22_driver_self_service.sql as `public.my_role()`, called with
--      no arguments) and evidently still exist in production, since
--      the advisor found them. Because we don't have their source
--      here, we deliberately do NOT touch their body — we only pin
--      search_path via `ALTER FUNCTION`, which requires no body
--      changes. If their signature ever turns out to differ from the
--      zero-argument form assumed below, the DO block below reports
--      it via RAISE NOTICE instead of failing the whole migration.
--      ACTION ITEM for dor: these two functions should eventually be
--      captured in a migration file (e.g. by pg_dump'ing their
--      current definition) so they stop being "invisible" to the repo.
--
--   B. security_definer_function_executable by anon/authenticated
--      (WARN) — every SECURITY DEFINER function in `public` is
--      executable by `anon`/`authenticated` by default, because
--      Postgres grants EXECUTE to PUBLIC on function creation unless
--      explicitly revoked. Findings, triaged:
--
--      B1. Trigger functions — enforce_vehicle_drivers_rules,
--          log_driver_document_upload, log_driver_self_edit,
--          prevent_driver_details_company_escalation,
--          prevent_privilege_escalation.
--          NOT exploitable even with the default PUBLIC grant:
--          Postgres refuses to run a trigger function outside trigger
--          context ("trigger functions can only be called as
--          triggers"), regardless of EXECUTE privilege, because they
--          reference NEW/OLD. Trigger *firing* itself never checks
--          EXECUTE privilege on the function either way, so revoking
--          EXECUTE from PUBLIC/anon/authenticated here is pure
--          defense-in-depth (closes the advisor WARN, shrinks the
--          direct-call attack surface for future refactors) with zero
--          functional risk — the triggers keep firing normally.
--
--      B2. check_vehicle_expiry_notifications() — NOT a trigger,
--          returns void, meant to be invoked only by the pg_cron job
--          (31/33). This one IS genuinely exploitable today: it's
--          SECURITY DEFINER, so it bypasses RLS entirely and scans
--          compliance_items/vehicles across *every* company. Any
--          authenticated user (even a driver, even from an unrelated
--          company) could call it directly via the Supabase client
--          and force early notification inserts + set
--          expiry_notified_at/service_notified_at ahead of schedule
--          for companies they have no relationship to — a real
--          cross-tenant side-effect, not just noise. 31 already
--          intended service_role-only access (explicit
--          `grant execute ... to service_role`), but never revoked
--          the default PUBLIC grant that undermines it. Fixed here:
--          revoke from PUBLIC, keep service_role only.
--
--      B3. can_manage_company(uuid), current_role_name(),
--          current_company_id(), my_role(), my_company_id() — read-
--          only, self-scoped (all key off auth.uid() of the *caller*,
--          returning only info about the caller's own role/company/
--          permissions — never about other users). They're also
--          actively relied on by RLS policies evaluated as
--          `authenticated`, so EXECUTE must stay granted to
--          `authenticated` (and `service_role`, used by Edge
--          Functions/cron). Only `anon` access is removed — there is
--          no legitimate anon use case (the app requires a logged-in
--          session before touching any company-scoped table), and for
--          an unauthenticated caller auth.uid() is null anyway, so
--          today's exposure is low-risk (returns null/false, no data
--          leak) but has no reason to remain open either.
--
-- Idempotent: safe to re-run. Written 2026-08-24, not yet executed
-- against Supabase — run manually (SQL editor or CLI) after review.
-- ============================================================


-- ------------------------------------------------------------
-- A. Pin search_path
-- ------------------------------------------------------------

alter function public.touch_updated_at() set search_path = public;
alter function public.reset_compliance_notified() set search_path = public;
alter function public.reset_service_notified() set search_path = public;

do $$
begin
  alter function public.my_role() set search_path = public;
exception when undefined_function then
  raise notice 'public.my_role() not found with a zero-argument signature — skipped. Verify the real signature manually and pin search_path directly.';
end $$;

do $$
begin
  alter function public.my_company_id() set search_path = public;
exception when undefined_function then
  raise notice 'public.my_company_id() not found with a zero-argument signature — skipped. Verify the real signature manually and pin search_path directly.';
end $$;


-- ------------------------------------------------------------
-- B1. Trigger functions — revoke the default PUBLIC execute grant.
--     Triggers keep firing regardless (Postgres doesn't check EXECUTE
--     privilege to fire a trigger), this only blocks direct RPC calls.
-- ------------------------------------------------------------

revoke execute on function public.enforce_vehicle_drivers_rules() from public;
revoke execute on function public.log_driver_document_upload() from public;
revoke execute on function public.log_driver_self_edit() from public;
revoke execute on function public.prevent_driver_details_company_escalation() from public;
revoke execute on function public.prevent_privilege_escalation() from public;


-- ------------------------------------------------------------
-- B2. check_vehicle_expiry_notifications — service_role only.
--     Genuinely exploitable otherwise (see note above): SECURITY
--     DEFINER + bypasses RLS + no caller-identity check inside body.
-- ------------------------------------------------------------

revoke execute on function public.check_vehicle_expiry_notifications() from public;
grant execute on function public.check_vehicle_expiry_notifications() to service_role;


-- ------------------------------------------------------------
-- B3. Self-scoped helpers — keep authenticated + service_role
--     (required by RLS policies / Edge Functions), drop anon.
-- ------------------------------------------------------------

revoke execute on function public.can_manage_company(uuid) from public;
grant execute on function public.can_manage_company(uuid) to authenticated, service_role;

revoke execute on function public.current_role_name() from public;
grant execute on function public.current_role_name() to authenticated, service_role;

revoke execute on function public.current_company_id() from public;
grant execute on function public.current_company_id() to authenticated, service_role;

do $$
begin
  revoke execute on function public.my_role() from public;
  grant execute on function public.my_role() to authenticated, service_role;
exception when undefined_function then
  raise notice 'public.my_role() not found with a zero-argument signature — skipped grant/revoke. Verify manually.';
end $$;

do $$
begin
  revoke execute on function public.my_company_id() from public;
  grant execute on function public.my_company_id() to authenticated, service_role;
exception when undefined_function then
  raise notice 'public.my_company_id() not found with a zero-argument signature — skipped grant/revoke. Verify manually.';
end $$;
