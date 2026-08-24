-- ============================================================
-- 37_documents_broadcast_schema.sql
--
-- Implements `.claude/prds/documents-broadcast.md` ("מסמכים חתומים",
-- stage 1 — no signing yet). Reviewed and applied by roi from mika's
-- proposal at `.claude/mika-proposals/37_documents_broadcast_schema.sql`
-- (2026-08-25 DBA review, approved by dor). NOT executed against
-- Supabase yet — roi writes migrations, dor/the deploy process runs
-- them.
--
-- Deliberately a NEW, separate domain from `public.documents` /
-- `public.compliance_items` (10_admin_schema.sql). That table models
-- "one file owned by one vehicle/driver, categorized by compliance
-- type". This feature models "one immutable template, broadcast as
-- N independent copies to drivers" — a different shape, different
-- audience, different lifecycle. Reusing `documents` would conflate
-- the two and make future RLS changes to either one risk breaking
-- the other. See PRD section 0 for the business rationale.
--
-- Three new tables + one new storage bucket:
--   1. document_templates  — the immutable "master copy" (FR2/FR3/FR4)
--   2. document_sends      — one row per (driver, send event) — the
--                            "stack" model (FR4/FR5)
--   3. driver_notifications — new admin->driver notification channel
--                            (FR6) — deliberately NOT bolted onto the
--                            existing `public.notifications` table
--                            (that table is company-wide/shared-row,
--                            not per-recipient — see 35's header).
--
-- roi's review of mika's proposal: the design is sound and follows
-- established conventions in this codebase (can_manage_company() RLS
-- gating, the migration-32 cross-tenant INSERT guard pattern, the
-- 25/28/31 trigger-writes-notification pattern, migration-36's
-- search_path/grant hardening). Two changes made on top of the
-- proposal, both additive/operational, not structural:
--   1. The bucket-creation statement is now UNCOMMENTED and executed
--      as part of this migration (idempotent, `on conflict do
--      nothing`), instead of being left as a manual Studio step.
--      Rationale: migration 24's own header documents a real incident
--      where a bucket's RLS policies were silently missing for a
--      while because bucket setup depended on someone remembering a
--      manual step. Since `insert into storage.buckets` is plain SQL
--      and idempotent, folding it into the migration removes that
--      exact failure mode instead of repeating it.
--   2. Added `drop policy if exists` before the two new
--      `storage.objects` policies, matching this file's own
--      (and the rest of this repo's) convention of every policy being
--      safely re-runnable.
-- No other logic, RLS shape, index, or column was changed from mika's
-- proposal — the cross-tenant INSERT guard on document_sends, the
-- denormalization strategy, the immutability enforcement (RLS +
-- GRANT, no UPDATE/DELETE policy at all), and the forward-compat
-- signing columns are all applied as proposed and reviewed as correct.
-- ============================================================


-- ------------------------------------------------------------
-- 1. document_templates
--
-- Created once by an admin/owner, never edited or deleted (PRD 4.3,
-- FR4: "אין אפשרות למחוק את התבנית"). Immutability is enforced at TWO
-- independent layers:
--   a) RLS: only SELECT and INSERT policies exist below — no
--      UPDATE/DELETE policy for authenticated at all.
--   b) GRANT: authenticated only gets select+insert, so enforcement
--      doesn't silently depend on nobody ever adding a permissive
--      policy later.
-- service_role keeps full grants (ops/GDPR-erasure tooling may
-- legitimately need to touch this table outside the app's normal
-- path).
-- ------------------------------------------------------------

create table if not exists public.document_templates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,

  name        text not null,
  file_path   text not null,   -- storage path, see bucket section below
  file_name   text,            -- original filename, for display/download
  file_size   int,             -- bytes, self-reported by the client at
                                -- upload time — NOT authoritative (see
                                -- storage note below), just for display
                                -- and the UI's own pre-flight check.
  mime_type   text not null default 'application/pdf',

  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint document_templates_name_not_blank
    check (length(trim(name)) > 0),
  constraint document_templates_mime_check
    check (mime_type = 'application/pdf'),
  constraint document_templates_file_size_check
    check (file_size is null or file_size <= 10485760)  -- 10MB, PRD 4.1
);

-- FR2: "כל תבניות המסמכים... ממוין מהחדש לישן" — this is the exact
-- access pattern, so company_id leads and created_at desc is included
-- directly in the index to avoid a separate sort step.
create index if not exists document_templates_company_idx
  on public.document_templates(company_id, created_at desc);

alter table public.document_templates enable row level security;

drop policy if exists "admin manage own company document templates select" on public.document_templates;
create policy "admin manage own company document templates select"
  on public.document_templates
  for select
  using (public.can_manage_company(company_id));

drop policy if exists "admin manage own company document templates insert" on public.document_templates;
create policy "admin manage own company document templates insert"
  on public.document_templates
  for insert
  with check (public.can_manage_company(company_id));

-- Drivers do NOT get direct access to document_templates at all —
-- deliberate least-privilege choice. A driver only needs to see
-- templates that were actually sent to them, with the name/file
-- snapshotted onto document_sends at send time (below). Granting
-- driver SELECT here would leak the existence/names of every
-- template the company ever created, including ones never sent to
-- that driver.

grant select, insert on public.document_templates to authenticated;
grant select, insert, update, delete on public.document_templates to service_role;


-- ------------------------------------------------------------
-- 2. document_sends — one row per send event ("stack" model)
--
-- Stage 1 explicitly allows multiple concurrent "pending" rows for
-- the same (driver_id, template_id) — PRD 4.3: resend never dedups
-- or blocks. So there is deliberately NO unique constraint on
-- (driver_id, template_id) here.
--
-- name/file_path are DENORMALIZED (copied) from document_templates
-- at send time rather than joined at read time:
--   1. Least privilege: the driver never needs a SELECT policy on
--      document_templates (see above) — everything the driver's
--      screen needs to render is already sitting on their own row.
--   2. "Snapshot" semantics matches the PRD's own mental model
--      (FR5 explicitly calls this a copy, not a live pointer).
--
-- file_path is NOT duplicated in storage — every send for the same
-- template points at the SAME physical object; storage grows only
-- with (templates), not (templates x drivers x resends).
--
-- status/signed_at/signature_file_path are forward-compat columns for
-- the NEXT stage (signing), included now so that stage doesn't need a
-- schema-breaking migration:
--   - status stays 'pending' for every row created in stage 1.
--   - signed_at / signature_file_path stay NULL for every row in
--     stage 1.
--   - The "stack collapse on sign" rule from the PRD is INTENTIONALLY
--     NOT implemented here — stage 1 requires multiple concurrent
--     'pending' rows to be legal, so a naive unique index would break
--     FR4/FR5 today. When signing lands, that side effect belongs in
--     the signing write-path itself (trigger or SECURITY DEFINER RPC,
--     not a raw client UPDATE) — flagged for whoever builds stage 2.
-- ------------------------------------------------------------

create table if not exists public.document_sends (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  template_id   uuid not null references public.document_templates(id) on delete restrict,
  driver_id     uuid not null references public.profiles(id) on delete cascade,
  sent_by       uuid references public.profiles(id) on delete set null,

  -- Optional: groups the N rows created by a single "send to all"
  -- click so a future admin screen could show "batch of 40 sends" as
  -- one line instead of 40. Not required by any FR — kept as a cheap
  -- forward-compat column.
  batch_id      uuid,

  document_name text not null,   -- snapshot of document_templates.name
  file_path     text not null,   -- snapshot of document_templates.file_path

  status        text not null default 'pending',
  signed_at             timestamptz,   -- always null in stage 1
  signature_file_path   text,          -- always null in stage 1

  created_at    timestamptz not null default now(),

  constraint document_sends_status_check check (status in ('pending', 'signed')),
  constraint document_sends_document_name_not_blank check (length(trim(document_name)) > 0)
);

-- Driver's own feed (FR5): "רשימת כל המסמכים שנשלחו לנהג הזה", newest
-- first.
create index if not exists document_sends_driver_idx
  on public.document_sends(driver_id, created_at desc);

-- Stage-2 hook: "find all current copies of this (driver, template)"
-- for the collapse-on-sign logic described above.
create index if not exists document_sends_driver_template_idx
  on public.document_sends(driver_id, template_id);

-- Admin-side queries + RLS filter column (FK-without-index avoidance:
-- can_manage_company(company_id) runs per row on every admin query
-- against this table).
create index if not exists document_sends_company_idx
  on public.document_sends(company_id, created_at desc);

-- KPI queries (PRD section 8: "Reach" = distinct drivers reached per
-- template) and FK-without-index avoidance for the ON DELETE RESTRICT
-- check against document_templates.
create index if not exists document_sends_template_idx
  on public.document_sends(template_id);

alter table public.document_sends enable row level security;

-- Admin/owner: can see and create sends for their own company. No
-- UPDATE/DELETE policy at all — matches PRD "no cancel a send" (6).
drop policy if exists "admin manage own company document sends select" on public.document_sends;
create policy "admin manage own company document sends select"
  on public.document_sends
  for select
  using (public.can_manage_company(company_id));

drop policy if exists "admin manage own company document sends insert" on public.document_sends;
create policy "admin manage own company document sends insert"
  on public.document_sends
  for insert
  with check (
    public.can_manage_company(company_id)
    -- Cross-tenant integrity guard: the template being sent and the
    -- driver receiving it must BOTH actually belong to the company
    -- the row claims. Without this, a forged template_id/driver_id
    -- could create a row whose company_id passes can_manage_company()
    -- but whose template_id/driver_id point at a DIFFERENT company's
    -- data — letting a driver see (or an admin send) another tenant's
    -- document. Same principle as migration 32's
    -- prevent_driver_details_company_escalation().
    and exists (
      select 1 from public.document_templates t
      where t.id = template_id and t.company_id = document_sends.company_id
    )
    and exists (
      select 1 from public.profiles p
      where p.id = driver_id and p.company_id = document_sends.company_id and p.role = 'driver'
    )
  );

-- Driver: read-only on their own rows (PRD 4.2 stage-1: "רק לצפות").
-- No INSERT/UPDATE/DELETE policy for driver at all.
drop policy if exists "driver reads own document sends" on public.document_sends;
create policy "driver reads own document sends"
  on public.document_sends
  for select
  using (driver_id = auth.uid());

grant select, insert on public.document_sends to authenticated;
grant select, insert, update, delete on public.document_sends to service_role;


-- ------------------------------------------------------------
-- 3. driver_notifications — new admin->driver notification channel
--
-- DESIGN DECISION: a separate table, NOT a nullable recipient_id
-- column bolted onto the existing public.notifications (25/35).
--
-- public.notifications rows are NOT per-recipient (35's header:
-- "made visible to every admin/owner of that company"). Retrofitting
-- a single-recipient audience onto that invariant means every future
-- SELECT policy on that table needs a compound OR-branch between
-- "company-wide" and "one recipient only" — exactly the kind of
-- compound RLS logic where a small mistake becomes a cross-tenant or
-- cross-user leak. A single-audience table has a single-clause
-- policy. Also: the existing opt-out preference system (35) is for
-- "admin decides they don't want to see X" — not appropriate default
-- for "you have a document waiting for your signature".
--
-- notification_type is a closed list of 1 today (mirrors 35's
-- pattern) — extensible for whatever admin->driver notification comes
-- next without another structural migration.
--
-- source_send_id is optional forward-compat: lets the driver's UI
-- eventually deep-link "tap notification -> open that exact
-- document_sends row". ON DELETE SET NULL because document_sends rows
-- are never deleted in practice (no delete policy exists), but the
-- notification should never become un-writable because of this
-- pointer if that ever changes.
-- ------------------------------------------------------------

create table if not exists public.driver_notifications (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  driver_id    uuid not null references public.profiles(id) on delete cascade,
  actor_id     uuid references public.profiles(id) on delete set null,

  notification_type text not null default 'document_sent'
    check (notification_type in ('document_sent')),
  source_send_id     uuid references public.document_sends(id) on delete set null,

  message      text not null,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),

  constraint driver_notifications_message_not_blank check (length(trim(message)) > 0)
);

-- Primary access pattern: driver's own feed, newest first.
create index if not exists driver_notifications_driver_idx
  on public.driver_notifications(driver_id, created_at desc);

-- Company-scoped admin/audit visibility (see grant note below) and
-- FK-without-index avoidance.
create index if not exists driver_notifications_company_idx
  on public.driver_notifications(company_id, created_at desc);

alter table public.driver_notifications enable row level security;

-- Driver reads only their own rows.
drop policy if exists "driver reads own notifications" on public.driver_notifications;
create policy "driver reads own notifications"
  on public.driver_notifications
  for select
  using (driver_id = auth.uid());

-- Driver may mark their own notifications read — but ONLY the
-- read_at column. A blanket "for update using/with check
-- (driver_id = auth.uid())" policy (used elsewhere in this codebase,
-- e.g. driver_details) would let the driver rewrite their own
-- message/notification_type history, which matters more here because
-- this table doubles as the audit trail proving "the driver was
-- notified to sign document X on date Y". RLS's USING/WITH CHECK
-- cannot restrict individual columns — that's done via a
-- column-level GRANT instead (see below).
drop policy if exists "driver updates own notification read state" on public.driver_notifications;
create policy "driver updates own notification read state"
  on public.driver_notifications
  for update
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid());

-- Admin/owner: read-only audit visibility into their company's
-- driver-notification log (e.g. support case "did the driver actually
-- get notified to sign this?"). No insert/update/delete for
-- admin/authenticated at all — every row is written exclusively by
-- the trigger below (SECURITY DEFINER, bypasses RLS, same pattern as
-- log_driver_self_edit()/log_driver_document_upload() in this
-- codebase).
drop policy if exists "admin reads own company driver notifications" on public.driver_notifications;
create policy "admin reads own company driver notifications"
  on public.driver_notifications
  for select
  using (public.can_manage_company(company_id));

grant select on public.driver_notifications to authenticated;
grant update (read_at) on public.driver_notifications to authenticated;
grant select, insert, update, delete on public.driver_notifications to service_role;


-- ------------------------------------------------------------
-- 4. Trigger: document_sends insert -> driver_notifications insert
--
-- Atomicity matters: the app must never be able to create a
-- document_sends row without the matching driver notification (or
-- vice versa) surviving a crash/network drop between two separate
-- client-side inserts. Every existing notification source in this
-- codebase (25, 28, 31) uses exactly this trigger pattern for the
-- same reason.
--
-- Reads document_name straight off NEW (no join to document_templates
-- needed — denormalization above), so this function has no dependency
-- on document_templates' RLS despite running as SECURITY DEFINER.
-- ------------------------------------------------------------

create or replace function public.notify_driver_document_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.driver_notifications
    (company_id, driver_id, actor_id, notification_type, source_send_id, message)
  values (
    new.company_id,
    new.driver_id,
    new.sent_by,
    'document_sent',
    new.id,
    'מסמך ' || new.document_name || ' נשלח אליך לצורך חתימה'
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_driver_document_sent on public.document_sends;
create trigger trg_notify_driver_document_sent
  after insert on public.document_sends
  for each row
  execute function public.notify_driver_document_sent();

-- Matches migration 36's hardening pass: trigger functions don't need
-- direct-call EXECUTE from anon/authenticated (Postgres refuses to run
-- them outside trigger context regardless), so revoke the default
-- PUBLIC grant as pure defense-in-depth, consistent with the other
-- trigger functions already hardened there.
revoke execute on function public.notify_driver_document_sent() from public;


-- ------------------------------------------------------------
-- 5. Storage bucket: signed-documents (NEW, separate from the
--    existing `documents` bucket)
--
-- Kept as its OWN bucket rather than reusing `documents` under a new
-- path prefix:
--   1. The `documents` bucket's existing DRIVER read policy is
--      hard-coded to the compliance-doc convention (foldername[2] =
--      'driver', foldername[3] = auth.uid()::text) — broadcast
--      templates have no single owning driver, so this feature needs
--      its own driver storage policy regardless of which bucket it
--      lives in.
--   2. Given a new policy is required either way, a dedicated bucket
--      keeps the two domains (compliance docs vs. broadcast
--      templates) auditable independently — and given migration 24's
--      own history (this exact class of bug: a bucket's policies
--      silently missing, breaking every upload undetected), a
--      smaller, single-purpose bucket is easier to verify correct at
--      a glance.
--
-- Path convention: {company_id}/{template_id}/{filename}
--   - company_id first (matches existing convention, lets the admin
--     policy reuse the exact same can_manage_company(foldername[1])
--     shape as the documents bucket).
--   - template_id second, so a driver's storage-read policy can join
--     back to document_sends by exact path match without needing any
--     access to document_templates at all.
--
-- IMPORTANT — file_size/mime_type columns above are self-reported
-- client metadata, not authoritative. `file_size_limit` and
-- `allowed_mime_types` below are the actual bucket-level enforcement
-- layer (Supabase Storage rejects the upload server-side regardless
-- of what the client claims in table columns). The DB constraints on
-- document_templates are a second, cosmetic layer on top of this, not
-- the only one.
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signed-documents', 'signed-documents', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "manage own company signed documents in storage" on storage.objects;
create policy "manage own company signed documents in storage"
  on storage.objects
  for all
  using (
    bucket_id = 'signed-documents'
    and public.can_manage_company(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'signed-documents'
    and public.can_manage_company(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "driver reads own signed documents in storage" on storage.objects;
create policy "driver reads own signed documents in storage"
  on storage.objects
  for select
  using (
    bucket_id = 'signed-documents'
    and exists (
      select 1 from public.document_sends ds
      where ds.driver_id = auth.uid()
        and ds.file_path = storage.objects.name
    )
  );
