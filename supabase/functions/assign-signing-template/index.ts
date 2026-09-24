import { corsHeaders } from '../_shared/cors.ts';
import { docusealFetch } from '../_shared/docuseal.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';
import { missingPrefill, type TemplateField } from '../_shared/signingPrefill.ts';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

type DocuSealSubmitter = {
  id?: number;
  submission_id?: number;
  slug?: string;
  sent_at?: string | null;
  created_at?: string;
};

const PROVISIONING_LOCK_MINUTES = 10;

/** The read-only date on a company letterhead (company-signing-template). */
const LETTERHEAD_DATE_FIELD = 'תאריך המסמך';

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

    const ids = [...new Set(Array.isArray(driverIds) ? driverIds : [])];
    if (ids.length !== 1 || typeof ids[0] !== 'string') return json({ error: 'ניתן לשלוח מסמך אחד לנהג אחד בלבד מתוך פרופיל הנהג' }, 400);

    // A template is either scoped to this company or global (company_id
    // is null), in which case every company may send it.
    const { data: template } = await access.adminClient
      .from('signing_templates')
      .select('id, company_id, title, docuseal_template_id, archived_at')
      .eq('id', templateId)
      .eq('status', 'ready')
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .single();
    if (!template || template.archived_at || !template.docuseal_template_id) {
      return json({ error: 'התבנית אינה מוכנה לשליחה' }, 400);
    }
    const templateResponse = await docusealFetch(`/templates/${template.docuseal_template_id}`);
    if (!templateResponse.ok) return json({ error: 'לא ניתן לבדוק את שדות התבנית. נסה שוב.' }, 502);
    const remoteTemplate = await templateResponse.json() as { fields?: TemplateField[]; submitters?: Array<{ name: string; uuid: string }> };
    if (remoteTemplate.submitters?.length !== 1) return json({ error: 'התבנית חייבת להכיל חותם יחיד — נהג' }, 400);

    const { data: company } = await access.adminClient
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .single();

    const { data: drivers } = await access.adminClient
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', ids)
      .eq('company_id', companyId)
      .eq('role', 'driver');
    if (!drivers?.length) return json({ error: 'לא נמצאו נהגים תקינים' }, 400);
    const { data: activeDetails } = await access.adminClient
      .from('driver_details')
      .select('id, national_id, license_number, license_classes, license_expiry')
      .in('id', drivers.map((driver) => driver.id))
      .eq('company_id', companyId)
      .eq('status', 'active');
    const activeDriverDetails = new Map((activeDetails ?? []).map((detail) => [detail.id, detail]));

    const { data: actor } = await access.adminClient
      .from('profiles')
      .select('full_name')
      .eq('id', access.callerId)
      .single();

    // DocuSeal's own "signing date" placeholder: it stays open until the driver
    // signs and is then stamped with that day (in the DocuSeal account's time zone).
    const signingDate = '{{date}}';

    let created = 0;
    const failed: string[] = [];
    let failureMessage = '';

    for (const driver of drivers) {
      const driverDetails = activeDriverDetails.get(driver.id);
      if (!driverDetails) {
        failed.push(driver.id);
        failureMessage ||= 'לא ניתן לשלוח מסמך לנהג שאינו פעיל';
        continue;
      }
      const { data: authData } = await access.adminClient.auth.admin.getUserById(driver.id);
      const email = authData?.user?.email;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        failed.push(driver.id);
        failureMessage ||= 'יש לעדכן כתובת אימייל תקינה בפרופיל הנהג לפני השליחה';
        continue;
      }
      const values = {
        company_name: company?.name, driver_full_name: driver.full_name,
        driver_phone: driver.phone, driver_national_id: driverDetails.national_id,
        driver_license_number: driverDetails.license_number,
        driver_license_classes: driverDetails.license_classes,
        driver_license_expiry: driverDetails.license_expiry,
        // The letterhead date on documents written in "מסמכים חתומים" is the day it is signed.
        [LETTERHEAD_DATE_FIELD]: signingDate,
      };
      const missing = missingPrefill(remoteTemplate.fields || [], values);
      if (!company?.name) missing.push('שם החברה');
      if (!driver.full_name) missing.push('שם הנהג');
      if (missing.length) { failed.push(driver.id); failureMessage ||= `יש להשלים לפני השליחה: ${[...new Set(missing)].join(', ')}`; continue; }

      const { data: existing, error: existingError } = await access.adminClient
        .from('signature_requests')
        .select('id, docuseal_submission_id, docuseal_submitter_id, docuseal_submitter_slug, provisioning_locked_until')
        .eq('template_id', templateId)
        .eq('driver_id', driver.id)
        .eq('status', 'pending')
        .is('archived_at', null)
        .maybeSingle();
      if (existingError) throw existingError;
      const provisioningLockUntil = new Date(Date.now() + PROVISIONING_LOCK_MINUTES * 60 * 1000).toISOString();
      let requestRow = existing;
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

        // A manager deliberately sending the same template again replaces the
        // unsigned request. Cancel the remote submission before hiding the local
        // request, so an old email link cannot still be used to sign.
        if (requestRow.docuseal_submitter_id && requestRow.docuseal_submission_id && requestRow.docuseal_submitter_slug) {
          const cancelResponse = await docusealFetch(`/submissions/${requestRow.docuseal_submission_id}`, { method: 'DELETE' });
          if (!cancelResponse.ok && cancelResponse.status !== 404) {
            await access.adminClient.from('signature_requests').update({ provisioning_locked_until: null })
              .eq('id', requestRow.id).eq('status', 'pending');
            failed.push(driver.id);
            failureMessage ||= 'לא ניתן לבטל את הבקשה הקודמת ב-DocuSeal. לא נשלחה בקשה חדשה.';
            continue;
          }
          const { error: archiveError } = await access.adminClient.from('signature_requests').update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancelled_by: access.callerId,
            archived_at: new Date().toISOString(),
            archived_by: access.callerId,
            provisioning_locked_until: null,
            next_email_reminder_at: null,
            email_reminder_locked_until: null,
          }).eq('id', requestRow.id).eq('status', 'pending');
          if (archiveError) {
            failed.push(driver.id);
            failureMessage ||= 'הבקשה הקודמת בוטלה ב-DocuSeal אך לא ניתן היה להחליף אותה באפליקציה. נסה שוב.';
            continue;
          }
          // Archived requests are not shown in the driver's folder. A fresh row
          // also receives a fresh external_id, avoiding any provider reuse.
          requestRow = null;
        }
      }
      if (!requestRow) {
        const { data: inserted, error: requestError } = await access.adminClient
          .from('signature_requests')
          .insert({
            company_id: companyId,
            template_id: templateId,
            driver_id: driver.id,
            created_by: access.callerId,
            template_title: template.title,
            // Signing is in-app only. No email reminder is ever scheduled.
            next_email_reminder_at: null,
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
      let sentAt = submitter?.sent_at || submitter?.created_at || new Date().toISOString();
      const submissionName = [template.title, driver.full_name, sentDate].filter(Boolean).join(' - ');
      // Folder groups all of a driver's documents together: CompanyName / DriverName
      const folderName = [company?.name, driver.full_name].filter(Boolean).join('/');
      let response: Response | null;
      try {
      response = submitter ? null : await docusealFetch('/submissions', {
        method: 'POST',
        body: JSON.stringify({
          template_id: template.docuseal_template_id,
          // Name appears in DocuSeal dashboard and in the stored PDF filename.
          name: submissionName,
          ...(folderName ? { folder_name: folderName } : {}),
          // FleetOS opens the signing form only inside the authenticated app.
          // Keep the address for DocuSeal's signer record, but never email it.
          send_email: false,
          submitters: [{
            role: remoteTemplate.submitters[0].name,
            email,
            send_email: false,
            name: driver.full_name || undefined,
            external_id: requestRow.id,
            metadata: { signature_request_id: requestRow.id, company_id: companyId },
            // Drivers sign directly in-app; DocuSeal's email/phone OTP step is redundant here.
            require_email_2fa: false,
            require_phone_2fa: false,
            fields: Object.entries(values).filter(([, value]) => value != null && value !== '').map(([name, default_value]) => ({ name, default_value, readonly: true })),
            // Global templates use these read-only text fields when relevant.
            // Unknown names are intentionally ignored by DocuSeal, so a simple
            // template can still use only company_name while health forms can
            // merge the driver's official details into the same shared PDF.
            values: {
              ...(company?.name ? { company_name: company.name } : {}),
              ...(driver.full_name ? { driver_full_name: driver.full_name } : {}),
              ...(driver.phone ? { driver_phone: driver.phone } : {}),
              ...(driverDetails.national_id ? { driver_national_id: driverDetails.national_id } : {}),
              ...(driverDetails.license_number ? { driver_license_number: driverDetails.license_number } : {}),
              ...(driverDetails.license_classes ? { driver_license_classes: driverDetails.license_classes } : {}),
              ...(driverDetails.license_expiry ? { driver_license_expiry: driverDetails.license_expiry } : {}),
              [LETTERHEAD_DATE_FIELD]: signingDate,
            },
          }],
        }),
      });
      } catch {
        await access.adminClient.from('signature_requests').update({ provisioning_locked_until: null, failure_reason: 'Submission response unavailable' }).eq('id', requestRow.id).eq('status', 'pending');
        failed.push(driver.id); failureMessage ||= 'השליחה לא אושרה. נסה שוב כדי לבדוק את הבקשה הקיימת.'; continue;
      }
      if (response && !response.ok) {
        await access.adminClient.from('signature_requests').update({
          status: response.status >= 500 ? 'pending' : 'failed', failed_at: new Date().toISOString(), failure_reason: 'DocuSeal rejected the submission request', provisioning_locked_until: null,
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
      const providerSentAt = submitter.sent_at || submitter.created_at;
      if (providerSentAt && Number.isFinite(Date.parse(providerSentAt))) sentAt = new Date(providerSentAt).toISOString();

      const { error: linkError } = await access.adminClient.from('signature_requests').update({
        sent_at: sentAt,
        expires_at: null,
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
        signature_request_id: requestRow.id,
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
