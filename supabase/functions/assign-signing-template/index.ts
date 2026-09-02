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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const { companyId, templateId, driverIds } = await req.json();
    const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!access.ok) return json({ error: access.error }, access.status);
    if (access.callerRole !== 'admin') return json({ error: 'הפעולה זמינה למנהל בלבד' }, 403);

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

    const { data: drivers } = await access.adminClient
      .from('profiles')
      .select('id, full_name')
      .in('id', ids)
      .eq('company_id', companyId)
      .eq('role', 'driver');
    if (!drivers?.length) return json({ error: 'לא נמצאו נהגים תקינים' }, 400);

    const { data: actor } = await access.adminClient
      .from('profiles')
      .select('full_name')
      .eq('id', access.callerId)
      .single();

    let created = 0;
    const failed: string[] = [];
    let failureMessage = '';

    for (const driver of drivers) {
      const { data: authData } = await access.adminClient.auth.admin.getUserById(driver.id);
      const email = authData?.user?.email;
      if (!email) {
        failed.push(driver.id);
        failureMessage ||= 'לנהג אין חשבון משתמש תקין';
        continue;
      }

      const { data: existing } = await access.adminClient
        .from('signature_requests')
        .select('id')
        .eq('template_id', templateId)
        .eq('driver_id', driver.id)
        .eq('status', 'pending')
        .is('archived_at', null)
        .maybeSingle();
      if (existing) {
        failed.push(driver.id);
        failureMessage ||= 'כבר יש לנהג מסמך שממתין לחתימה';
        continue;
      }

      const { data: requestRow, error: requestError } = await access.adminClient
        .from('signature_requests')
        .insert({ company_id: companyId, template_id: templateId, driver_id: driver.id, created_by: access.callerId })
        .select('id')
        .single();
      if (requestError || !requestRow) {
        failed.push(driver.id);
        failureMessage ||= 'לא ניתן ליצור בקשת חתימה באפליקציה';
        continue;
      }

      const response = await docusealFetch('/submissions', {
        method: 'POST',
        body: JSON.stringify({
          template_id: template.docuseal_template_id,
          send_email: false,
          submitters: [{
            role: 'Driver',
            email,
            name: driver.full_name || undefined,
            require_email_2fa: true,
            external_id: requestRow.id,
            metadata: { signature_request_id: requestRow.id, company_id: companyId },
          }],
        }),
      });
      if (!response.ok) {
        await access.adminClient.from('signature_requests').update({
          status: 'failed', failed_at: new Date().toISOString(), failure_reason: 'DocuSeal rejected the submission request',
        }).eq('id', requestRow.id);
        failed.push(driver.id);
        failureMessage ||= 'DocuSeal דחו את יצירת בקשת החתימה';
        continue;
      }

      const payload = await response.json() as DocuSealSubmitter[];
      const submitter = Array.isArray(payload) ? payload[0] : null;
      if (!submitter?.id || !submitter.submission_id || !submitter.slug) {
        await access.adminClient.from('signature_requests').delete().eq('id', requestRow.id);
        failed.push(driver.id);
        failureMessage ||= 'DocuSeal לא החזיר קישור חתימה תקין';
        continue;
      }

      const { error: linkError } = await access.adminClient.from('signature_requests').update({
        docuseal_submission_id: submitter.submission_id,
        docuseal_submitter_id: submitter.id,
        docuseal_submitter_slug: submitter.slug,
      }).eq('id', requestRow.id);
      if (linkError) {
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
