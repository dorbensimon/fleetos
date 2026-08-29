import { corsHeaders } from '../_shared/cors.ts';
import { safeDocusealAppUrl, safeDocusealHost, signDocuSealJwt } from '../_shared/docuseal.ts';
import { verifyUser } from '../_shared/verifyUser.ts';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const { requestId } = await req.json();
    const user = await verifyUser(req.headers.get('Authorization'));
    if (!user.ok) return json({ error: user.error }, user.status);

    const { data: request } = await user.adminClient
      .from('signature_requests')
      .select('id, company_id, driver_id, status, docuseal_submitter_slug, signed_file_path')
      .eq('id', requestId)
      .single();
    if (!request) return json({ error: 'המסמך לא נמצא' }, 404);
    const allowed = request.driver_id === user.userId
      || user.profile.role === 'owner'
      || (user.profile.role === 'admin' && user.profile.company_id === request.company_id);
    if (!allowed) return json({ error: 'אין הרשאה למסמך זה' }, 403);
    if (!request.docuseal_submitter_slug) return json({ error: 'קישור החתימה אינו מוכן' }, 409);

    if (request.status === 'completed') {
      if (request.signed_file_path) {
        const { data: signedFile, error: signedFileError } = await user.adminClient.storage
          .from('documents')
          .createSignedUrl(request.signed_file_path, 60 * 15);
        if (!signedFileError && signedFile?.signedUrl) {
          return json({ mode: 'document', src: signedFile.signedUrl });
        }
      }

      // Older completed requests may predate local PDF storage.
      const token = await signDocuSealJwt({
        slug: request.docuseal_submitter_slug,
        external_id: request.id,
        preview: true,
        exp: Math.floor(Date.now() / 1000) + 60 * 15,
      });
      return json({ mode: 'preview', token, host: safeDocusealHost() });
    }

    return json({ mode: 'sign', src: `${safeDocusealAppUrl()}/s/${request.docuseal_submitter_slug}`, host: safeDocusealHost() });
  } catch (error) {
    console.error('get-signing-session failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'פתיחת המסמך נכשלה' }, 500);
  }
});
