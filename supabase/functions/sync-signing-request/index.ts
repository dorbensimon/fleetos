import { corsHeaders } from '../_shared/cors.ts';
import { docusealFetch } from '../_shared/docuseal.ts';
import { verifyUser } from '../_shared/verifyUser.ts';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const LOCK_MINUTES = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const { requestId } = await req.json();
    const user = await verifyUser(req.headers.get('Authorization'));
    if (!user.ok) return json({ error: user.error }, user.status);
    const { data: local } = await user.adminClient.from('signature_requests').select('*').eq('id', requestId).single();
    if (!local || local.archived_at) return json({ error: 'המסמך לא נמצא' }, 404);
    const allowed = local.driver_id === user.userId
      || user.profile.role === 'owner'
      || (user.profile.role === 'admin' && user.profile.company_id === local.company_id);
    if (!allowed) return json({ error: 'אין הרשאה למסמך זה' }, 403);
    if (!local.docuseal_submitter_id) return json({ status: local.status });
    // A terminal record is authoritative. The webhook owns the signed-file
    // evidence, so a user refresh never races it merely to refill a cache.
    if (local.status !== 'pending') return json({ success: true, status: local.status });

    const now = new Date();
    const lockUntil = new Date(now.getTime() + LOCK_MINUTES * 60 * 1000).toISOString();
    const { data: claimed, error: claimError } = await user.adminClient
      .from('signature_requests')
      .update({ sync_locked_until: lockUntil })
      .eq('id', local.id)
      .eq('status', 'pending')
      .or(`sync_locked_until.is.null,sync_locked_until.lt.${now.toISOString()}`)
      .select('id')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return json({ success: true, status: local.status, syncing: true });

    const response = await docusealFetch(`/submitters/${local.docuseal_submitter_id}`);
    if (!response.ok) {
      await user.adminClient.from('signature_requests').update({ sync_locked_until: null })
        .eq('id', local.id).eq('status', 'pending').eq('sync_locked_until', lockUntil);
      return json({ error: 'בדיקת מצב החתימה נכשלה' }, 502);
    }
    const submitter = await response.json();
    const status = submitter.status === 'completed' ? 'completed'
      : submitter.status === 'declined' ? 'declined' : 'pending';

    let signedFilePath = local.signed_file_path;
    if (status === 'completed' && !signedFilePath && submitter.documents?.[0]?.url) {
      const documentResponse = await fetch(submitter.documents[0].url);
      if (documentResponse.ok) {
        signedFilePath = `${local.company_id}/driver/${local.driver_id}/signed/${local.id}.pdf`;
        const bytes = new Uint8Array(await documentResponse.arrayBuffer());
        const { error: uploadError } = await user.adminClient.storage
          .from('documents')
          .upload(signedFilePath, bytes, { contentType: 'application/pdf', upsert: true });
        if (uploadError) signedFilePath = null;
      }
    }

    // A late poll must never move a terminal record back to pending or erase
    // evidence written by the webhook. Transition only from the lock we own.
    if (status === 'pending') {
      await user.adminClient.from('signature_requests').update({ sync_locked_until: null })
        .eq('id', local.id).eq('status', 'pending').eq('sync_locked_until', lockUntil);
      return json({ success: true, status: local.status });
    }
    const update = user.adminClient.from('signature_requests').update({
      status,
      signed_file_path: signedFilePath,
      completed_at: status === 'completed' ? submitter.completed_at || new Date().toISOString() : null,
      next_email_reminder_at: null,
      email_reminder_locked_until: null,
      sync_locked_until: null,
    }).eq('id', local.id).eq('status', 'pending').eq('sync_locked_until', lockUntil);
    const { error: updateError } = await update;
    if (updateError) throw updateError;
    return json({ success: true, status });
  } catch (error) {
    console.error('sync-signing-request failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'סנכרון החתימה נכשל' }, 500);
  }
});
