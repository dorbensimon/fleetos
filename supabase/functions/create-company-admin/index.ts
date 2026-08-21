// Edge Function: create-company-admin
// Called by the app (owner only) to create a new company + its first admin user.
// Runs with SUPABASE_SERVICE_ROLE_KEY (auto-injected by Supabase), never exposed to the client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'לא מחובר' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // לקוח עם ה-JWT של הקורא, כדי לזהות מי הוא ולוודא שהוא owner
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'לא מחובר' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: callerProfile, error: callerProfileError } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (callerProfileError || callerProfile?.role !== 'owner') {
      return new Response(JSON.stringify({ error: 'אין הרשאה לבצע פעולה זו' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { companyName, logoUrl, adminEmail } = await req.json();

    if (!companyName?.trim() || !adminEmail?.trim()) {
      return new Response(JSON.stringify({ error: 'שם חברה ומייל אדמין הם שדות חובה' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // לקוח עם service_role - עוקף RLS, מבצע את הפעולות הרגישות
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: company, error: companyError } = await adminClient
      .from('companies')
      .insert({ name: companyName.trim(), logo_url: logoUrl?.trim() || null, status: 'active' })
      .select()
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: 'יצירת החברה נכשלה' }), {
        status: 500,
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
      JSON.stringify({ success: true, companyId: company.id, tempPassword }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: 'אירעה שגיאה בלתי צפויה' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
