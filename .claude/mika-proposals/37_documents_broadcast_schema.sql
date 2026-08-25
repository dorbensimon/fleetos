-- ============================================================
-- PROPOSAL (not yet reviewed/applied by roi) — 37_documents_broadcast_schema.sql
--
-- Implements the storage layer for `.claude/prds/documents-broadcast.md`
-- ("מסמכים חתומים", stage 1 — no signing yet). Written by mika
-- (DBA), 2026-08-25. NOT executed against Supabase. roi implements
-- after dor approves; this file lives under .claude/mika-proposals/
-- and must be reviewed + moved to supabase/sql/ (renumbered if other
-- migrations land first) before it's real.
--
-- Deliberately a NEW, separate domain from `public.documents` /
-- `public.compliance_items` (10_admin_schema.sql). That table models
-- "one file owned by one vehicle/driver, categorized by compliance
-- type". This feature models "one immutable template, broadcast as
-- N independent copies to drivers" — a different shape, different
-- audience, different lifecycle. Reusing `documents` would conflate
-- the two and make future RLS changes to either one risk breaking
-- the other. See PRD section 0 for the business rationale; this file
-- covers the data-layer rationale.
--
-- Three new tables + one new storage bucket:
--   1. document_templates  — the immutable "master copy" (FR2/FR3/FR4)
--   2. document_sends      — one row per (driver, send event) — the
--                            "stack" model (FR4/FR5)
--   3. driver_notifications — new admin→driver notification channel
--                            (FR6) — deliberately NOT bolted onto the
--                            existing `public.notifications` table;
--                            see the design note above that table.
-- ============================================================


-- ------------------------------------------------------------
-- 1. document_templates
--
-- Created once by an admin/owner, never edited or deleted (PRD 4.3,
-- FR4: "אין אפשרות למחוק את התבנית"). Immutability is enforced here
-- at TWO independent layers, not just "the UI has no delete button":
--   a) RLS: only SELECT and INSERT policies exist below — there is
--      no UPDATE/DELETE policy for authenticated at all, so even a
--      hand-crafted PostgREST request from a compromised/buggy client
--      is rejected by Postgres itself.
--   b) GRANT: authenticated only gets select+insert (not update/
--      delete), so the enforcement doesn't silently depend on nobody
--      ever adding a permissive policy later without noticing there's
--      no matching grant.
-- service_role keeps full grants (ops/GDPR-erasure tooling may
-- legitimately need to touch this table outside the app's normal
-- path; that's a deliberate operational escape hatch, not something
-- exposed through anon/authenticated).
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
-- at send time rather than joined at read time. Two independent
-- reasons, not just a performance shortcut:
--   1. Least privilege: the driver never needs a SELECT policy on
--      document_templates (see above) — everything the driver's
--      screen needs to render is already sitting on their own row.
--   2. "Snapshot" semantics matches the PRD's own mental model
--      (FR5 explicitly calls this a copy, not a live pointer). If a
--      future stage ever allows renaming a template, historical
--      sends should keep showing the name as it was AT SEND TIME —
--      denormalizing now avoids a breaking data-model change later.
--
-- file_path is NOT duplicated in storage — every send for the same
-- template points at the SAME physical object. This matters at
-- scale: a naive "copy the PDF per send" design would grow storage
-- linearly with (templates × drivers × resends); this design grows
-- storage only with (templates), which at 100x driver-roster scale
-- is the difference between megabytes and gigabytes of pure
-- duplicate bytes.
--
-- status/signed_at/signature_file_path are forward-compat columns
-- for the NEXT stage (signing), included now so that stage doesn't
-- need a schema-breaking migration:
--   - status stays 'pending' for every row created in stage 1 — there
--     is no code path that ever sets it to 'signed' yet.
--   - signed_at / signature_file_path stay NULL for every row in
--     stage 1.
--   - The "stack" rule from the PRD ("once the driver signs, the
--     OLD version — if it was already signed — gets deleted, and the
--     new signed one takes its place") is INTENTIONALLY NOT
--     implemented here. It cannot be, safely, as a simple constraint:
--     stage 1 requires multiple concurrent 'pending' rows to be legal
--     (see above), so a partial unique index on
--     (driver_id, template_id) WHERE status IN ('pending','signed')
--     would break FR4/FR5 today. When signing lands, that "collapse
--     older rows for this (driver_id, template_id) down to the one
--     just-signed row" side effect belongs in the signing
--     write-path itself (trigger or a SECURITY DEFINER RPC — NOT a
--     raw client UPDATE, for the same reason driver_notifications
--     below has no client-writable columns beyond read_at: a
--     multi-row delete-and-replace side effect needs to be atomic
--     and validated server-side, not trusted to the client). Flagging
--     this explicitly so whoever builds stage 2 doesn't have to
--     rediscover it.
-- ------------------------------------------------------------

create table if not exists public.document_sends (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  template_id   uuid not null references public.document_templates(id) on delete restrict,
  driver_id     uuid not null references public.profiles(id) on delete cascade,
  sent_by       uuid references public.profiles(id) on delete set null,

  -- Optional: groups the N rows created by a single "send to all"
  -- click so a future admin screen could show "batch of 40 sends" as
  -- one line instead of 40. Not required by any FR — safe to drop if
  -- roi/idan don't want the extra column right now.
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
-- first implied by FR2's sibling pattern and general app convention.
create index if not exists document_sends_driver_idx
  on public.document_sends(driver_id, created_at desc);

-- Stage-2 hook: "find all current copies of this (driver, template)"
-- for the collapse-on-sign logic described above, and cheap enough to
-- add now rather than as an urgent add-on later.
create index if not exists document_sends_driver_template_idx
  on public.document_sends(driver_id, template_id);

-- Admin-side queries + RLS filter column (FK-without-index is exactly
-- the "RLS scans every row" trap called out in general DBA guidance —
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
-- UPDATE/DELETE policy at all — matches PRD "no cancel a send" (6)
-- and, like document_templates, is enforced at the RLS layer, not
-- just by omitting a button in the UI.
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
    -- the row claims. Without this, a bug (or a malicious admin API
    -- call with a forged template_id/driver_id) could create a row
    -- whose company_id passes can_manage_company() but whose
    -- template_id/driver_id point at a DIFFERENT company's data —
    -- letting a driver see (or an admin send) another tenant's
    -- document. This is exactly the class of bug 32's
    -- prevent_driver_details_company_escalation() closed for
    -- driver_details; same principle here.
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
-- No INSERT/UPDATE/DELETE policy for driver at all — this is the
-- concrete DB-level expression of "don't build UI that assumes the
-- driver can always act on a document" (PRD 4.2). When signing
-- lands, that will need a deliberate new, narrow write path (ideally
-- a SECURITY DEFINER RPC that validates + performs the collapse side
-- effect atomically) rather than a permissive client UPDATE policy.
drop policy if exists "driver reads own document sends" on public.document_sends;
create policy "driver reads own document sends"
  on public.document_sends
  for select
  using (driver_id = auth.uid());

grant select, insert on public.document_sends to authenticated;
grant select, insert, update, delete on public.document_sends to service_role;


-- ------------------------------------------------------------
-- 3. driver_notifications — new admin→driver notification channel
--
-- DESIGN DECISION: a separate table, NOT a nullable recipient_id
-- column bolted onto the existing public.notifications (25/35).
--
-- Why not extend the existing table:
--   - 35's own header comment establishes, deliberately and at
--     length, that public.notifications rows are NOT per-recipient:
--     "A single row is written per event... made visible to *every*
--     admin/owner of that company". That's a real architectural
--     invariant other code already relies on (the opt-out mechanism
--     in 35 is built entirely around "shared row, per-viewer filter").
--     Retrofitting a single-recipient audience onto that invariant
--     means every future SELECT policy on that table needs an
--     internal OR-branch between "company-wide" and "one recipient
--     only" — exactly the kind of compound RLS logic where a small
--     boolean mistake becomes a cross-tenant or cross-user leak
--     (driver-targeted content shown to unintended admins, or vice
--     versa). A single-audience table has a single-clause policy,
--     which is much easier to get right and keep right as the table
--     evolves.
--   - The existing opt-out preference system (35) was designed for
--     "admin decides they don't want to see X type of event" — that's
--     not an appropriate default for "you have a document waiting for
--     your signature". Keeping the tables separate means that
--     question doesn't even arise; a driver can't accidentally
--     opt out of knowing they need to sign something.
--   - Precedent already exists in this same PRD: document_sends is
--     kept deliberately separate from documents for the identical
--     reason (different audience/lifecycle shape). Same logic here.
--
-- Cost of separating: a few duplicated columns (company_id, message,
-- created_at, read_at) and a second table for future driver-facing
-- notification types to extend. Given DriverNotificationsScreen is
-- currently a stub with zero existing behavior to preserve, there is
-- no compatibility cost either way — this is a clean-slate decision.
--
-- notification_type is a closed list of 1 today (mirrors 35's
-- pattern) — deliberately extensible for whatever admin→driver
-- notification comes next (e.g. a future "signature confirmed" type)
-- without another structural migration.
--
-- source_send_id is optional forward-compat: lets the driver's UI
-- eventually deep-link "tap notification -> open that exact
-- document.send row" without a new column later. Not required by any
-- FR — flagged as a cheap nice-to-have, safe to drop if unwanted.
-- ON DELETE SET NULL because document_sends rows are never deleted in
-- practice (no delete policy exists), but the notification should
-- never become un-insertable/un-deletable because of this pointer if
-- that ever changes.
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
-- (driver_id = auth.uid())" policy (the pattern used elsewhere in
-- this codebase for e.g. driver_details) would let the driver rewrite
-- their own `message`/`notification_type` history, which matters more
-- here than elsewhere because this table doubles as the audit trail
-- proving "the driver was notified to sign document X on date Y".
-- RLS's USING/WITH CHECK cannot restrict individual columns — that's
-- done via a column-level GRANT instead.
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
-- the trigger below (SECURITY DEFINER, owned by the table owner,
-- bypasses RLS the same way log_driver_self_edit()/
-- log_driver_document_upload() already do in this codebase). This is
-- a recommendation, not a hard requirement of the PRD — flag to
-- roi/idan if the extra admin-visible surface isn't wanted; the
-- alternative is simply dropping this one policy.
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
-- Atomicity matters here: the app must never be able to create a
-- document_sends row without the matching driver notification (or
-- vice versa) surviving a crash/network drop between two separate
-- client-side inserts. Every existing notification source in this
-- codebase (25, 28, 31) uses exactly this trigger pattern for the
-- same reason — this is not a new convention, just applying the
-- established one to a second table.
--
-- Reads document_name straight off NEW (no join to document_templates
-- needed — see denormalization note above), so this function has no
-- dependency on document_templates' RLS at all despite running as
-- SECURITY DEFINER.
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
-- Recommendation, not a hard requirement — reusing the existing
-- `documents` bucket under a new path prefix would also technically
-- work for the admin side (its existing "manage own company
-- documents in storage" policy only checks foldername(name)[1] as a
-- company_id, so it already covers any path under {companyId}/...
-- regardless of what comes after). But:
--   1. That bucket's existing DRIVER read policy is hard-coded to the
--      compliance-doc convention (foldername[2] = 'driver',
--      foldername[3] = auth.uid()::text) — broadcast templates have
--      no single owning driver, so this feature needs its own driver
--      storage policy regardless of which bucket it lives in.
--   2. Given that a new policy is required either way, a dedicated
--      bucket keeps the two domains (compliance docs vs. broadcast
--      templates) auditable independently — and given migration 24's
--      own history (this exact bucket's policies were silently
--      missing for a while, breaking every upload undetected), a
--      smaller, single-purpose bucket is easier to verify correct at
--      a glance than one bucket serving two unrelated ownership
--      models.
-- Trade-off: one extra one-time bucket-creation step for roi/idan vs.
-- reusing existing infra. Either is fine; this is my recommendation,
-- not a blocker.
--
-- Path convention: {company_id}/{template_id}/{filename}
--   - company_id first (matches existing convention, lets the admin
--     policy reuse the exact same can_manage_company(foldername[1])
--     shape as the documents bucket).
--   - template_id second, so a driver's storage-read policy can join
--     back to document_sends by exact path match without needing any
--     access to document_templates at all (consistent with the
--     least-privilege decision above).
--
-- IMPORTANT — file_size/mime_type columns above are self-reported
-- client metadata, not authoritative. The actual enforcement of
-- "PDF only, <=10MB" must also be configured on the bucket itself
-- (Supabase Storage bucket-level `file_size_limit` +
-- `allowed_mime_types`), which roi/dor should set at bucket-creation
-- time (not expressible in SQL migration files — done via Studio or
-- the Storage API). The DB constraints above are a second layer, not
-- the only one.
-- ------------------------------------------------------------

-- (Bucket creation itself: `insert into storage.buckets (id, name,
-- public, file_size_limit, allowed_mime_types) values
-- ('signed-documents', 'signed-documents', false, 10485760,
-- array['application/pdf']);` — left as a comment, not executed here,
-- since bucket creation is an infra step roi should run deliberately
-- alongside the SQL migration, the same way 24 did for `documents`.)

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
