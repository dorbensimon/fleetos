// Edge Function: create-company-admin
// Called by the app (owner only) to create a new company + its first admin user.
// The owner chooses the admin's password directly (no random temp password).
// Runs with SUPABASE_SERVICE_ROLE_KEY (auto-injected by Supabase), never exposed to the client.

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

    const {
      companyName,
      logoUrl,
      companyType,
      businessId,
      adminFirstName,
      adminLastName,
      adminEmail,
      adminPassword,
      adminPhone,
    } = await req.json();

    if (
      !companyName?.trim() ||
      !adminFirstName?.trim() ||
      !adminLastName?.trim() ||
      !adminEmail?.trim() ||
      !adminPassword ||
      !adminPhone?.trim()
    ) {
      return new Response(
        JSON.stringify({ error: 'שם חברה, שם פרטי ומשפחה, מייל וסיסמת אדמין הם שדות חובה' }),
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
      .insert({
        name: companyName.trim(),
        logo_url: logoUrl?.trim() || null,
        company_type: companyType || null,
        business_id: businessId?.trim() || null,
        status: 'active',
      })
      .select()
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: 'יצירת החברה נכשלה' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: newUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: adminEmail.trim(),
      password: adminPassword,
      email_confirm: true,
    });

    if (createUserError || !newUser.user) {
      await adminClient.from('companies').delete().eq('id', company.id);
      return new Response(
        JSON.stringify({ error: createUserError?.message || 'יצירת משתמש האדמין נכשלה' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: profileInsertError } = await adminClient.from('profiles').insert({
      id: newUser.user.id,
      role: 'admin',
      company_id: company.id,
      full_name: `${adminFirstName.trim()} ${adminLastName.trim()}`.trim(),
      phone: adminPhone.trim(),
      must_change_password: true,
    });

    if (profileInsertError) {
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      await adminClient.from('companies').delete().eq('id', company.id);
      return new Response(JSON.stringify({ error: 'יצירת פרופיל האדמין נכשלה' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ success: true, companyId: company.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(JSON.stringify({ error: 'אירעה שגיאה בלתי צפויה' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
