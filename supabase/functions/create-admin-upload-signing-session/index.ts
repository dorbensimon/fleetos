import { corsHeaders } from '../_shared/cors.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';

type DocuSealTemplate = {
  id?: number;
};

type DocuSealSubmitter = {
  embed_src?: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Same admin-only DocuSeal flow as create-admin-signing-session, but for a
 * document the admin just uploaded instead of the one fixed server template.
 * DocuSeal builds the template (with a signature field placed on it) and
 * the submission in one round trip — the admin never touches the DocuSeal
 * dashboard and the API key never reaches the app.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const { companyId, documentUrl, documentName } = await req.json();
    const verify = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!verify.ok) return json({ error: verify.error }, verify.status);
    if (verify.callerRole !== 'admin') return json({ error: 'המסמך זמין למנהל חברה בלבד' }, 403);

    if (typeof documentUrl !== 'string' || !documentUrl.startsWith('https://')) {
      return json({ error: 'חסר קישור למסמך שהועלה' }, 400);
    }

    const apiKey = Deno.env.get('DOCUSEAL_API_KEY');
    const apiUrl = (Deno.env.get('DOCUSEAL_API_URL') || 'https://api.docuseal.com').replace(/\/$/, '');
    if (!apiKey) return json({ error: 'חיבור DocuSeal טרם הוגדר בשרת' }, 503);

    const { data: userData, error: userError } = await verify.adminClient.auth.admin.getUserById(
      verify.callerId
    );
    const email = userData?.user?.email;
    if (userError || !email) return json({ error: 'לא נמצאה כתובת המייל של המנהל' }, 400);

    const templateResponse = await fetch(`${apiUrl}/templates/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': apiKey },
      body: JSON.stringify({
        name: (documentName || 'מסמך לחתימה').toString().slice(0, 200),
        document_url: documentUrl,
        fields: [
          {
            name: 'חתימת מנהל',
            type: 'signature',
            role: 'Admin',
            page: 0,
            x: 100,
            y: 700,
            w: 200,
            h: 60,
          },
        ],
      }),
    });

    if (!templateResponse.ok) {
      console.error('DocuSeal template creation failed', templateResponse.status);
      return json({ error: 'יצירת תבנית החתימה נכשלה' }, 502);
    }

    const template = (await templateResponse.json()) as DocuSealTemplate;
    if (!template.id) {
      return json({ error: 'DocuSeal לא החזיר תבנית תקינה' }, 502);
    }

    const submissionResponse = await fetch(`${apiUrl}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': apiKey },
      body: JSON.stringify({
        template_id: template.id,
        send_email: false,
        submitters: [
          {
            email,
            name: userData.user.user_metadata?.full_name || undefined,
            role: 'Admin',
            external_id: verify.callerId,
          },
        ],
      }),
    });

    if (!submissionResponse.ok) {
      console.error('DocuSeal submission creation failed', submissionResponse.status);
      return json({ error: 'יצירת מסמך החתימה נכשלה' }, 502);
    }

    const submitters = (await submissionResponse.json()) as DocuSealSubmitter[];
    const embedSrc = submitters[0]?.embed_src;
    if (!embedSrc?.startsWith('https://')) {
      return json({ error: 'DocuSeal החזיר קישור חתימה לא תקין' }, 502);
    }

    return json({ embedSrc, templateId: template.id });
  } catch (error) {
    console.error(
      'create-admin-upload-signing-session failed',
      error instanceof Error ? error.message : 'unknown'
    );
    return json({ error: 'אירעה שגיאה בלתי צפויה' }, 500);
  }
});
