import { corsHeaders } from '../_shared/cors.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';
import { assignSigningTemplate } from '../_shared/signingAssign.ts';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const { companyId, templateId, driverIds } = await req.json();
    const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!access.ok) return json({ error: access.error }, access.status);
    if (access.callerRole !== 'admin' && access.callerRole !== 'owner') return json({ error: 'אין הרשאה לשלוח מסמכים' }, 403);

    const ids = [...new Set(Array.isArray(driverIds) ? driverIds : [])];
    if (ids.length !== 1 || typeof ids[0] !== 'string') return json({ error: 'ניתן לשלוח מסמך אחד לנהג אחד בלבד מתוך פרופיל הנהג' }, 400);

    const { data: actor } = await access.adminClient
      .from('profiles')
      .select('full_name')
      .eq('id', access.callerId)
      .single();

    const result = await assignSigningTemplate(access.adminClient, {
      companyId, templateId, ids, callerId: access.callerId, actorName: actor?.full_name || 'מנהל',
    });
    if ('error' in result) return json({ error: result.error }, result.status);
    const { created, failed, failureMessage } = result;
    return json({ success: created > 0, created, failed, ...(failureMessage ? { message: failureMessage } : {}) });
  } catch (error) {
    console.error('assign-signing-template failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'שליחת המסמך נכשלה' }, 500);
  }
});
