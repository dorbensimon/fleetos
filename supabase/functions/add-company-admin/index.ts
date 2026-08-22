// Edge Function: add-company-admin
// Called by the app (owner only) to add another admin to an existing company.
// The owner chooses the admin's password directly (no random temp password).

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

    const { companyId, adminFirstName, adminLastName, adminEmail, adminPassword, adminPhone } =
      await req.json();

    if (
      !companyId ||
      !adminFirstName?.trim() ||
      !adminLastName?.trim() ||
      !adminEmail?.trim() ||
      !adminPassword ||
      !adminPhone?.trim()
    ) {
      return new Response(
        JSON.stringify({ error: 'שם פרטי ומשפחה, מייל, טלפון וסיסמת אדמין הם שדות חובה' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (adminPassword.length < 6) {
      return new Response(JSON.stringify({ error: 'הסיסמה חייבת להכיל לפחות 6 תווים' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: company, error: companyError } = await adminClient
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: 'החברה לא נמצאה' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: newUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: adminEmail.trim(),
      password: adminPassword,
      email_confirm: true,
    });

    if (createUserError || !newUser.user) {
      return new Response(
        JSON.stringify({ error: createUserError?.message || 'יצירת המשתמש נכשלה' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: profileInsertError } = await adminClient.from('profiles').insert({
      id: newUser.user.id,
      role: 'admin',
      company_id: companyId,
      full_name: `${adminFirstName.trim()} ${adminLastName.trim()}`.trim(),
      phone: adminPhone.trim(),
      must_change_password: true,
    });

    if (profileInsertError) {
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      return new Response(JSON.stringify({ error: 'יצירת פרופיל האדמין נכשלה' }), {
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
