// Edge Function: delete-company-drivers
//
// Explicit, separate bulk action: permanently deletes EVERY driver in a
// company (Auth user + profile row for each). This is intentionally NOT a
// side effect of deleting the company's admin (see delete-company-user) —
// it must be triggered on purpose, by an admin/owner who explicitly chose
// "delete all drivers" and confirmed it client-side.
//
// Callable by the platform owner, or by an admin of the target company
// (verifyCompanyAccess). Irreversible.

import { corsHeaders } from '../_shared/cors.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') return json({ error: 'השיטה אינה נתמכת' }, 405);

  try {
    const { companyId, confirm } = await req.json();

    const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!access.ok) {
      return json({ error: access.error }, access.status);
    }
    const { adminClient } = access;

    // Defense in depth: the client-side confirmation dialog is not enough
    // on its own — the caller must also pass an explicit flag, so this
    // endpoint can never be hit by an accidental/generic "delete" call
    // that only meant to remove a single admin or driver.
    if (confirm !== true) {
      return json({ error: 'נדרש אישור מפורש למחיקת כל הנהגים' }, 400);
    }

    const { data: drivers, error: driversError } = await adminClient
      .from('profiles')
      .select('id')
      .eq('role', 'driver')
      .eq('company_id', companyId);

    if (driversError) {
      return json({ error: 'שליפת רשימת הנהגים נכשלה' }, 500);
    }

    const targets = drivers ?? [];
    let deletedCount = 0;
    const failedIds: string[] = [];

    // Sequential on purpose: deleting auth.users cascades to profiles and all
    // dependent driver rows. A partial failure (e.g. one admin API call erroring)
    // must not abort deletion of the rest — we report a summary instead of
    // failing the whole batch on a single bad row.
    //
    // Each driver goes through the same atomic cleanup as the single-driver
    // path (delete-company-driver), so documents, compliance items and the
    // files behind them are removed rather than orphaned. `require_archived`
    // is false here: this action is company-wide and confirmed on its own,
    // and has no per-driver archive step to pass through.
    const storagePaths: string[] = [];
    for (const driver of targets) {
      const { data: records, error: recordsError } = await adminClient.rpc(
        'delete_company_driver_records',
        {
          target_driver_id: driver.id,
          target_company_id: companyId,
          acting_admin_id: access.callerId,
          require_archived: false,
        }
      );
      if (recordsError || !(records as { ok?: boolean } | null)?.ok) {
        failedIds.push(driver.id);
        continue;
      }
      storagePaths.push(...((records as { storage_paths?: string[] }).storage_paths ?? []));

      const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(driver.id);
      if (authDeleteError) {
        failedIds.push(driver.id);
        continue;
      }

      deletedCount += 1;
    }

    // After the rows, never before: a storage failure may leave an
    // unreachable orphan file, never a live row pointing at a missing one.
    if (storagePaths.length > 0) {
      const { error: storageError } = await adminClient.storage.from('documents').remove(storagePaths);
      if (storageError) console.error('failed to remove driver files from storage');
    }

    return json(
      {
        success: true,
        deletedCount,
        totalCount: targets.length,
        failedIds,
      },
      200
    );
  } catch {
    return json({ error: 'אירעה שגיאה בלתי צפויה' }, 500);
  }
});
