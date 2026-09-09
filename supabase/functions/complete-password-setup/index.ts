// Edge Function: complete-password-setup
//
// Called by a user (driver/admin/owner) the first time they log in with a
// temporary password assigned by an admin, or after an admin-triggered
// reset. Sets the user's own new password AND clears must_change_password
// in one server-side step.
//
// This must be a server-side step, not two separate client calls: the
// client cannot be trusted to only clear the flag after actually setting a
// new password, and a database trigger (see 71_lock_must_change_password_column.sql)
// now rejects any attempt to change must_change_password that doesn't come
// from the service role — which only this function (and admin-initiated
// resets) use.
//
// Runs with SUPABASE_SERVICE_ROLE_KEY, never exposed to the app.

import { corsHeaders } from '../_shared/cors.ts';
import { verifyUser } from '../_shared/verifyUser.ts';

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
    const { newPassword } = await req.json();

    if (!newPassword || typeof newPassword !== 'string') {
      return json({ error: 'חסרה סיסמה חדשה' }, 400);
    }
    if (newPassword.length < 8) {
      return json({ error: 'הסיסמה חייבת להכיל לפחות 8 תווים' }, 400);
    }

    const verify = await verifyUser(req.headers.get('Authorization'), {
      allowPendingPasswordSetup: true,
    });
    if (!verify.ok) {
      return json({ error: verify.error }, verify.status);
    }
    const { adminClient, userId } = verify;

    const { data: passwordState, error: passwordStateError } = await adminClient
      .from('profiles')
      .select('password_set_at')
      .eq('id', userId)
      .single();
    if (passwordStateError || !passwordState?.password_set_at) {
      return json({ error: 'בדיקת מצב הסיסמה נכשלה. נסה שוב' }, 500);
    }

    // Compare against the existing bcrypt hash without creating a real Auth
    // session or consuming the password-login rate limit. The RPC is callable
    // only by service_role (migration 74).
    const { data: samePassword, error: samePasswordError } = await adminClient.rpc(
      'auth_password_matches',
      { target_user_id: userId, candidate_password: newPassword },
    );
    if (samePasswordError || typeof samePassword !== 'boolean') {
      console.error('complete-password-setup password comparison failed', samePasswordError?.message);
      return json({ error: 'לא ניתן לאמת שהסיסמה החדשה שונה. נסה שוב' }, 503);
    }
    if (samePassword) {
      return json({ error: 'הסיסמה החדשה חייבת להיות שונה מהסיסמה הנוכחית' }, 400);
    }

    const { error: updateUserError } = await adminClient.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (updateUserError) {
      return json({ error: updateUserError.message || 'עדכון הסיסמה נכשל' }, 500);
    }

    const { data: updatedProfile, error: profileError } = await adminClient
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', userId)
      .eq('password_set_at', passwordState.password_set_at)
      .select('id')
      .maybeSingle();

    if (profileError || !updatedProfile) {
      // The password itself changed successfully; only the flag failed to
      // clear. Say so plainly — the old temporary password no longer works,
      // so "try again" without qualification would be misleading.
      console.error(
        'complete-password-setup profile update failed',
        profileError?.message ?? 'password state changed concurrently',
      );
      return json(
        {
          error:
            'הסיסמה עודכנה בהצלחה, אך סימון הסטטוס נכשל. נסה להתחבר עם הסיסמה החדשה שקבעת',
        },
        500
      );
    }

    return json({ success: true }, 200);
  } catch {
    return json({ error: 'אירעה שגיאה בלתי צפויה' }, 500);
  }
});
