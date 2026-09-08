// Edge Function: delete-company-driver
//
// Permanently removes one archived driver and everything the app holds
// about them. Reachable only from the driver archive: the driver must
// already be archived (enforced in the database, not just by the UI), so
// there is always an intermediate, reversible step before this one.
//
// Order matters:
//   1. delete_company_driver_records() — one transaction that removes the
//      driver's documents, compliance items and driver_details row, closes
//      their vehicle-assignment history (kept, with the name snapshot) and
//      returns the storage paths that back the deleted rows.
//   2. Delete the Auth user — cascades profiles, and with it signature
//      requests, notifications and notification preferences.
//   3. Delete the storage files. Last on purpose: a failure here leaves an
//      unreachable orphan file, never a live row pointing at a missing one.
//
// The signed documents themselves remain in DocuSeal, which is the system
// of record for signatures. FleetOS simply stops holding a copy.
// Irreversible.

import { corsHeaders } from '../_shared/cors.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

type DeleteRecordsResult = {
  ok: boolean;
  reason?: 'not_found' | 'not_archived';
  driver_name?: string | null;
  storage_paths?: string[];
  already_cleaned?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') return json({ error: 'השיטה אינה נתמכת' }, 405);

  try {
    const { driverId, companyId } = await req.json();

    const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!access.ok) {
      return json({ error: access.error }, access.status);
    }
    const { adminClient } = access;

    if (!driverId) {
      return json({ error: 'חסר מזהה נהג' }, 400);
    }
    if (driverId === access.callerId) {
      return json({ error: 'לא ניתן למחוק את המשתמש שלך' }, 400);
    }

    const { data: target, error: targetError } = await adminClient
      .from('profiles')
      .select('role, company_id')
      .eq('id', driverId)
      .single();

    let authDeletionNeeded = true;
    if (targetError || !target) {
      // The database phase may have succeeded before Auth or Storage failed.
      // In that case the profile is already gone, but the private tombstone
      // lets this retry finish the remaining cleanup safely.
      const { data: tombstone, error: tombstoneError } = await adminClient
        .from('driver_deletion_tombstones')
        .select('driver_id')
        .eq('driver_id', driverId)
        .eq('company_id', companyId)
        .maybeSingle();
      if (tombstoneError || !tombstone) return json({ error: 'הנהג לא נמצא בחברה זו' }, 404);
      authDeletionNeeded = false;
    } else if (target.role !== 'driver' || target.company_id !== companyId) {
      return json({ error: 'הנהג לא נמצא בחברה זו' }, 404);
    }

    const { data: records, error: recordsError } = await adminClient.rpc(
      'delete_company_driver_records',
      { target_driver_id: driverId, target_company_id: companyId, acting_admin_id: access.callerId }
    );
    if (recordsError) {
      return json({ error: 'מחיקת נתוני הנהג נכשלה' }, 500);
    }

    const result = records as DeleteRecordsResult | null;
    if (!result?.ok) {
      if (result?.reason === 'not_archived') {
        return json({ error: 'ניתן למחוק לצמיתות רק נהג שנמצא בארכיון' }, 409);
      }
      return json({ error: 'הנהג לא נמצא בחברה זו' }, 404);
    }

    // profiles.id references auth.users(id) ON DELETE CASCADE, so this one
    // call also removes the profile and everything still hanging off it. If a
    // prior retry already reached this stage, only the idempotent storage
    // cleanup below remains.
    if (authDeletionNeeded) {
      const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(driverId);
      if (deleteUserError) {
        return json({ error: 'מחיקת חשבון הנהג נכשלה' }, 500);
      }
    }

    const storagePaths = result.storage_paths ?? [];
    if (storagePaths.length > 0) {
      const { error: storageError } = await adminClient.storage.from('documents').remove(storagePaths);
      // The rows are already gone, so the deletion itself succeeded — a
      // storage error here is worth logging, not worth failing the request.
      if (storageError) console.error('failed to remove driver files from storage');
    }

    return json({ success: true, deletedFiles: storagePaths.length }, 200);
  } catch {
    return json({ error: 'אירעה שגיאה בלתי צפויה' }, 500);
  }
});
