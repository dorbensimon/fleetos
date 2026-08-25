# Supabase: migrations & Edge Functions process

This project (Tolvex on Supabase, project id `lnflftptzrfuzfecmhho`) has no local
Supabase stack — `supabase/sql/*.sql` and `supabase/functions/*` are applied directly
to the hosted project via the Supabase MCP tools, not via the Supabase CLI's local
dev loop. That makes the local repo the only durable record of what's live — the
rules below exist to keep it that way.

## Migrations (`supabase/sql/`)

1. Mika (DBA agent) writes the migration as a new numbered file in `supabase/sql/`
   (e.g. `41_something.sql`), following the numbering already in the directory.
   Idempotent where practical (`create table if not exists`, `drop policy if exists`
   before `create policy`, etc.) so it's safe to re-run.
2. Roi (Backend agent) reviews it, then applies it via the Supabase MCP
   `apply_migration` tool — only after Dor approves (per `AGENTS.md`: no production
   DB write without explicit approval).
3. **Every migration applied to the live project must have a matching local file**,
   committed in the same change. If a migration (or a rollback of one) is applied
   directly through the SQL editor / MCP without a local file to match, `supabase/sql/`
   silently drifts from production — this already happened once (the
   `documents_broadcast_schema` migration was applied and then fully reverted live;
   the revert itself was never captured as a local `.sql` file). Before trusting
   `supabase/sql/` as ground truth, cross-check it against the live migration history:

   ```
   mcp: list_migrations (project_id: lnflftptzrfuzfecmhho)
   ```

4. After any schema change, re-run the security/perf advisors and fix anything new:

   ```
   mcp: get_advisors (project_id, type: security)
   mcp: get_advisors (project_id, type: performance)
   ```

## Edge Functions (`supabase/functions/`)

Nine functions live under `supabase/functions/*/index.ts`, sharing two auth helpers
in `supabase/functions/_shared/`:
- `verifyOwner.ts` — caller must be the platform owner.
- `verifyCompanyAccess.ts` — caller must be the owner, or an admin of the target company.

Every function must call one of these **before** touching the service-role client —
that's the whole security model for these endpoints, since the service role bypasses
RLS entirely.

### Local verification

`tsconfig.json` excludes `supabase/functions/**` on purpose — it's Deno code (global
`Deno.serve`/`Deno.env`, `https://esm.sh/...` URL imports), not Node, and `tsc` can't
type it. Deno itself can, via its own type checker:

```bash
npm run typecheck:functions   # deno check supabase/functions/*/index.ts
```

This now also runs in CI (`.github/workflows/ci.yml`, `edge-functions` job) on every
PR and push to `main`, so a function with a type error can't merge silently.

### Review checklist before deploying a function

- [ ] Calls `verifyOwner`/`verifyCompanyAccess` first, and checks `.ok` before using
      `adminClient`.
- [ ] Returns the shared `corsHeaders` on every response, including the `OPTIONS`
      preflight branch and the catch-all error branch.
- [ ] Client-facing error messages are in Hebrew and don't leak internals (stack
      traces, SQL errors) — the existing functions parse Supabase's `error.context`
      only server-side and return a clean `{ error: string }`.
- [ ] `npm run typecheck:functions` passes locally.

### Deploying

Deploy via the Supabase MCP `deploy_edge_function` tool, after Dor's approval (same
production-write rule as migrations — see `AGENTS.md`).

## Environments

There is currently **one** Supabase project (Tolvex, `lnflftptzrfuzfecmhho`), used for
every build profile — development, preview, and production all point at the same
live database. `lib/supabase.ts` reads its URL/anon key from
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (falling back to the
current project's values if unset), and `eas.json` sets those per build profile.

This is a deliberate, temporary decision (Dor, 2026-08-26): don't stand up a separate
staging project yet, but keep the wiring in place so adding one later is a small change,
not a refactor. To add a real staging environment when the time comes:

1. Create a new Supabase project for staging.
2. Add its URL/anon key as a new `staging` profile's `env` block in `eas.json`
   (copy the `preview` profile as a starting point).
3. Point that profile's builds at the staging project instead of production.

No code changes should be needed beyond that — the env-var indirection is already there.
