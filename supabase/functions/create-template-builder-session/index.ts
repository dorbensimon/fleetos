import { corsHeaders } from '../_shared/cors.ts';
import { signDocuSealJwt, safeDocusealHost } from '../_shared/docuseal.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';

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
    const { companyId, title, filePath, fileName } = await req.json();
    const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!access.ok) return json({ error: access.error }, access.status);
    if (access.callerRole !== 'admin') return json({ error: 'הפעולה זמינה למנהל בלבד' }, 403);
    if (typeof title !== 'string' || !title.trim()) return json({ error: 'חסר שם למסמך' }, 400);
    if (typeof filePath !== 'string' || !filePath.startsWith(`${companyId}/signing-templates/`)) {
      return json({ error: 'נתיב המסמך אינו תקין' }, 400);
    }

    const ownerEmail = Deno.env.get('DOCUSEAL_USER_EMAIL');
    if (!ownerEmail) return json({ error: 'חסר DOCUSEAL_USER_EMAIL בהגדרות השרת' }, 503);

    const { data: userData } = await access.adminClient.auth.admin.getUserById(access.callerId);
    const integrationEmail = userData?.user?.email;
    if (!integrationEmail) return json({ error: 'לא נמצאה כתובת המייל של המנהל' }, 400);

    const { data: signed, error: signedError } = await access.adminClient.storage
      .from('documents')
      .createSignedUrl(filePath, 60 * 30);
    if (signedError || !signed?.signedUrl) return json({ error: 'לא ניתן לקרוא את המסמך שהועלה' }, 400);

    const { data: template, error: insertError } = await access.adminClient
      .from('signing_templates')
      .insert({
        company_id: companyId,
        created_by: access.callerId,
        title: title.trim().slice(0, 200),
        source_file_path: filePath,
        source_file_name: typeof fileName === 'string' ? fileName.slice(0, 255) : null,
      })
      .select('id, title')
      .single();
    if (insertError || !template) return json({ error: 'שמירת טיוטת המסמך נכשלה' }, 500);

    const token = await signDocuSealJwt({
      user_email: ownerEmail,
      integration_email: integrationEmail,
      external_id: template.id,
      name: template.title,
      folder_name: `FleetOS-${companyId}`,
      document_urls: [signed.signedUrl],
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    });

    return json({ templateId: template.id, token, host: safeDocusealHost() });
  } catch (error) {
    console.error('create-template-builder-session failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'יצירת עורך המסמך נכשלה' }, 500);
  }
});

