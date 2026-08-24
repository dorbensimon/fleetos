-- ============================================================
-- 32_driver_details_documents_company_guard.sql
--
-- Closes two multi-tenant isolation gaps found (and, for the first
-- one, confirmed live) by roi's backend audit — see
-- `.claude/roi-findings.md`:
--
-- 1. `driver_details` self-update policy (25) has no column-level
--    restriction, so a driver could UPDATE their own
--    `driver_details.company_id`/`department_id` to any value and
--    pass RLS unchecked (confirmed live: the attempt was blocked only
--    by the `company_id` foreign key on a nonexistent uuid, i.e. with
--    a real target company it would succeed). Mirrors
--    `prevent_privilege_escalation()` on `profiles` (22), but as a
--    `before update` trigger — the only mechanism that can restrict
--    individual columns inside a `for update` RLS policy in Postgres.
--
--    Unlike `profiles`, `driver_details.department_id` self-edit is
--    an intentional existing feature (25) — a driver can change their
--    own department. We keep that working, but only within their own
--    company: `department_id` must resolve to a department whose
--    `company_id` matches the (unchanged) `driver_details.company_id`.
--    `company_id` itself can never be changed by a non-manager.
--
--    Admins/owner (`can_manage_company(old.company_id)`) are
--    unaffected — they can still freely reassign company_id (e.g.
--    company transfer) and department_id, as before.
--
-- 2. `documents` self-service policy (22) has no `company_id` guard,
--    so a driver could INSERT/UPDATE a document row with
--    `owner_type='driver'`, `owner_id=auth.uid()` (passes) but an
--    arbitrary `company_id` belonging to another company. Adds a
--    `company_id = current_company_id()` check to the existing
--    `with check`, and (defense in depth) verifies that
--    `compliance_item_id`, when set, actually belongs to the caller
--    and the same company — closing the same class of gap the
--    trigger in 30 already closed for the notification side-effect.
-- ============================================================


-- ------------------------------------------------------------
-- 1. driver_details: block cross-company company_id/department_id
--    changes by non-managers (i.e. the driver themself).
-- ------------------------------------------------------------

create or replace function public.prevent_driver_details_company_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.can_manage_company(old.company_id) then
    return new;
  end if;

  -- Caller is not an admin/owner of the row's current company — i.e.
  -- this is the driver editing their own row. company_id can never
  -- move; department_id may only move within the same company.
  if new.company_id is distinct from old.company_id then
    raise exception 'לא ניתן לשנות שיוך לחברה';
  end if;

  if new.department_id is distinct from old.department_id
     and new.department_id is not null
     and not exists (
       select 1 from public.departments d
       where d.id = new.department_id
         and d.company_id = old.company_id
     ) then
    raise exception 'לא ניתן לשייך למחלקה שאינה בחברה שלך';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_driver_details_company_escalation on public.driver_details;
create trigger trg_prevent_driver_details_company_escalation
  before update on public.driver_details
  for each row
  execute function public.prevent_driver_details_company_escalation();


-- ------------------------------------------------------------
-- 2. documents: add company_id (+ compliance_item_id ownership)
--    guard to the driver self-service policy.
-- ------------------------------------------------------------

drop policy if exists "driver manages own documents" on public.documents;

create policy "driver manages own documents"
  on public.documents
  for all
  using (
    owner_type = 'driver'
    and owner_id = auth.uid()
    and company_id = public.current_company_id()
  )
  with check (
    owner_type = 'driver'
    and owner_id = auth.uid()
    and company_id = public.current_company_id()
    and (
      compliance_item_id is null
      or exists (
        select 1 from public.compliance_items ci
        where ci.id = compliance_item_id
          and ci.owner_type = 'driver'
          and ci.owner_id = auth.uid()
          and ci.company_id = public.current_company_id()
      )
    )
  );
