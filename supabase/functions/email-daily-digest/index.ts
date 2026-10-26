// פונקציית שרת יומית: סיכום התראות במייל למנהלים
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Daily (migration 129, deployed with --no-verify-jwt): every manager with
 * unread alerts from the last 24 hours gets one email through Resend. Only
 * the cron secret from Vault gets in. Needs the RESEND_API_KEY secret;
 * EMAIL_FROM is optional.
 */

// תשובת JSON
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

type Recipient = { email: string; full_name: string | null; company_name: string | null; messages: string[] };

// כמה שורות במייל אחד
const MAX_LINES = 30;
const SITE_URL = 'https://icar-app.com';

// מנקה טקסט לפני שהוא נכנס ל-HTML
const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// בונה את גוף המייל
function digestHtml(r: Recipient): string {
  const shown = r.messages.slice(0, MAX_LINES);
  const more = r.messages.length - shown.length;
  const items = shown.map((m) => `<li style="margin:0 0 8px">${escapeHtml(m)}</li>`).join('');
  return `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#F5F5F7;font-family:Arial,sans-serif;color:#1C2433">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#0F1E3D;color:#fff;border-radius:12px 12px 0 0;padding:16px 20px;font-size:18px;font-weight:bold">iCar · ${escapeHtml(r.company_name ?? '')}</div>
<div style="background:#fff;border-radius:0 0 12px 12px;padding:20px">
<p style="margin:0 0 12px">שלום ${escapeHtml(r.full_name ?? '')},</p>
<p style="margin:0 0 12px">${r.messages.length === 1 ? 'יש התראה אחת שמחכה לך' : `יש ${r.messages.length} התראות שמחכות לך`} מ-24 השעות האחרונות:</p>
<ul style="margin:0 0 16px;padding-inline-start:20px;line-height:1.5">${items}</ul>
${more > 0 ? `<p style="margin:0 0 16px">ועוד ${more} באתר.</p>` : ''}
<a href="${SITE_URL}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">לכניסה ל-iCar</a>
<p style="margin:20px 0 0;font-size:12px;color:#6B7280">אפשר לכבות את המייל היומי בהגדרות ההתראות באתר.</p>
</div></div></body></html>`;
}

// שולח את המיילים
Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: authorized, error: authError } = await admin.rpc('validate_signing_reminder_cron_secret', {
    candidate: req.headers.get('x-signing-reminder-cron-secret') || '',
  });
  if (authError || authorized !== true) return json({ error: 'Unauthorized' }, 401);

  const apiKey = Deno.env.get('RESEND_API_KEY');
  // Not set up yet: nothing to do, and not a failure worth alerting the owner about.
  if (!apiKey) return json({ skipped: 'RESEND_API_KEY not set' });
  const from = Deno.env.get('EMAIL_FROM') || 'iCar <alerts@icar-app.com>';

  // Test send: one sample email to the given address, no real company data.
  const body = await req.json().catch(() => ({}));
  const testTo = typeof body?.test_to === 'string' ? body.test_to : '';
  let recipients: Recipient[];
  if (testTo) {
    recipients = [{
      email: testTo, full_name: 'בדיקה', company_name: 'חברת דוגמה',
      messages: ['ביטוח חובה של רכב 12-345-67 יפוג בעוד 14 יום', 'הנהג ישראל ישראלי העלה מסמך חדש'],
    }];
  } else {
    const { data, error } = await admin.rpc('email_digest_recipients');
    if (error) {
      console.error('email-daily-digest: list failed');
      return json({ error: 'list failed' }, 500);
    }
    recipients = (data ?? []) as Recipient[];
  }

  let sent = 0;
  let failed = 0;
  // Resend's batch endpoint takes up to 100 emails per call.
  for (let i = 0; i < recipients.length; i += 100) {
    const batch = recipients.slice(i, i + 100).map((r) => ({
      from,
      to: [r.email],
      subject: r.messages.length === 1 ? 'iCar: התראה אחת מחכה לך' : `iCar: ${r.messages.length} התראות מחכות לך`,
      html: digestHtml(r),
    }));
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    if (res.ok) sent += batch.length;
    else {
      failed += batch.length;
      console.error(`email-daily-digest: Resend ${res.status}`);
    }
  }

  // A non-2xx answer lets the hourly failed-job check (migration 128) alert the owner.
  return json({ sent, failed }, failed > 0 ? 502 : 200);
});
