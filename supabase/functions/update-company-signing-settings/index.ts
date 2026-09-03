import { corsHeaders } from '../_shared/cors.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function wholeNumber(value: unknown, minimum: number, maximum: number): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const {
      companyId,
      emailRemindersEnabled,
      initialReminderDelayHours,
      repeatReminderIntervalHours,
      maxEmailReminders,
    } = await req.json();
    const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!access.ok) return json({ error: access.error }, access.status);
    if (access.callerRole !== 'admin' && access.callerRole !== 'owner') {
      return json({ error: 'אין הרשאה לעדכן הגדרות תזכורת' }, 403);
    }
    if (typeof emailRemindersEnabled !== 'boolean') return json({ error: 'מצב תזכורות המייל אינו תקין' }, 400);

    const initialDelay = wholeNumber(initialReminderDelayHours, 1, 720);
    const repeatInterval = wholeNumber(repeatReminderIntervalHours, 1, 720);
    const maxReminders = wholeNumber(maxEmailReminders, 0, 10);
    if (initialDelay === null || repeatInterval === null || maxReminders === null) {
      return json({ error: 'יש להזין מספרים תקינים להגדרות התזכורת' }, 400);
    }

    const { data, error } = await access.adminClient
      .from('company_signing_settings')
      .upsert({
        company_id: companyId,
        email_reminders_enabled: emailRemindersEnabled,
        initial_reminder_delay_hours: initialDelay,
        repeat_reminder_interval_hours: repeatInterval,
        max_email_reminders: maxReminders,
        updated_by: access.callerId,
      }, { onConflict: 'company_id' })
      .select('email_reminders_enabled, initial_reminder_delay_hours, repeat_reminder_interval_hours, max_email_reminders')
      .single();
    if (error || !data) return json({ error: 'שמירת הגדרות תזכורת המייל נכשלה' }, 500);

    return json({ success: true, settings: data, channel: 'email' });
  } catch (error) {
    console.error('update-company-signing-settings failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'שמירת הגדרות התזכורת נכשלה' }, 500);
  }
});
