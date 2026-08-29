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
    const { companyId, kind, id } = await req.json();
    const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!access.ok) return json({ error: access.error }, access.status);
    if (access.callerRole !== 'admin') return json({ error: 'הפעולה זמינה למנהל בלבד' }, 403);

    if (kind === 'request') {
      const { data: item } = await access.adminClient.from('signature_requests').select('*')
        .eq('id', id).eq('company_id', companyId).single();
      if (!item) return json({ error: 'המסמך לא נמצא' }, 404);
      if (item.docuseal_submission_id) await docusealFetch(`/submissions/${item.docuseal_submission_id}`, { method: 'DELETE' });
      if (item.signed_file_path) await access.adminClient.storage.from('documents').remove([item.signed_file_path]);
      await access.adminClient.from('signature_requests').delete().eq('id', id);
      return json({ success: true });
    }

    const { data: template } = await access.adminClient.from('signing_templates').select('*')
      .eq('id', id).eq('company_id', companyId).single();
    if (!template) return json({ error: 'התבנית לא נמצאה' }, 404);
    const { data: requests } = await access.adminClient.from('signature_requests').select('*').eq('template_id', id);
    for (const item of requests || []) {
      if (item.docuseal_submission_id) await docusealFetch(`/submissions/${item.docuseal_submission_id}`, { method: 'DELETE' });
      if (item.signed_file_path) await access.adminClient.storage.from('documents').remove([item.signed_file_path]);
    }
    if (template.docuseal_template_id) await docusealFetch(`/templates/${template.docuseal_template_id}`, { method: 'DELETE' });
    await access.adminClient.storage.from('documents').remove([template.source_file_path]);
    await access.adminClient.from('signing_templates').delete().eq('id', id);
    return json({ success: true });
  } catch (error) {
    console.error('delete-signing-record failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'מחיקת המסמך נכשלה' }, 500);
  }
});
