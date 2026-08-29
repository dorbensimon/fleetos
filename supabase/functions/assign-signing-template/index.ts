import { corsHeaders } from '../_shared/cors.ts';
import { docusealFetch } from '../_shared/docuseal.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

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
      .select('id, title, docuseal_template_id')
      .eq('id', templateId)
      .eq('company_id', companyId)
      .eq('status', 'ready')
      .single();
    if (!template?.docuseal_template_id) return json({ error: 'התבנית אינה מוכנה לשליחה' }, 400);

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
    for (const driver of drivers) {
      const { data: authData } = await access.adminClient.auth.admin.getUserById(driver.id);
      const email = authData?.user?.email;
      if (!email) { failed.push(driver.id); continue; }

      const { data: requestRow, error: requestError } = await access.adminClient
        .from('signature_requests')
        .insert({ company_id: companyId, template_id: templateId, driver_id: driver.id, created_by: access.callerId })
        .select('id')
        .single();
      if (requestError || !requestRow) { failed.push(driver.id); continue; }

      const response = await docusealFetch('/submissions', {
        method: 'POST',
        body: JSON.stringify({
          template_id: template.docuseal_template_id,
          send_email: false,
          submitters: [{
            role: 'Driver',
            email,
            name: driver.full_name || undefined,
            external_id: requestRow.id,
            metadata: { signature_request_id: requestRow.id, company_id: companyId },
          }],
        }),
      });
      if (!response.ok) {
        await access.adminClient.from('signature_requests').delete().eq('id', requestRow.id);
        failed.push(driver.id);
        continue;
      }

      const submitter = (await response.json())?.[0];
      if (!submitter?.id || !submitter?.submission_id || !submitter?.slug) {
        await access.adminClient.from('signature_requests').delete().eq('id', requestRow.id);
        failed.push(driver.id);
        continue;
      }
      const { error: linkError } = await access.adminClient.from('signature_requests').update({
        docuseal_submission_id: submitter.submission_id,
        docuseal_submitter_id: submitter.id,
        docuseal_submitter_slug: submitter.slug,
      }).eq('id', requestRow.id);
      if (linkError) {
        failed.push(driver.id);
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

    return json({ success: created > 0, created, failed });
  } catch (error) {
    console.error('assign-signing-template failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'שליחת המסמך נכשלה' }, 500);
  }
});
