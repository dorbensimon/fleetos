// Edge Function: reset-user-password
// Called by the app (owner, or an admin resetting a user in their own
// company) to reset an admin/driver's password directly.
// The user is forced to set their own permanent password on next login (must_change_password=true).

import { corsHeaders } from '../_shared/cors.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, newPassword, companyId } = await req.json();

    if (!userId || !newPassword) {
      return new Response(JSON.stringify({ error: 'חסרים פרטים' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (newPassword.length < 6) {
      return new Response(JSON.stringify({ error: 'הסיסמה חייבת להכיל לפחות 6 תווים' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const verify = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!verify.ok) {
      return new Response(JSON.stringify({ error: verify.error }), {
        status: verify.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { adminClient, callerRole } = verify;

    if (callerRole !== 'owner') {
      const { data: target } = await adminClient
        .from('profiles')
        .select('company_id')
        .eq('id', userId)
        .single();
      if (!target || target.company_id !== companyId) {
        return new Response(JSON.stringify({ error: 'אין הרשאה לבצע פעולה זו' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { error: updateUserError } = await adminClient.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateUserError) {
      return new Response(JSON.stringify({ error: updateUserError.message || 'איפוס הסיסמה נכשל' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await adminClient.from('profiles').update({ must_change_password: true }).eq('id', userId);

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
