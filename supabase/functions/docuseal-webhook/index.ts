import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type WebhookData = {
  id?: number;
  submission_id?: number;
  external_id?: string | null;
  status?: string;
  completed_at?: string | null;
  declined_at?: string | null;
  decline_reason?: string | null;
  documents?: Array<{ url?: string }>;
  submission?: { status?: string; combined_document_url?: string | null };
};

type DocuSealWebhook = {
  event_type?: string;
  timestamp?: string;
  data?: WebhookData;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifySignature(rawBody: string, header: string | null): Promise<boolean> {
  const secret = Deno.env.get('DOCUSEAL_WEBHOOK_HMAC_SECRET');
  if (!secret || !header) return false;
  const [timestamp, signature] = header.split('.', 2);
  const timestampSeconds = Number(timestamp);
  if (!timestamp || !signature || !Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  return timingSafeEqual(hex(signed), signature);
}

function statusForEvent(eventType: string, data: WebhookData): 'completed' | 'declined' | null {
  if (eventType === 'form.completed' || data.status === 'completed' || data.submission?.status === 'completed') {
    return 'completed';
  }
  if (eventType === 'form.declined' || data.status === 'declined' || data.submission?.status === 'declined') {
    return 'declined';
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  const rawBody = await req.text();
  if (!(await verifySignature(rawBody, req.headers.get('X-Docuseal-Signature')))) {
    return json({ error: 'חתימת Webhook לא תקינה' }, 401);
  }

  try {
    const payload = JSON.parse(rawBody) as DocuSealWebhook;
    const data = payload.data;
    if (!payload.event_type || !data) return json({ error: 'מבנה Webhook לא תקין' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('docuseal-webhook missing Supabase server configuration');
      return json({ error: 'הגדרות השרת חסרות' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    let query = admin.from('signature_requests').select('id, company_id, driver_id, status, signed_file_path');
    if (data.external_id) {
      query = query.eq('id', data.external_id);
    } else if (data.id) {
      query = query.eq('docuseal_submitter_id', data.id);
    } else if (data.submission_id) {
      query = query.eq('docuseal_submission_id', data.submission_id);
    } else {
      return json({ received: true, ignored: 'missing request identifier' });
    }

    const { data: request, error: lookupError } = await query.maybeSingle();
    if (lookupError) {
      console.error('docuseal-webhook lookup failed', lookupError.message);
      return json({ error: 'איתור בקשת החתימה נכשל' }, 500);
    }
    if (!request) return json({ received: true, ignored: 'unknown request' });

    const nextStatus = statusForEvent(payload.event_type, data);
    if (!nextStatus) return json({ received: true, ignored: payload.event_type });

    let signedFilePath = request.signed_file_path;
    const documentUrl = data.documents?.[0]?.url || data.submission?.combined_document_url;
    if (nextStatus === 'completed' && !signedFilePath && documentUrl) {
      const documentResponse = await fetch(documentUrl);
      if (documentResponse.ok) {
        const candidatePath = `${request.company_id}/driver/${request.driver_id}/signed/${request.id}.pdf`;
        const bytes = new Uint8Array(await documentResponse.arrayBuffer());
        const { error: uploadError } = await admin.storage.from('documents').upload(candidatePath, bytes, {
          contentType: 'application/pdf',
          upsert: true,
        });
        if (!uploadError) signedFilePath = candidatePath;
        else console.error('docuseal-webhook signed document upload failed', uploadError.message);
      }
    }

    const { error: updateError } = await admin.from('signature_requests').update({
      status: nextStatus,
      signed_file_path: signedFilePath,
      completed_at: nextStatus === 'completed'
        ? data.completed_at || new Date().toISOString()
        : null,
      failure_reason: nextStatus === 'declined' ? (data.decline_reason || null) : null,
      next_email_reminder_at: null,
      email_reminder_locked_until: null,
    }).eq('id', request.id);
    if (updateError) {
      console.error('docuseal-webhook update failed', updateError.message);
      return json({ error: 'עדכון בקשת החתימה נכשל' }, 500);
    }

    return json({ received: true, updated: true, request_id: request.id, status: nextStatus });
  } catch (error) {
    console.error('docuseal-webhook failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'עיבוד Webhook נכשל' }, 500);
  }
});
