import { corsHeaders } from '../_shared/cors.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';

type DocuSealSubmitter = {
  embed_src?: string;
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
    const { companyId } = await req.json();
    const verify = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!verify.ok) return json({ error: verify.error }, verify.status);
    if (verify.callerRole !== 'admin') return json({ error: 'המסמך זמין למנהל חברה בלבד' }, 403);

    const apiKey = Deno.env.get('DOCUSEAL_API_KEY');
    const templateId = Number(Deno.env.get('DOCUSEAL_TEMPLATE_ID'));
    const apiUrl = (Deno.env.get('DOCUSEAL_API_URL') || 'https://api.docuseal.com').replace(/\/$/, '');

    if (!apiKey || !Number.isInteger(templateId) || templateId <= 0) {
      return json({ error: 'חיבור DocuSeal טרם הוגדר בשרת' }, 503);
    }

    const { data: userData, error: userError } = await verify.adminClient.auth.admin.getUserById(
      verify.callerId
    );
    const email = userData?.user?.email;
    if (userError || !email) return json({ error: 'לא נמצאה כתובת המייל של המנהל' }, 400);

    const response = await fetch(`${apiUrl}/submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': apiKey,
      },
      body: JSON.stringify({
        template_id: templateId,
        send_email: false,
        submitters: [
          {
            email,
            name: userData.user.user_metadata?.full_name || undefined,
            external_id: verify.callerId,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('DocuSeal submission creation failed', response.status);
      return json({ error: 'יצירת מסמך החתימה נכשלה' }, 502);
    }

    const submitters = (await response.json()) as DocuSealSubmitter[];
    const embedSrc = submitters[0]?.embed_src;
    if (!embedSrc?.startsWith('https://')) {
      return json({ error: 'DocuSeal החזיר קישור חתימה לא תקין' }, 502);
    }

    return json({ embedSrc });
  } catch (error) {
    console.error('create-admin-signing-session failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'אירעה שגיאה בלתי צפויה' }, 500);
  }
});
