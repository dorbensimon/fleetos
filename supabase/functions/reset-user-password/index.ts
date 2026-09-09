// Edge Function: reset-user-password
// Called by the app (owner, or an admin resetting a user in their own
// company) to reset an admin/driver's password directly.
// The user is forced to set their own permanent password on next login (must_change_password=true).

import { corsHeaders } from '../_shared/cors.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';
import { isValidTemporaryPassword, mayManageAccount } from '../_shared/accountSecurity.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'השיטה אינה נתמכת' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const { userId, newPassword, companyId } = await req.json();

    if (!userId || typeof newPassword !== 'string') {
      return new Response(JSON.stringify({ error: 'חסרים פרטים' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!isValidTemporaryPassword(newPassword)) {
      return new Response(JSON.stringify({ error: 'הסיסמה חייבת להכיל לפחות 4 ספרות בלבד' }), {
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
    const { data: target, error: targetError } = await adminClient
      .from('profiles')
      .select('role, company_id')
      .eq('id', userId)
      .single();
    if (
      targetError || !target ||
      !mayManageAccount(callerRole, target.role, target.company_id, companyId)
    ) {
      return new Response(JSON.stringify({ error: 'אין הרשאה לבצע פעולה זו' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark the account pending before changing Auth. This guarantees that a
    // newly-issued temporary password is never active while the profile says
    // setup is complete. The timestamp also acts as a compare-and-set version
    // for a concurrent complete-password-setup call.
    const issuedAt = new Date().toISOString();
    const { error: pendingError } = await adminClient
      .from('profiles')
      .update({ must_change_password: true, password_set_at: issuedAt })
      .eq('id', userId);
    if (pendingError) {
      return new Response(JSON.stringify({ error: 'סימון החשבון לאיפוס נכשל' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: updateUserError } = await adminClient.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateUserError) {
      // Keep the account pending. Rolling this marker back can race another
      // successful reset and expose its temporary password as fully activated.
      return new Response(JSON.stringify({
        error: 'איפוס הסיסמה נכשל. החשבון נשאר חסום עד להשלמת החלפת סיסמה',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Advance the reset version after Auth accepted the temporary password.
    // A concurrent complete-password-setup call can only clear the version it
    // originally read; changing it here makes that compare-and-set fail. If
    // completion cleared the flag just before this update, this also restores
    // the pending gate. The extra millisecond guarantees a distinct version
    // even when both timestamps are created in the same clock tick.
    const finalizedAt = new Date(Date.parse(issuedAt) + 1).toISOString();
    const { error: finalizedError } = await adminClient
      .from('profiles')
      .update({ must_change_password: true, password_set_at: finalizedAt })
      .eq('id', userId)
      .eq('password_set_at', issuedAt);
    if (finalizedError) {
      return new Response(JSON.stringify({
        error: 'הסיסמה אופסה, אך אימות חסימת החשבון נכשל. יש לנסות שוב לפני מסירת הסיסמה',
      }), {
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
