import { corsHeaders } from '../_shared/cors.ts';
import { docusealFetch } from '../_shared/docuseal.ts';
import { signaturePng } from '../_shared/checklistDocument.ts';
import { PREFILL_LABELS } from '../_shared/signingPrefill.ts';
import { verifyUser } from '../_shared/verifyUser.ts';

/**
 * The driver signs a document on the app's own signature pad, the same pad
 * the manager uses, instead of DocuSeal's.
 *
 *   inspect -> is this document only a signature (plus the signing date)?
 *              If so, also where to read it. Anything the driver must type or
 *              tick stays in DocuSeal's form.
 *   sign    -> fills every signature field with the drawing and every date
 *              field with today, completes the submitter, and stores the PDF.
 */

const LETTERHEAD_DATE_FIELD = 'תאריך המסמך';
const SIGN_LOCK_MINUTES = 3;
const SIGN_TYPES = new Set(['signature', 'initials']);

type TemplateField = { name?: string; type?: string; readonly?: boolean; submitter_uuid?: string; preferences?: Record<string, unknown> };
type RemoteTemplate = { fields?: TemplateField[]; documents?: Array<{ url?: string }> };

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function israelToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

/** The fields the driver fills: everything the app did not fill for them. */
function driverFields(template: RemoteTemplate): TemplateField[] {
  return (template.fields ?? []).filter((field) => !field.readonly
    && !(field.name && (field.name in PREFILL_LABELS || field.name === LETTERHEAD_DATE_FIELD)));
}

function isSignOnly(fields: TemplateField[]): boolean {
  return fields.length > 0
    && fields.some((field) => SIGN_TYPES.has(field.type ?? ''))
    && fields.every((field) => SIGN_TYPES.has(field.type ?? '') || field.type === 'date');
}

async function loadTemplate(submissionId: number): Promise<RemoteTemplate | null> {
  const submission = await docusealFetch(`/submissions/${submissionId}`);
  if (!submission.ok) return null;
  const { template } = await submission.json() as { template?: { id?: number } };
  if (!template?.id) return null;
  const response = await docusealFetch(`/templates/${template.id}`);
  if (!response.ok) return null;
  return await response.json() as RemoteTemplate;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const body = await req.json();
    const { requestId, action } = body ?? {};
    if (typeof requestId !== 'string' || !['inspect', 'sign'].includes(action)) return json({ error: 'בקשה לא תקינה' }, 400);

    const user = await verifyUser(req.headers.get('Authorization'));
    if (!user.ok) return json({ error: user.error }, user.status);
    const db = user.adminClient;

    const { data: request } = await db.from('signature_requests')
      .select('id, company_id, driver_id, status, archived_at, docuseal_submission_id, docuseal_submitter_id, signed_file_path')
      .eq('id', requestId).maybeSingle();
    // Only the driver the document was sent to signs it.
    if (!request || request.driver_id !== user.userId) return json({ error: 'המסמך לא נמצא' }, 404);
    if (request.status === 'completed') return json({ status: 'completed', filePending: !request.signed_file_path });
    if (request.status !== 'pending' || request.archived_at || !request.docuseal_submission_id || !request.docuseal_submitter_id) {
      return json({ error: 'המסמך כבר לא ממתין לחתימה' }, 409);
    }

    const template = await loadTemplate(request.docuseal_submission_id);
    if (!template) return json({ error: 'לא ניתן לפתוח את המסמך כרגע. נסו שוב.' }, 502);
    const fields = driverFields(template);
    const signOnly = isSignOnly(fields);

    if (action === 'inspect') {
      return json({ status: 'pending', signOnly, documentUrl: template.documents?.[0]?.url ?? null });
    }

    if (!signOnly) return json({ error: 'במסמך הזה יש עוד פרטים למלא' }, 409);
    const signature = signaturePng(body.signature);
    if (!signature) return json({ error: 'החתימה לא נקלטה. חתמו שוב ונסו שוב.' }, 400);

    // Hold the request while DocuSeal completes it, so a cancel or a second
    // tap never meets a half-saved signature (the same lock the sync uses).
    const lockUntil = new Date(Date.now() + SIGN_LOCK_MINUTES * 60_000).toISOString();
    const lockStartedAt = new Date().toISOString();
    const { data: claim, error: claimError } = await db.from('signature_requests')
      .update({ sync_locked_until: lockUntil })
      .eq('id', request.id).eq('status', 'pending')
      .or(`sync_locked_until.is.null,sync_locked_until.lt.${lockStartedAt}`)
      .select('id').maybeSingle();
    if (claimError) return json({ error: 'שמירת החתימה נכשלה. נסו שוב.' }, 500);
    if (!claim) {
      const { data: current } = await db.from('signature_requests').select('status, signed_file_path').eq('id', request.id).maybeSingle();
      if (current?.status === 'completed') return json({ status: 'completed', filePending: !current.signed_file_path });
      return json({ error: 'המסמך נשמר כעת. חכו רגע ונסו שוב.' }, 409);
    }
    const release = () => db.from('signature_requests').update({ sync_locked_until: null })
      .eq('id', request.id).eq('status', 'pending').eq('sync_locked_until', lockUntil);

    const today = israelToday();
    const values: Record<string, string> = {};
    for (const field of fields) {
      if (!field.name) continue;
      values[field.name] = SIGN_TYPES.has(field.type ?? '') ? signature : today;
    }

    let update: Response;
    try {
      update = await docusealFetch(`/submitters/${request.docuseal_submitter_id}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: true, send_email: false, values }),
      });
    } catch {
      await release();
      return json({ error: 'שמירת החתימה נכשלה. נסו שוב.' }, 502);
    }
    if (!update.ok) {
      console.error('driver-sign-request rejected', update.status);
      await release();
      return json({ error: 'שמירת החתימה נכשלה. נסו שוב.' }, 502);
    }

    // The signed PDF takes DocuSeal a moment. Wait a little for it; if it is
    // still not ready, the webhook (or the next refresh) stores it.
    let documentUrl: string | null = null;
    let completedAt: string | null = null;
    for (let attempt = 0; attempt < 4 && !documentUrl; attempt += 1) {
      if (attempt) await sleep(1500);
      let response: Response;
      try {
        response = await docusealFetch(`/submitters/${request.docuseal_submitter_id}`);
      } catch {
        continue;
      }
      if (!response.ok) continue;
      const submitter = await response.json() as { status?: string; completed_at?: string; documents?: Array<{ url?: string }> };
      completedAt = submitter.completed_at ?? completedAt;
      if (submitter.status === 'completed') documentUrl = submitter.documents?.[0]?.url ?? null;
    }
    let signedFilePath: string | null = null;
    if (documentUrl) {
      try {
        const pdf = await fetch(documentUrl);
        if (pdf.ok) {
          const path = `${request.company_id}/driver/${request.driver_id}/signed/${request.id}.pdf`;
          const { error: uploadError } = await db.storage.from('documents')
            .upload(path, new Uint8Array(await pdf.arrayBuffer()), { contentType: 'application/pdf', upsert: true });
          if (!uploadError) signedFilePath = path;
        }
      } catch {
        // The webhook or a later sync stores the generated PDF.
      }
    }
    const { data: completed } = await db.from('signature_requests').update({
      status: 'completed',
      completed_at: completedAt || new Date().toISOString(),
      ...(signedFilePath ? { signed_file_path: signedFilePath } : {}),
      next_email_reminder_at: null,
      email_reminder_locked_until: null,
      sync_locked_until: null,
    }).eq('id', request.id).eq('status', 'pending').eq('sync_locked_until', lockUntil).select('id').maybeSingle();
    if (!completed) {
      const { data: current } = await db.from('signature_requests').select('status, signed_file_path').eq('id', request.id).maybeSingle();
      if (current?.status === 'completed') return json({ status: 'completed', filePending: !current.signed_file_path });
      return json({ error: 'המסמך בוטל לפני שהחתימה נשמרה' }, 409);
    }
    return json({ status: 'completed', filePending: !signedFilePath });
  } catch (error) {
    console.error('driver-sign-request failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'שמירת החתימה נכשלה. נסו שוב.' }, 500);
  }
});
