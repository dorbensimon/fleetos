// פונקציית שרת: רשימת המשתמשים של חברה
// Edge Function: list-company-users
// Called by the app (owner only) to list admins/drivers of a company, including their email
// (email lives in auth.users, which the client can never query directly).

import { corsHeaders } from '../_shared/cors.ts';
import { verifyOwner } from '../_shared/verifyOwner.ts';

// מחזיר את הרשימה
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

    const { companyId } = await req.json();

    if (!companyId) {
      return new Response(JSON.stringify({ error: 'חסר מזהה חברה' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Managers come from the memberships: one who is in another of their
    // companies right now still belongs here.
    const { data: members, error: membersError } = await adminClient
      .from('company_memberships')
      .select('user_id')
      .eq('company_id', companyId);
    const memberIds = (members ?? []).map((m) => m.user_id as string);
    const { data: profiles, error: profilesError } = membersError
      ? { data: null, error: membersError }
      : await adminClient
        .from('profiles')
        .select('id, role, full_name, phone, must_change_password, created_at')
        .or(memberIds.length ? `company_id.eq.${companyId},id.in.(${memberIds.join(',')})` : `company_id.eq.${companyId}`)
        .order('created_at', { ascending: false });
    const { data: allMemberships } = memberIds.length
      ? await adminClient.from('company_memberships').select('user_id').in('user_id', memberIds)
      : { data: [] };
    const companyCount = new Map<string, number>();
    for (const row of allMemberships ?? []) companyCount.set(row.user_id, (companyCount.get(row.user_id) ?? 0) + 1);

    if (profilesError) {
      return new Response(JSON.stringify({ error: 'שליפת המשתמשים נכשלה' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const users = await Promise.all(
      (profiles || []).map(async (p) => {
        const { data: userData } = await adminClient.auth.admin.getUserById(p.id);
        return { ...p, email: userData?.user?.email || null, company_count: companyCount.get(p.id) ?? 1 };
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
