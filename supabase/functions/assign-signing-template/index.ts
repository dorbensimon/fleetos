import { corsHeaders } from '../_shared/cors.ts';
import { docusealFetch } from '../_shared/docuseal.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

type DocuSealSubmitter = {
  id?: number;
  submission_id?: number;
  slug?: string;
};

type CompanySigningSettings = {
  email_reminders_enabled: boolean;
  initial_reminder_delay_hours: number;
};

const PROVISIONING_LOCK_MINUTES = 10;

async function findRemoteSubmitter(externalId: string): Promise<DocuSealSubmitter | null> {
  const response = await docusealFetch(`/submitters?external_id=${encodeURIComponent(externalId)}&limit=1`);
  if (!response.ok) throw new Error('DocuSeal submitter lookup failed');
  const payload = await response.json() as { data?: DocuSealSubmitter[] } | DocuSealSubmitter[];
  const rows = Array.isArray(payload) ? payload : payload.data;
  return rows?.[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const { companyId, templateId, driverIds } = await req.json();
    const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!access.ok) return json({ error: access.error }, access.status);
    if (access.callerRole !== 'admin' && access.callerRole !== 'owner') return json({ error: 'אין הרשאה לשלוח מסמכים' }, 403);

    const ids = [...new Set(Array.isArray(driverIds) ? driverIds : [])].slice(0, 100);
    if (!ids.length) return json({ error: 'יש לבחור לפחות נהג אחד' }, 400);

    const { data: template } = await access.adminClient
      .from('signing_templates')
      .select('id, company_id, title, docuseal_template_id, archived_at')
      .eq('id', templateId)
      .eq('company_id', companyId)
      .eq('status', 'ready')
      .single();
    if (!template || template.archived_at || !template.docuseal_template_id) {
      return json({ error: 'התבנית אינה מוכנה לשליחה' }, 400);
    }

    const { data: company } = await access.adminClient
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .single();

    const { data: drivers } = await access.adminClient
      .from('profiles')
      .select('id, full_name')
      .in('id', ids)
      .eq('company_id', companyId)
      .eq('role', 'driver');
    if (!drivers?.length) return json({ error: 'לא נמצאו נהגים תקינים' }, 400);
    const { data: activeDetails } = await access.adminClient
      .from('driver_details')
      .select('id')
      .in('id', drivers.map((driver) => driver.id))
      .eq('company_id', companyId)
      .eq('status', 'active');
    const activeDriverIds = new Set((activeDetails ?? []).map((detail) => detail.id));

    const { data: actor } = await access.adminClient
      .from('profiles')
      .select('full_name')
      .eq('id', access.callerId)
      .single();

    const { data: signingSettings, error: signingSettingsError } = await access.adminClient
      .from('company_signing_settings')
      .select('email_reminders_enabled, initial_reminder_delay_hours')
      .eq('company_id', companyId)
      .maybeSingle();
    if (signingSettingsError) return json({ error: 'טעינת הגדרות תזכורות המייל נכשלה' }, 500);
    const settings = signingSettings as CompanySigningSettings | null;
    const initialReminderAt = settings?.email_reminders_enabled === false
      ? null
      : new Date(Date.now() + (settings?.initial_reminder_delay_hours ?? 72) * 60 * 60 * 1000).toISOString();

    let created = 0;
    const failed: string[] = [];
    let failureMessage = '';

    for (const driver of drivers) {
      if (!activeDriverIds.has(driver.id)) {
        failed.push(driver.id);
        failureMessage ||= 'לא ניתן לשלוח מסמך לנהג שאינו פעיל';
        continue;
      }
      const { data: authData } = await access.adminClient.auth.admin.getUserById(driver.id);
      const email = authData?.user?.email;
      if (!email) {
        failed.push(driver.id);
        failureMessage ||= 'לנהג אין חשבון משתמש תקין';
        continue;
      }

      const { data: existing } = await access.adminClient
        .from('signature_requests')
        .select('id, docuseal_submission_id, docuseal_submitter_id, docuseal_submitter_slug, provisioning_locked_until')
        .eq('template_id', templateId)
        .eq('driver_id', driver.id)
        .eq('status', 'pending')
        .is('archived_at', null)
        .maybeSingle();
      const provisioningLockUntil = new Date(Date.now() + PROVISIONING_LOCK_MINUTES * 60 * 1000).toISOString();
      let requestRow = existing;
      if (requestRow?.docuseal_submitter_id && requestRow.docuseal_submission_id && requestRow.docuseal_submitter_slug) {
        failed.push(driver.id);
        failureMessage ||= 'כבר יש לנהג מסמך שממתין לחתימה';
        continue;
      }
      if (requestRow) {
        const lockActive = requestRow.provisioning_locked_until
          && new Date(requestRow.provisioning_locked_until).getTime() > Date.now();
        if (lockActive) {
          failed.push(driver.id);
          failureMessage ||= 'בקשת החתימה כבר נוצרת, נסה שוב בעוד כמה דקות';
          continue;
        }
        const { data: claimed, error: claimError } = await access.adminClient
          .from('signature_requests')
          .update({ provisioning_locked_until: provisioningLockUntil })
          .eq('id', requestRow.id)
          .eq('status', 'pending')
          .or(`provisioning_locked_until.is.null,provisioning_locked_until.lt.${new Date().toISOString()}`)
          .select('id')
          .maybeSingle();
        if (claimError || !claimed) {
          failed.push(driver.id);
          failureMessage ||= 'בקשת החתימה כבר נוצרת, נסה שוב בעוד כמה דקות';
          continue;
        }
      } else {
        const { data: inserted, error: requestError } = await access.adminClient
          .from('signature_requests')
          .insert({
            company_id: companyId,
            template_id: templateId,
            driver_id: driver.id,
            created_by: access.callerId,
            next_email_reminder_at: initialReminderAt,
            provisioning_locked_until: provisioningLockUntil,
          })
          .select('id, docuseal_submission_id, docuseal_submitter_id, docuseal_submitter_slug, provisioning_locked_until')
          .single();
        requestRow = inserted;
        if (requestError || !requestRow) {
          failed.push(driver.id);
          failureMessage ||= 'לא ניתן ליצור בקשת חתימה באפליקציה';
          continue;
        }
      }

      // A network timeout after POST can leave a real DocuSeal submission
      // without its local IDs. The stable external_id lets us recover it
      // before issuing another email, instead of creating a duplicate.
      let submitter: DocuSealSubmitter | null;
      try {
        submitter = await findRemoteSubmitter(requestRow.id);
      } catch {
        await access.adminClient.from('signature_requests').update({ provisioning_locked_until: null })
          .eq('id', requestRow.id);
        failed.push(driver.id);
        failureMessage ||= 'לא ניתן לאמת בקשה קיימת מול DocuSeal';
        continue;
      }

      const sentDate = new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const submissionName = [template.title, driver.full_name, sentDate].filter(Boolean).join(' - ');
      // Folder groups all of a driver's documents together: CompanyName / DriverName
      const folderName = [company?.name, driver.full_name].filter(Boolean).join('/');
      const response = submitter ? null : await docusealFetch('/submissions', {
        method: 'POST',
        body: JSON.stringify({
          template_id: template.docuseal_template_id,
          // Name appears in DocuSeal dashboard and in the stored PDF filename.
          name: submissionName,
          ...(folderName ? { folder_name: folderName } : {}),
          // FleetOS uses email only. SMS is intentionally never requested.
          send_email: true,
          submitters: [{
            role: 'Driver',
            email,
            name: driver.full_name || undefined,
            external_id: requestRow.id,
            metadata: { signature_request_id: requestRow.id, company_id: companyId },
            // Drivers sign directly in-app; DocuSeal's email/phone OTP step is redundant here.
            require_email_2fa: false,
            require_phone_2fa: false,
          }],
        }),
      });
      if (response && !response.ok) {
        await access.adminClient.from('signature_requests').update({
          status: 'failed', failed_at: new Date().toISOString(), failure_reason: 'DocuSeal rejected the submission request', provisioning_locked_until: null,
        }).eq('id', requestRow.id);
        failed.push(driver.id);
        failureMessage ||= 'DocuSeal דחו את יצירת בקשת החתימה';
        continue;
      }

      if (!submitter && response) {
        const payload = await response.json() as DocuSealSubmitter[];
        submitter = Array.isArray(payload) ? payload[0] : null;
      }
      if (!submitter?.id || !submitter.submission_id || !submitter.slug) {
        // Keep the local row and its external_id. A later invocation can
        // reconcile a provider response that was lost or malformed.
        await access.adminClient.from('signature_requests').update({
          provisioning_locked_until: null,
          failure_reason: 'DocuSeal did not return a usable submitter link',
        }).eq('id', requestRow.id);
        failed.push(driver.id);
        failureMessage ||= 'DocuSeal לא החזיר קישור חתימה תקין';
        continue;
      }

      const { error: linkError } = await access.adminClient.from('signature_requests').update({
        docuseal_submission_id: submitter.submission_id,
        docuseal_submitter_id: submitter.id,
        docuseal_submitter_slug: submitter.slug,
        provisioning_locked_until: null,
        failure_reason: null,
      }).eq('id', requestRow.id).eq('status', 'pending');
      if (linkError) {
        // Do not delete the row: the next invocation can locate the same
        // submitter by external_id and finish linking it without re-sending.
        await access.adminClient.from('signature_requests').update({ provisioning_locked_until: null })
          .eq('id', requestRow.id);
        failed.push(driver.id);
        failureMessage ||= 'לא ניתן לשמור את קישור החתימה';
        continue;
      }

      const { error: notificationError } = await access.adminClient.from('notifications').insert({
        company_id: companyId,
        actor_id: access.callerId,
        actor_name: actor?.full_name || 'מנהל',
        recipient_id: driver.id,
        message: `נשלח אליך מסמך חדש לחתימה: ${template.title}`,
        notification_type: 'signature_request_assigned',
      });
      if (notificationError) console.error('failed to create signing notification');
      created += 1;
    }

    return json({ success: created > 0, created, failed, ...(failureMessage ? { message: failureMessage } : {}) });
  } catch (error) {
    console.error('assign-signing-template failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'שליחת המסמך נכשלה' }, 500);
  }
});
