// Edge Function: update-user-email
//
// Called by an admin (or the owner) to correct a driver/admin's login
// email — e.g. a typo made at creation time, with no other way to fix it
// since DriverFormScreen only exposes the email field on create, not edit.
//
// email_confirm: true skips Supabase's confirmation-email step, matching
// how create-company-driver and create-company-admin create accounts —
// this app has no outbound email flow to deliver such a link through.

import { corsHeaders } from '../_shared/cors.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';
import { mayManageAccount } from '../_shared/accountSecurity.ts';

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
    const { userId, newEmail, companyId } = await req.json();

    if (!userId || typeof newEmail !== 'string' || !newEmail.trim()) {
      return json({ error: 'חסרים פרטים' }, 400);
    }

    const verify = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!verify.ok) {
      return json({ error: verify.error }, verify.status);
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
      return json({ error: 'אין הרשאה לבצע פעולה זו' }, 403);
    }

    const normalizedEmail = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return json({ error: 'כתובת מייל לא תקינה' }, 400);
    }

    const { error: updateUserError } = await adminClient.auth.admin.updateUserById(userId, {
      email: normalizedEmail,
      email_confirm: true,
    });

    if (updateUserError) {
      const message = updateUserError.message || '';
      const emailTaken = /already been registered|already registered|email_exists/i.test(message);
      return json(
        { error: emailTaken ? 'כתובת המייל הזו כבר רשומה במערכת' : message || 'עדכון המייל נכשל' },
        emailTaken ? 409 : 500
      );
    }

    return json({ success: true }, 200);
  } catch {
    return json({ error: 'אירעה שגיאה בלתי צפויה' }, 500);
  }
});
