import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { docusealFetch } from '../_shared/docuseal.ts';

const BATCH_SIZE = 50;
const LOCK_MINUTES = 5;

type DueRequest = {
  id: string;
  company_id: string;
  docuseal_submitter_id: number | null;
  email_reminder_count: number;
  email_reminder_locked_until: string | null;
};

type CompanySigningSettings = {
  email_reminders_enabled: boolean;
  repeat_reminder_interval_hours: number;
  max_email_reminders: number;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function dateAfterHours(now: Date, hours: number): string {
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  const suppliedSecret = req.headers.get('x-signing-reminder-cron-secret') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'הגדרות השרת חסרות' }, 500);
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // The scheduled database call provides a secret stored in Vault. The Edge
  // Function never stores that secret in its source or environment; only its
  // service-role client may ask Postgres to compare it.
  const { data: authorized, error: authorizationError } = await admin.rpc(
    'validate_signing_reminder_cron_secret',
    { candidate: suppliedSecret },
  );
  if (authorizationError || authorized !== true) return json({ error: 'אין הרשאה' }, 401);

  const now = new Date();
  const nowIso = now.toISOString();
  const lockUntil = new Date(now.getTime() + LOCK_MINUTES * 60 * 1000).toISOString();

  try {
    const { data: candidates, error: candidateError } = await admin
      .from('signature_requests')
      .select('id, company_id, docuseal_submitter_id, email_reminder_count, email_reminder_locked_until')
      .eq('status', 'pending')
      .is('archived_at', null)
      .not('next_email_reminder_at', 'is', null)
      .lte('next_email_reminder_at', nowIso)
      .or(`email_reminder_locked_until.is.null,email_reminder_locked_until.lt.${nowIso}`)
      .order('next_email_reminder_at', { ascending: true })
      .limit(BATCH_SIZE);
    if (candidateError) throw candidateError;

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const settingsCache = new Map<string, CompanySigningSettings | null>();

    for (const candidate of (candidates || []) as DueRequest[]) {
      // Claim first, then make the external API call. A concurrent cron run sees
      // the short lock and skips this request instead of sending a duplicate.
      const { data: claimed, error: claimError } = await admin
        .from('signature_requests')
        .update({ email_reminder_locked_until: lockUntil })
        .eq('id', candidate.id)
        .eq('status', 'pending')
        .is('archived_at', null)
        .lte('next_email_reminder_at', nowIso)
        .or(`email_reminder_locked_until.is.null,email_reminder_locked_until.lt.${nowIso}`)
        .select('id')
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) { skipped += 1; continue; }

      let settings = settingsCache.get(candidate.company_id);
      if (settings === undefined) {
        const { data, error } = await admin
          .from('company_signing_settings')
          .select('email_reminders_enabled, repeat_reminder_interval_hours, max_email_reminders')
          .eq('company_id', candidate.company_id)
          .maybeSingle();
        if (error) throw error;
        settings = data as CompanySigningSettings | null;
        settingsCache.set(candidate.company_id, settings);
      }

      const remindersEnabled = settings?.email_reminders_enabled ?? true;
      const maxReminders = settings?.max_email_reminders ?? 3;
      if (!remindersEnabled || !candidate.docuseal_submitter_id || candidate.email_reminder_count >= maxReminders) {
        await admin.from('signature_requests').update({
          next_email_reminder_at: null,
          email_reminder_locked_until: null,
        }).eq('id', candidate.id);
        skipped += 1;
        continue;
      }

      const response = await docusealFetch(`/submitters/${candidate.docuseal_submitter_id}`, {
        method: 'PUT',
        // Explicitly email-only: no `send_sms` is ever sent by FleetOS.
        body: JSON.stringify({ send_email: true }),
      });
      if (!response.ok) {
        // Release the lock and retry this mail later. This protects requests
        // when DocuSeal is briefly unavailable without silently losing them.
        await admin.from('signature_requests').update({
          email_reminder_locked_until: null,
          next_email_reminder_at: dateAfterHours(now, 1),
        }).eq('id', candidate.id);
        failed += 1;
        continue;
      }

      const newCount = candidate.email_reminder_count + 1;
      const intervalHours = settings?.repeat_reminder_interval_hours ?? 72;
      await admin.from('signature_requests').update({
        email_reminder_count: newCount,
        last_email_reminder_at: nowIso,
        next_email_reminder_at: newCount >= maxReminders ? null : dateAfterHours(now, intervalHours),
        email_reminder_locked_until: null,
      }).eq('id', candidate.id);
      sent += 1;
    }

    return json({ success: true, channel: 'email', sent, skipped, failed });
  } catch (error) {
    console.error('process-signing-email-reminders failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'עיבוד תזכורות המייל נכשל' }, 500);
  }
});
