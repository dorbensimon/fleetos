// Edge Function: list-company-users
// Called by the app (owner only) to list admins/drivers of a company, including their email
// (email lives in auth.users, which the client can never query directly).

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

    const { companyId } = await req.json();

    if (!companyId) {
      return new Response(JSON.stringify({ error: 'חסר מזהה חברה' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profiles, error: profilesError } = await adminClient
      .from('profiles')
      .select('id, role, full_name, must_change_password, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (profilesError) {
      return new Response(JSON.stringify({ error: 'שליפת המשתמשים נכשלה' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const users = await Promise.all(
      (profiles || []).map(async (p) => {
        const { data: userData } = await adminClient.auth.admin.getUserById(p.id);
        return { ...p, email: userData?.user?.email || null };
      })
    );

    return new Response(JSON.stringify({ success: true, users }), {
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
