import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { docusealFetch } from '../_shared/docuseal.ts';
import { expiryDecision, type RemoteSubmission } from '../_shared/signingExpiry.ts';

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

/** Deliberately defaults to a read-only audit. DocuSeal DELETE is archival,
 * not permanent erasure; archive mode must be explicitly selected at rollout. */
Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: authorized, error: authError } = await admin.rpc('validate_signing_reminder_cron_secret', {
    candidate: req.headers.get('x-signing-reminder-cron-secret') || '',
  });
  if (authError || authorized !== true) return json({ error: 'Unauthorized' }, 401);
  try {
    const body = await req.json();
    const dryRun = body.dryRun !== false;
    if (!dryRun && body.remoteDisposition !== 'archive') {
      return json({ error: 'DocuSeal permanent deletion is not supported by the documented API; archive disposition must be approved explicitly.' }, 409);
    }
    const now = new Date();
    const { data: candidates, error } = await admin.from('signature_requests').select('*')
      .neq('status', 'completed').is('completed_at', null).is('signed_file_path', null)
      .lte('expires_at', now.toISOString())
      .or(`expiry_locked_until.is.null,expiry_locked_until.lt.${now.toISOString()}`)
      .order('expires_at').limit(30);
    if (error) throw error;
    const counts = { eligible: 0, preserved: 0, removed: 0, deferred: 0, failed: 0 };
    for (const local of candidates || []) {
      const lock = new Date(Date.now() + 120_000).toISOString();
      try {
        if (local.provisioning_locked_until && Date.parse(local.provisioning_locked_until) > Date.now()) { counts.deferred++; continue; }
        if (!dryRun) {
          const { data: claimed, error: claimError } = await admin.from('signature_requests')
            .update({ expiry_locked_until: lock }).eq('id', local.id).neq('status', 'completed')
            .is('completed_at', null).is('signed_file_path', null)
            .or(`expiry_locked_until.is.null,expiry_locked_until.lt.${now.toISOString()}`)
            .select('id').maybeSingle();
          if (claimError) throw claimError;
          if (!claimed) { counts.deferred++; continue; }
        }
        if (!local.docuseal_submission_id) {
          const lookup = await docusealFetch(`/submitters?external_id=${encodeURIComponent(local.id)}&limit=1`);
          if (!lookup.ok) { counts.deferred++; continue; }
          const payload = await lookup.json();
          const submitters = Array.isArray(payload) ? payload : payload.data;
          if (!Array.isArray(submitters)) { counts.deferred++; continue; }
          if (submitters.length) { counts.deferred++; continue; }
          // Provider lookup positively confirms that an unconfirmed send never
          // created a remote request. No external artifact needs removal.
          counts.eligible++;
          if (!dryRun) {
            const { error: removeError } = await admin.from('signature_requests').delete()
              .eq('id', local.id).neq('status', 'completed').is('completed_at', null).is('signed_file_path', null)
              .is('docuseal_submission_id', null).eq('expiry_locked_until', lock);
            if (removeError) throw removeError;
            counts.removed++;
          }
          continue;
        }
        const response = await docusealFetch(`/submissions/${local.docuseal_submission_id}`);
        // Missing remote data is NOT proof that a signature never existed.
        if (!response.ok) { counts.deferred++; continue; }
        const remote = await response.json() as RemoteSubmission;
        const decision = expiryDecision(local, remote, now.getTime());
        if (decision === 'preserve-signed') {
          counts.preserved++;
          if (!dryRun) {
            const completedAt = remote.completed_at || remote.submitters?.find(s => s.completed_at)?.completed_at;
            const { error: preserveError } = await admin.from('signature_requests').update({
              status: 'completed', completed_at: completedAt || now.toISOString(),
              next_email_reminder_at: null, expiry_locked_until: null,
            }).eq('id', local.id).neq('status', 'completed').eq('expiry_locked_until', lock);
            if (preserveError) throw preserveError;
          }
          continue;
        }
        if (decision !== 'remove-unsigned') { counts.deferred++; continue; }
        counts.eligible++;
        if (dryRun) continue;
        // Remote has explicitly expired, so it cannot accept a new signature.
        const archived = await docusealFetch(`/submissions/${local.docuseal_submission_id}`, { method: 'DELETE' });
        if (!archived.ok) throw new Error('Remote archive failed');
        const { error: deleteError } = await admin.from('signature_requests').delete()
          .eq('id', local.id).neq('status', 'completed').is('completed_at', null).is('signed_file_path', null)
          .eq('expiry_locked_until', lock);
        if (deleteError) throw deleteError;
        // Linked in-app notifications cascade in the same database operation.
        counts.removed++;
      } catch { counts.failed++; }
      finally {
        if (!dryRun) await admin.from('signature_requests').update({ expiry_locked_until: null })
          .eq('id', local.id).eq('expiry_locked_until', lock);
      }
    }
    return json({ success: counts.failed === 0, dryRun, ...counts });
  } catch { return json({ error: 'Expiry processing failed' }, 500); }
});
