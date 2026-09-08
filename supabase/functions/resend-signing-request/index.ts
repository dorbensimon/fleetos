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
    if (user.profile.role !== 'owner' && user.profile.role !== 'admin') {
      return json({ error: 'אין הרשאה לשלוח תזכורת' }, 403);
    }

    const { data: request } = await user.adminClient
      .from('signature_requests')
      .select('id, company_id, driver_id, docuseal_submitter_id, status, archived_at, next_email_reminder_at')
      .eq('id', requestId)
      .single();
    if (!request || request.archived_at) return json({ error: 'בקשת החתימה לא נמצאה' }, 404);

    const allowed = user.profile.role === 'owner' || user.profile.company_id === request.company_id;
    if (!allowed) return json({ error: 'אין הרשאה לבקשה זו' }, 403);
    if (request.status !== 'pending') return json({ error: 'אפשר לשלוח תזכורת רק למסמך שממתין לחתימה' }, 409);
    if (!request.docuseal_submitter_id) return json({ error: 'קישור החתימה עדיין לא מוכן' }, 409);

    const { data: settings, error: settingsError } = await user.adminClient
      .from('company_signing_settings')
      .select('email_reminders_enabled, repeat_reminder_interval_hours')
      .eq('company_id', request.company_id)
      .maybeSingle();
    if (settingsError) throw settingsError;

    const now = new Date();
    const repeatHours = settings?.repeat_reminder_interval_hours ?? 72;
    const nextReminderAt = settings?.email_reminders_enabled === false
      ? null
      : new Date(now.getTime() + repeatHours * 60 * 60 * 1000).toISOString();
    const lockUntil = new Date(now.getTime() + LOCK_MINUTES * 60 * 1000).toISOString();

    // Reserve this delivery and move the automatic schedule before calling the
    // external mail service. If the final metadata update fails after DocuSeal
    // accepted the email, the old due timestamp cannot trigger an immediate
    // duplicate reminder.
    const { data: claimed, error: claimError } = await user.adminClient
      .from('signature_requests')
      .update({
        next_email_reminder_at: nextReminderAt,
        email_reminder_locked_until: lockUntil,
      })
      .eq('id', request.id)
      .or(`email_reminder_locked_until.is.null,email_reminder_locked_until.lt.${now.toISOString()}`)
      .select('id')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return json({ error: 'כבר מתבצעת שליחת תזכורת למסמך זה' }, 409);

    const response = await docusealFetch(`/submitters/${request.docuseal_submitter_id}`, {
      method: 'PUT',
      // FleetOS deliberately uses email only for reminders. SMS is a paid
      // DocuSeal add-on and is never accepted from the client request.
      body: JSON.stringify({ send_email: true }),
    });
    if (!response.ok) {
      const { error: releaseError } = await user.adminClient
        .from('signature_requests')
        .update({
          next_email_reminder_at: request.next_email_reminder_at,
          email_reminder_locked_until: null,
        })
        .eq('id', request.id)
        .eq('status', 'pending')
        .eq('email_reminder_locked_until', lockUntil);
      if (releaseError) console.error('resend-signing-request lock release failed', releaseError.message);
      return json({ error: 'שליחת התזכורת דרך DocuSeal נכשלה' }, 502);
    }

    const { error: updateError } = await user.adminClient.from('signature_requests').update({
      last_email_reminder_at: now.toISOString(),
      // A manual email must not be followed by an automatic duplicate on the
      // same day. The manual action still works even when automatic reminders
      // are disabled; it just leaves no next automatic reminder scheduled.
      next_email_reminder_at: nextReminderAt,
      email_reminder_locked_until: null,
    }).eq('id', request.id).eq('status', 'pending').eq('email_reminder_locked_until', lockUntil);
    if (updateError) {
      console.error('resend-signing-request metadata update failed', updateError.message);
      return json({
        error: 'התזכורת נשלחה, אך שמירת סטטוס השליחה נכשלה. אין לשלוח שוב כעת',
        sent: true,
      }, 500);
    }

    return json({ success: true, channel: 'email' });
  } catch (error) {
    console.error('resend-signing-request failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'שליחת התזכורת נכשלה' }, 500);
  }
});
