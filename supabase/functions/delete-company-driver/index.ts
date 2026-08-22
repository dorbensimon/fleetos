// Edge Function: delete-company-driver
//
// Called by a fleet admin (or the platform owner) to permanently remove
// one driver: Auth user + profile row (driver_details cascades via FK).
// Irreversible.

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

    const { data: target, error: targetError } = await adminClient
      .from('profiles')
      .select('role, company_id')
      .eq('id', driverId)
      .single();

    if (targetError || !target || target.role !== 'driver' || target.company_id !== companyId) {
      return json({ error: 'הנהג לא נמצא בחברה זו' }, 404);
    }

    await adminClient.from('profiles').delete().eq('id', driverId);
    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(driverId);

    if (deleteUserError) {
      return json({ error: 'מחיקת הנהג נכשלה' }, 500);
    }

    return json({ success: true }, 200);
  } catch {
    return json({ error: 'אירעה שגיאה בלתי צפויה' }, 500);
  }
});
