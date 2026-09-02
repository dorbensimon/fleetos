// Edge Function: get-user-email
//
// Returns one user's login email. Client-side queries can't reach
// auth.users, so an admin (or the owner) viewing a driver/admin's
// details goes through this instead.

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
    const { userId, companyId } = await req.json();

    if (!userId) {
      return json({ error: 'חסר מזהה משתמש' }, 400);
    }

    const verify = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!verify.ok) {
      return json({ error: verify.error }, verify.status);
    }
    const { adminClient, callerRole } = verify;

    if (callerRole !== 'owner') {
      const { data: target } = await adminClient
        .from('profiles')
        .select('company_id')
        .eq('id', userId)
        .single();
      if (!target || target.company_id !== companyId) {
        return json({ error: 'אין הרשאה לבצע פעולה זו' }, 403);
      }
    }

    const { data, error } = await adminClient.auth.admin.getUserById(userId);
    if (error || !data.user) {
      return json({ error: 'המשתמש לא נמצא' }, 404);
    }

    return json({ success: true, email: data.user.email ?? null }, 200);
  } catch {
    return json({ error: 'אירעה שגיאה בלתי צפויה' }, 500);
  }
});
