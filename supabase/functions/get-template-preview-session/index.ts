import { corsHeaders } from '../_shared/cors.ts';
import { docusealFetch } from '../_shared/docuseal.ts';
import { isSigningTemplateSourcePath } from '../_shared/signingPaths.ts';
import { verifyUser } from '../_shared/verifyUser.ts';

type DocuSealTemplate = {
  fields?: Array<{
    name?: string;
    type?: string;
    areas?: Array<{ page?: number; x?: number; y?: number; w?: number; h?: number }>;
  }>;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const { templateId } = await req.json();
    const user = await verifyUser(req.headers.get('Authorization'));
    if (!user.ok) return json({ error: user.error }, user.status);
    if (user.profile.role !== 'admin' && user.profile.role !== 'owner') return json({ error: 'אין הרשאה לצפות בתבנית' }, 403);

    let templateQuery = user.adminClient
      .from('signing_templates')
      .select('id, company_id, docuseal_template_id, source_file_path')
      .eq('id', templateId)
      .eq('status', 'ready')
      .is('archived_at', null);
    if (user.profile.role === 'admin') templateQuery = templateQuery.eq('company_id', user.profile.company_id);
    const { data: template } = await templateQuery.single();
    if (!template?.docuseal_template_id || !isSigningTemplateSourcePath(template.company_id, template.source_file_path)) {
      return json({ error: 'התבנית לא נמצאה' }, 404);
    }

    const { data: sourceFile, error: sourceFileError } = await user.adminClient.storage
      .from('documents')
      .createSignedUrl(template.source_file_path, 60 * 15);
    if (sourceFileError || !sourceFile?.signedUrl) return json({ error: 'לא ניתן לטעון את קובץ המקור' }, 502);

    const response = await docusealFetch(`/templates/${template.docuseal_template_id}`);
    if (!response.ok) return json({ error: 'טעינת התבנית מ-DocuSeal נכשלה' }, 502);
    const remote = await response.json() as DocuSealTemplate;
    const previewFields = (remote.fields || [])
      .filter((field) => field.type === 'signature' || field.type === 'stamp')
      .map((field) => ({
        name: field.name || '',
        type: field.type as 'signature' | 'stamp',
        areas: (field.areas || [])
          .filter((area) => [area.page, area.x, area.y, area.w, area.h].every((value) => typeof value === 'number'))
          .map((area) => ({ page: area.page!, x: area.x!, y: area.y!, w: area.w!, h: area.h! })),
      }))
      .filter((field) => field.areas.length > 0);
    return json({ mode: 'document', src: sourceFile.signedUrl, previewFields });
  } catch (error) {
    console.error('get-template-preview-session failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'פתיחת התצוגה המקדימה נכשלה' }, 500);
  }
});
