// Edge Function: create-company-driver
//
// Called by a fleet admin (or the platform owner) to add a driver.
// A driver is a real account: an auth.users row, a profiles row with
// role='driver', and a driver_details row with the rest of the file.
//
// Runs with SUPABASE_SERVICE_ROLE_KEY, which is never exposed to the app.

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
    const body = await req.json();
    const { companyId, email, password, fullName, phone, details } = body ?? {};

    const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!access.ok) {
      return json({ error: access.error }, access.status);
    }
    const { adminClient } = access;

    if (!email?.trim() || !password || !fullName?.trim() || !phone?.trim()) {
      return json({ error: 'שם, טלפון, מייל וסיסמה הם שדות חובה' }, 400);
    }
    if (password.length < 6) {
      return json({ error: 'הסיסמה חייבת להכיל לפחות 6 תווים' }, 400);
    }

    const { data: newUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
    });

    if (createUserError || !newUser.user) {
      return json({ error: createUserError?.message || 'יצירת המשתמש נכשלה' }, 500);
    }

    const driverId = newUser.user.id;

    const { error: profileError } = await adminClient.from('profiles').insert({
      id: driverId,
      role: 'driver',
      company_id: companyId,
      full_name: fullName.trim(),
      phone: phone.trim(),
      must_change_password: true,
    });

    if (profileError) {
      await adminClient.auth.admin.deleteUser(driverId);
      return json({ error: 'יצירת פרופיל הנהג נכשלה' }, 500);
    }

    const { error: detailsError } = await adminClient.from('driver_details').insert({
      id: driverId,
      company_id: companyId,
      ...(details ?? {}),
    });

    if (detailsError) {
      // Roll the whole thing back so a half-created driver never lingers.
      await adminClient.from('profiles').delete().eq('id', driverId);
      await adminClient.auth.admin.deleteUser(driverId);
      return json({ error: detailsError.message || 'שמירת פרטי הנהג נכשלה' }, 500);
    }

    return json({ success: true, driverId }, 200);
  } catch {
    return json({ error: 'אירעה שגיאה בלתי צפויה' }, 500);
  }
});
