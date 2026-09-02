// Edge Function: delete-company-vehicle
// Permanently removes one vehicle and its non-FK-owned records/files.

import { corsHeaders } from '../_shared/cors.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'השיטה אינה נתמכת' }, 405);

  try {
    const { vehicleId, companyId } = await req.json();
    const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!access.ok) return json({ error: access.error }, access.status);
    if (!vehicleId) return json({ error: 'חסר מזהה רכב' }, 400);

    const { adminClient } = access;
    const { data: vehicle, error: vehicleError } = await adminClient
      .from('vehicles')
      .select('id, company_id')
      .eq('id', vehicleId)
      .single();
    if (vehicleError || !vehicle || vehicle.company_id !== companyId) {
      return json({ error: 'הרכב לא נמצא בחברה זו' }, 404);
    }

    const { data: documents, error: documentsError } = await adminClient
      .from('documents')
      .select('id, file_path')
      .eq('company_id', companyId)
      .eq('owner_type', 'vehicle')
      .eq('owner_id', vehicleId);
    if (documentsError) return json({ error: 'מחיקת מסמכי הרכב נכשלה' }, 500);

    const paths = (documents ?? []).map((document) => document.file_path).filter(Boolean);

    const { data: deleted, error: deleteError } = await adminClient.rpc(
      'delete_company_vehicle_records',
      { target_vehicle_id: vehicleId, target_company_id: companyId },
    );
    if (deleteError || deleted !== true) return json({ error: 'מחיקת הרכב נכשלה' }, 500);

    // Database records are already gone atomically. A storage failure now
    // leaves only private orphan files, never broken live records.
    let cleanupPending = false;
    if (paths.length) {
      const { error: storageError } = await adminClient.storage.from('documents').remove(paths);
      cleanupPending = !!storageError;
    }

    return json({ success: true, cleanupPending }, 200);
  } catch {
    return json({ error: 'אירעה שגיאה בלתי צפויה' }, 500);
  }
});
