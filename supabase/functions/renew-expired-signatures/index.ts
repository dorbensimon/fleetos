import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assignSigningTemplate } from '../_shared/signingAssign.ts';

/**
 * Daily (migration 105, deployed with --no-verify-jwt): every signature that
 * ran out gets a new request to sign, and the managers hear about it. Only
 * the cron secret from Vault gets in.
 */

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

type Due = { company_id: string; template_id: string; driver_id: string; request_id: string; driver_name: string; title: string; expires_on: string };

const shortDate = (iso: string) => iso.split('-').reverse().join('/');

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: authorized, error: authError } = await admin.rpc('validate_signing_reminder_cron_secret', {
    candidate: req.headers.get('x-signing-reminder-cron-secret') || '',
  });
  if (authError || authorized !== true) return json({ error: 'Unauthorized' }, 401);

  const { data: due, error } = await admin.rpc('signature_renewals_due');
  if (error) {
    console.error('renew-expired-signatures: list failed');
    return json({ error: 'list failed' }, 500);
  }

  let renewed = 0;
  let failed = 0;
  for (const item of (due ?? []) as Due[]) {
    const lapsed = `החתימה של ${item.driver_name} על "${item.title}" פגה ב-${shortDate(item.expires_on)}`;
    let requestId: string | undefined;
    let reason = '';
    try {
      const result = await assignSigningTemplate(admin, {
        companyId: item.company_id,
        templateId: item.template_id,
        ids: [item.driver_id],
        callerId: null,
        actorName: 'iCar',
        driverMessage: (title) => `פג תוקף החתימה שלך על "${title}". נשלחה אליך בקשה לחתום מחדש`,
      });
      if ('error' in result) reason = result.error;
      else {
        requestId = result.sent.get(item.driver_id);
        reason = result.failureMessage;
      }
    } catch {
      reason = 'שגיאה בשליחה';
    }

    // Recorded once, sent or not: a request that could not go out is the
    // managers' to send from the driver's file, not a daily retry.
    await admin.from('notification_alert_log').insert({
      company_id: item.company_id, notification_type: 'signature_expiry',
      subject_id: item.request_id, anchor_date: item.expires_on, stage: 'expired',
    });

    const notices = requestId
      ? [{ message: `${lapsed}. נשלחה אליו/ה בקשה לחתום מחדש`, signature_request_id: requestId }]
      : [
          { message: `${lapsed}. לא ניתן היה לשלוח בקשה חדשה${reason ? ` (${reason})` : ''}. שלחו אותה מתיק הנהג`, signature_request_id: item.request_id },
          { message: `פג תוקף החתימה שלך על "${item.title}"`, signature_request_id: item.request_id, recipient_id: item.driver_id },
        ];
    const { error: noticeError } = await admin.from('notifications').insert(notices.map((notice) => ({
      company_id: item.company_id,
      notification_type: 'signature_expiry',
      ...('recipient_id' in notice ? {} : { actor_id: item.driver_id, actor_name: item.driver_name }),
      ...notice,
    })));
    if (noticeError) console.error('renew-expired-signatures: notification failed');
    if (requestId) renewed += 1; else failed += 1;
  }

  return json({ renewed, failed });
});
