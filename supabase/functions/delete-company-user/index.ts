// Edge Function: delete-company-user
// Called by the app (owner only) to fully remove an admin/driver: Auth user + profile row.
// Deleting an admin cascades: every driver in that admin's company is
// permanently deleted too, since a company with no admin can't be managed.
// Irreversible.

import { corsHeaders } from '../_shared/cors.ts';
import { verifyOwner } from '../_shared/verifyOwner.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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

    const { data: target } = await adminClient
      .from('profiles')
      .select('role, company_id')
      .eq('id', userId)
      .single();

    if (target?.role === 'admin' && target.company_id) {
      const { data: drivers } = await adminClient
        .from('profiles')
        .select('id')
        .eq('role', 'driver')
        .eq('company_id', target.company_id);

      for (const driver of drivers ?? []) {
        await adminClient.from('profiles').delete().eq('id', driver.id);
        await adminClient.auth.admin.deleteUser(driver.id);
      }
    }

    await adminClient.from('profiles').delete().eq('id', userId);
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
