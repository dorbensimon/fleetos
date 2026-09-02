// Edge Function: delete-company-user
// Called by the app (owner only) to fully remove a single admin or driver
// account: Auth user + profile row. Deleting an admin does NOT delete the
// drivers in their company, and does NOT delete the company itself — the
// company can simply be left temporarily without an admin (the owner can
// add a new one later via add-company-admin). Deleting all of a company's
// drivers is a separate, explicit action — see delete-company-drivers.
// Irreversible.

import { corsHeaders } from '../_shared/cors.ts';
import { verifyOwner } from '../_shared/verifyOwner.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'השיטה אינה נתמכת' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const verify = await verifyOwner(req.headers.get('Authorization'));
    if (!verify.ok) {
      return new Response(JSON.stringify({ error: verify.error }), {
        status: verify.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { adminClient } = verify;

    const { userId } = await req.json();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'חסר מזהה משתמש' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: target, error: targetError } = await adminClient
      .from('profiles')
      .select('role, company_id')
      .eq('id', userId)
      .single();

    if (targetError || !target) {
      return new Response(JSON.stringify({ error: 'המשתמש לא נמצא' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Deletes only this one account. Drivers in the same company (if
    // `target` is an admin) are intentionally left untouched — see
    // delete-company-drivers for the separate, explicit bulk action.
    // profiles.id cascades from auth.users.id, so one Auth deletion removes
    // both records without a failure window between two separate writes.
    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      return new Response(JSON.stringify({ error: 'מחיקת המשתמש נכשלה' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'אירעה שגיאה בלתי צפויה' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
