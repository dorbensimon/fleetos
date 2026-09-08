// Edge Function: restore-company-driver
//
// The exact inverse of archive-company-driver: brings a driver back to
// 'active' and lifts the Auth ban, so they can log in again. Vehicle
// assignments are NOT restored — they were closed on archive and are
// history now; the admin re-assigns a vehicle deliberately.

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
    const { driverId, companyId } = await req.json();

    const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!access.ok) return json({ error: access.error }, access.status);
    const { adminClient } = access;

    if (!driverId) return json({ error: 'חסר מזהה נהג' }, 400);

    const { data: target } = await adminClient
      .from('profiles')
      .select('role, company_id')
      .eq('id', driverId)
      .single();
    if (!target || target.role !== 'driver' || target.company_id !== companyId) {
      return json({ error: 'הנהג לא נמצא בחברה זו' }, 404);
    }

    // Make the database record active while Auth is still banned. That short
    // interim state is safe; the reverse order can leave an archived driver
    // authenticated if the database call fails after unbanning them.
    const { data: restored, error: statusError } = await adminClient.rpc(
      'restore_company_driver_record',
      { target_driver_id: driverId, target_company_id: companyId, acting_admin_id: access.callerId }
    );
    if (statusError) return json({ error: 'שחזור הנהג מהארכיון נכשל' }, 500);
    if (!(restored as { ok?: boolean } | null)?.ok) {
      return json({ error: 'הנהג לא נמצא בחברה זו' }, 404);
    }

    const { error: unbanError } = await adminClient.auth.admin.updateUserById(driverId, {
      ban_duration: 'none',
    });
    if (!unbanError) return json({ success: true }, 200);

    // Auth failed after the local restore. Compensate immediately so the
    // driver remains locked out rather than becoming an archived-but-active
    // account. The admin can safely retry the restore afterward.
    const { error: rollbackError } = await adminClient.rpc(
      'archive_company_driver_record',
      { target_driver_id: driverId, target_company_id: companyId, acting_admin_id: access.callerId }
    );
    if (rollbackError) console.error('restore-company-driver rollback failed');
    return json({ error: 'ביטול חסימת הנהג נכשל' }, 500);
  } catch {
    return json({ error: 'אירעה שגיאה בלתי צפויה' }, 500);
  }
});
