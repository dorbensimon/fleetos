import { corsHeaders } from '../_shared/cors.ts';
import { docusealFetch } from '../_shared/docuseal.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const { companyId, templateId } = await req.json();
    const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!access.ok) return json({ error: access.error }, access.status);
    if (access.callerRole !== 'admin') return json({ error: 'הפעולה זמינה למנהל בלבד' }, 403);

    const { data: local } = await access.adminClient
      .from('signing_templates')
      .select('id')
      .eq('id', templateId)
      .eq('company_id', companyId)
      .single();
    if (!local) return json({ error: 'התבנית לא נמצאה' }, 404);

    const response = await docusealFetch(`/templates?external_id=${encodeURIComponent(templateId)}&limit=1`);
    if (!response.ok) return json({ error: 'בדיקת התבנית מול DocuSeal נכשלה' }, 502);
    const result = await response.json();
    const remote = result?.data?.[0];
    const hasSignature = remote?.fields?.some((field: { type?: string }) => field.type === 'signature');
    if (!remote?.id || !hasSignature) return json({ error: 'יש למקם לפחות שדה חתימה אחד ולשמור' }, 400);

    const { error } = await access.adminClient
      .from('signing_templates')
      .update({ docuseal_template_id: remote.id, status: 'ready' })
      .eq('id', templateId)
      .eq('company_id', companyId);
    if (error) return json({ error: 'אישור התבנית נכשל' }, 500);
    return json({ success: true });
  } catch (error) {
    console.error('finalize-signing-template failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'אישור התבנית נכשל' }, 500);
  }
});

