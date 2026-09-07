import { corsHeaders } from '../_shared/cors.ts';
import { docusealFetch } from '../_shared/docuseal.ts';
import { isSignedRequestPath, isSigningTemplateSourcePath } from '../_shared/signingPaths.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const { companyId, kind, id, action = 'archive' } = await req.json();
    const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!access.ok) return json({ error: access.error }, access.status);
    if (access.callerRole !== 'admin' && access.callerRole !== 'owner') return json({ error: 'אין הרשאה לנהל מסמכי חתימה' }, 403);

    if (!['archive', 'restore', 'permanent-delete'].includes(action)) return json({ error: 'פעולה אינה תקינה' }, 400);

    if (kind === 'request') {
      const { data: item } = await access.adminClient.from('signature_requests').select('*')
        .eq('id', id).eq('company_id', companyId).single();
      if (!item) return json({ error: 'המסמך לא נמצא' }, 404);
      // A preserved signed document is out of the archive for good; it must not be
      // restored or re-archived back into the admin's list.
      if (item.deleted_at && action !== 'permanent-delete') return json({ error: 'המסמך כבר הוסר מהארכיון' }, 409);

      if (action === 'restore') {
        if (!item.archived_at) return json({ success: true });
        if (!['completed', 'declined'].includes(item.status)) {
          return json({ error: 'אפשר לשחזר רק מסמך חתום או מסמך שנדחה' }, 409);
        }
        await access.adminClient.from('signature_requests').update({ archived_at: null, archived_by: null }).eq('id', id);
        return json({ success: true });
      }

      if (action === 'permanent-delete') {
        if (!item.archived_at) return json({ error: 'אפשר למחוק לצמיתות רק מסמך שנמצא בארכיון' }, 409);
        // A signed document is evidence. It leaves the archive view but the row,
        // the stored PDF and the DocuSeal submission all stay untouched.
        if (item.status === 'completed') {
          const { error: hideError } = await access.adminClient.from('signature_requests')
            .update({ deleted_at: new Date().toISOString(), deleted_by: access.callerId })
            .eq('id', id).eq('company_id', companyId);
          if (hideError) return json({ error: 'הסרת המסמך מהארכיון נכשלה' }, 500);
          return json({ success: true, preserved: true });
        }
        if (item.docuseal_submission_id) {
          const response = await docusealFetch(`/submissions/${item.docuseal_submission_id}`, { method: 'DELETE' });
          if (!response.ok && response.status !== 404) return json({ error: 'לא ניתן לארכב את המסמך ב-DocuSeal כרגע' }, 502);
        }
        const paths = isSignedRequestPath(item.company_id, item.driver_id, item.id, item.signed_file_path)
          ? [item.signed_file_path]
          : [];
        if (paths.length) {
          const { error: storageError } = await access.adminClient.storage.from('documents').remove(paths);
          if (storageError) return json({ error: 'מחיקת קובץ המסמך נכשלה' }, 500);
        }
        const { error: deleteError } = await access.adminClient.from('signature_requests').delete().eq('id', id).eq('company_id', companyId);
        if (deleteError) return json({ error: 'מחיקת רשומת המסמך נכשלה' }, 500);
        return json({ success: true });
      }

      if (item.archived_at) return json({ success: true });
      if (item.status === 'pending' && item.docuseal_submission_id) {
        const response = await docusealFetch(`/submissions/${item.docuseal_submission_id}`, { method: 'DELETE' });
        if (!response.ok) return json({ error: 'לא ניתן לבטל את החתימה ב-DocuSeal כרגע' }, 502);
      }
      await access.adminClient.from('signature_requests').update({
        archived_at: new Date().toISOString(), archived_by: access.callerId,
        ...(item.status === 'pending' ? {
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: access.callerId,
          next_email_reminder_at: null,
          email_reminder_locked_until: null,
        } : {}),
      }).eq('id', id);
      return json({ success: true });
    }

    const { data: template } = await access.adminClient.from('signing_templates').select('*')
      .eq('id', id).eq('company_id', companyId).single();
    if (!template) return json({ error: 'התבנית לא נמצאה' }, 404);

    if (action === 'restore') {
      await access.adminClient.from('signing_templates').update({ archived_at: null, archived_by: null }).eq('id', id);
      return json({ success: true });
    }
    if (action === 'permanent-delete') {
      if (!template.archived_at) return json({ error: 'אפשר למחוק לצמיתות רק תבנית שנמצאת בארכיון' }, 409);
      const { data: allRequests, error: requestsError } = await access.adminClient.from('signature_requests')
        .select('id, company_id, driver_id, status, docuseal_submission_id, signed_file_path').eq('template_id', id).eq('company_id', companyId);
      if (requestsError) return json({ error: 'טעינת מסמכי התבנית נכשלה' }, 500);

      // Signed documents survive their template: the title is snapshotted so they
      // stay readable, and the foreign key detaches them instead of cascading.
      const signedRequests = (allRequests ?? []).filter((request) => request.status === 'completed');
      const requests = (allRequests ?? []).filter((request) => request.status !== 'completed');
      // Deleting the DocuSeal template can take its submissions down with it, so a
      // signed document without a locally stored PDF has no evidence left to keep.
      if (signedRequests.some((request) => !isSignedRequestPath(
        request.company_id,
        request.driver_id,
        request.id,
        request.signed_file_path,
      ))) {
        return json({ error: 'לתבנית יש מסמך חתום שהקובץ שלו עדיין לא נשמר ב-FleetOS. יש לסנכרן אותו לפני מחיקת התבנית' }, 409);
      }

      // The snapshot update, the non-completed requests delete and the template
      // delete run as one transaction, so a crash mid-way can no longer leave the
      // DB half-updated (e.g. requests gone but the template still there).
      const { data: deleted, error: deleteError } = await access.adminClient.rpc(
        'delete_signing_template_records',
        { target_template_id: id, target_company_id: companyId, template_title_snapshot: template.title },
      );
      if (deleteError || deleted !== true) return json({ error: 'מחיקת התבנית נכשלה' }, 500);

      // The database is already consistent at this point. Everything below is
      // best-effort cleanup of external resources: a failure here leaves only an
      // orphaned DocuSeal template/submission or storage file, never a broken row.
      let cleanupPending = false;
      for (const request of requests) {
        if (!request.docuseal_submission_id) continue;
        const response = await docusealFetch(`/submissions/${request.docuseal_submission_id}`, { method: 'DELETE' });
        if (!response.ok && response.status !== 404) {
          console.error('delete-signing-record: docuseal submission cleanup failed', request.id, response.status);
          cleanupPending = true;
        }
      }
      if (template.docuseal_template_id) {
        const response = await docusealFetch(`/templates/${template.docuseal_template_id}`, { method: 'DELETE' });
        if (!response.ok && response.status !== 404) {
          console.error('delete-signing-record: docuseal template cleanup failed', template.id, response.status);
          cleanupPending = true;
        }
      }
      const paths = [
        ...(isSigningTemplateSourcePath(companyId, template.source_file_path) ? [template.source_file_path] : []),
        ...requests.flatMap((request) => isSignedRequestPath(
          request.company_id,
          request.driver_id,
          request.id,
          request.signed_file_path,
        ) ? [request.signed_file_path] : []),
      ];
      if (paths.length) {
        const { error: storageError } = await access.adminClient.storage.from('documents').remove(paths);
        if (storageError) {
          console.error('delete-signing-record: storage cleanup failed', storageError.message);
          cleanupPending = true;
        }
      }
      return json({ success: true, cleanupPending });
    }
    const { data: activeRequests } = await access.adminClient.from('signature_requests').select('id')
      .eq('template_id', id).eq('status', 'pending').is('archived_at', null).limit(1);
    if (activeRequests?.length) return json({ error: 'אי אפשר לארכב תבנית שיש לה מסמכים שממתינים לחתימה' }, 409);
    await access.adminClient.from('signing_templates').update({
      archived_at: new Date().toISOString(), archived_by: access.callerId,
    }).eq('id', id);
    return json({ success: true });
  } catch (error) {
    console.error('delete-signing-record failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'מחיקת המסמך נכשלה' }, 500);
  }
});
