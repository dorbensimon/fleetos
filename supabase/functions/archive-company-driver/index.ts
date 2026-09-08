// Edge Function: archive-company-driver
//
// Moves one driver to the archive. Archiving is not just a list filter —
// it revokes the driver's access to the app:
//   * driver_details.status = 'archived' (+ who archived it, and when)
//   * the Auth user is banned, so no new login and no token refresh
//   * existing Auth sessions are dropped, so a driver already inside the
//     app cannot renew their session
//   * active vehicle assignments are closed, so an archived driver never
//     shows up as the current driver of a vehicle
//
// Reversible — see restore-company-driver.

import { corsHeaders } from '../_shared/cors.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';

// Effectively permanent; lifted explicitly on restore.
const BAN_DURATION = '876000h';

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
    // An admin/owner archiving themselves would lock themselves out of the
    // very screen they are standing on.
    if (driverId === access.callerId) return json({ error: 'לא ניתן להעביר את עצמך לארכיון' }, 400);

    const { data: target } = await adminClient
      .from('profiles')
      .select('role, company_id')
      .eq('id', driverId)
      .single();
    if (!target || target.role !== 'driver' || target.company_id !== companyId) {
      return json({ error: 'הנהג לא נמצא בחברה זו' }, 404);
    }

    // Status, vehicle assignments and pending reminders move together in a
    // single transaction — a driver marked archived while a vehicle still
    // lists them as its active driver is the one state worth preventing.
    // The RPC also attributes the change to this admin in the activity log,
    // which the service role could not do on its own.
    const { data: archived, error: archiveError } = await adminClient.rpc(
      'archive_company_driver_record',
      { target_driver_id: driverId, target_company_id: companyId, acting_admin_id: access.callerId }
    );
    if (archiveError) return json({ error: 'העברת הנהג לארכיון נכשלה' }, 500);
    if (!(archived as { ok?: boolean } | null)?.ok) {
      return json({ error: 'הנהג לא נמצא בחברה זו' }, 404);
    }

    const { error: banError } = await adminClient.auth.admin.updateUserById(driverId, {
      ban_duration: BAN_DURATION,
    });
    if (banError) return json({ error: 'חסימת גישת הנהג לאפליקציה נכשלה' }, 500);

    // A ban blocks the next refresh; dropping the sessions revokes the
    // refresh token the driver is already holding.
    const { error: revokeError } = await adminClient.rpc('revoke_user_sessions', {
      target_user_id: driverId,
    });
    if (revokeError) console.error('failed to revoke driver sessions on archive');

    return json({ success: true }, 200);
  } catch {
    return json({ error: 'אירעה שגיאה בלתי צפויה' }, 500);
  }
});
