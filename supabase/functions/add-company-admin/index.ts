// Edge Function: add-company-admin
// Called by the app (owner only) to add another admin to an existing company.

import { corsHeaders } from '../_shared/cors.ts';
import { verifyOwner } from '../_shared/verifyOwner.ts';
import { generateTempPassword } from '../_shared/password.ts';

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

    const { companyId, adminEmail } = await req.json();

    if (!companyId || !adminEmail?.trim()) {
      return new Response(JSON.stringify({ error: 'חסרים פרטים' }), {
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

    const tempPassword = generateTempPassword();

    const { data: newUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: adminEmail.trim(),
      password: tempPassword,
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
      must_change_password: true,
    });

    if (profileInsertError) {
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      return new Response(JSON.stringify({ error: 'יצירת פרופיל האדמין נכשלה' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, tempPassword }), {
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
