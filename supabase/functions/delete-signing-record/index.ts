import { corsHeaders } from '../_shared/cors.ts';
import { docusealFetch } from '../_shared/docuseal.ts';
import { isSignedRequestPath, isSigningTemplateSourcePath } from '../_shared/signingPaths.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';
import { verifyUser } from '../_shared/verifyUser.ts';

// Matches the sentinel used for global templates' storage paths (see
// import-docuseal-templates) — storage policies require a uuid-shaped first
// path segment, so global rows have no real company to key their files by.
const GLOBAL_COMPANY_SENTINEL = '00000000-0000-0000-0000-000000000000';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

type SignedRequest = { id: string; company_id: string; driver_id: string; docuseal_submitter_id: number | null; signed_file_path: string | null };

/** Stores a signed request's PDF from DocuSeal; the stored path, or null when it is not ready. */
// deno-lint-ignore no-explicit-any
async function storeSignedPdf(db: any, request: SignedRequest): Promise<string | null> {
  if (!request.docuseal_submitter_id) return null;
  try {
    const response = await docusealFetch(`/submitters/${request.docuseal_submitter_id}`);
    if (!response.ok) return null;
    const signer = await response.json() as { status?: string; documents?: Array<{ url?: string }> };
    const url = signer.documents?.[0]?.url;
    if (signer.status !== 'completed' || !url) return null;
    const pdf = await fetch(url);
    if (!pdf.ok) return null;
    const path = `${request.company_id}/driver/${request.driver_id}/signed/${request.id}.pdf`;
    const { error: uploadError } = await db.storage.from('documents')
      .upload(path, new Uint8Array(await pdf.arrayBuffer()), { contentType: 'application/pdf', upsert: false });
    if (uploadError && String(uploadError.statusCode) !== '409') return null;
    const { error } = await db.from('signature_requests').update({ signed_file_path: path })
      .eq('id', request.id).eq('status', 'completed').is('signed_file_path', null);
    return error ? null : path;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const { companyId, kind, id, action = 'archive' } = await req.json();
    if (!['archive', 'restore', 'permanent-delete', 'company-delete', 'erase'].includes(action)) return json({ error: 'פעולה אינה תקינה' }, 400);
    if (action === 'company-delete' && kind !== 'template') return json({ error: 'פעולה אינה תקינה' }, 400);
    if (action === 'erase' && kind !== 'request') return json({ error: 'פעולה אינה תקינה' }, 400);

    if (kind === 'request') {
      const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
      if (!access.ok) return json({ error: access.error }, access.status);
      if (access.callerRole !== 'admin' && access.callerRole !== 'owner') return json({ error: 'אין הרשאה לנהל מסמכי חתימה' }, 403);

      const { data: item } = await access.adminClient.from('signature_requests').select('*')
        .eq('id', id).eq('company_id', companyId).single();
      if (!item) return json({ error: 'המסמך לא נמצא' }, 404);

      // `erase`: the manager removes one document of one driver for good, in any
      // state, signed ones included: the DocuSeal submission, the stored PDF and
      // the row (its notifications go with it). No record of the deletion is kept.
      if (action === 'erase') {
        const { data: meeting } = await access.adminClient.from('checklist_meetings')
          .select('id').eq('signature_request_id', id).maybeSingle();
        // A meeting's document is deleted with its meeting (checklist-meeting "cancel").
        if (meeting) return json({ error: 'זה מסמך של טופס שמולא עם נהג. מוחקים אותו מתוך הטופס בתיק הנהג.' }, 409);
        // A safety inspection is never deleted, only cancelled (vehicle-inspection "cancel").
        const { data: inspection } = await access.adminClient.from('vehicle_inspections')
          .select('id').eq('signature_request_id', id).maybeSingle();
        if (inspection) return json({ error: 'זה מסמך של בדיקת קצין בטיחות. אפשר לבטל אותה מתוך הבדיקה, בעמוד "בדיקות קצין בטיחות".' }, 409);
        if (item.status === 'pending') {
          // Claim it first, so a signature being saved right now is never cut in half.
          const now = new Date().toISOString();
          const { data: claimed, error: claimError } = await access.adminClient.from('signature_requests').update({
            status: 'cancelled', cancelled_at: now, cancelled_by: access.callerId,
            next_email_reminder_at: null, email_reminder_locked_until: null,
          }).eq('id', id).eq('status', 'pending')
            .or(`sync_locked_until.is.null,sync_locked_until.lt.${now}`)
            .select('id').maybeSingle();
          if (claimError) return json({ error: 'מחיקת המסמך נכשלה' }, 500);
          if (!claimed) {
            const { data: current } = await access.adminClient.from('signature_requests').select('status').eq('id', id).maybeSingle();
            if (current?.status === 'pending') return json({ error: 'הנהג חותם על המסמך ברגע זה. חכו רגע ונסו שוב.' }, 409);
          }
        }
        if (item.docuseal_submission_id) {
          const response = await docusealFetch(`/submissions/${item.docuseal_submission_id}`, { method: 'DELETE' });
          if (!response.ok && response.status !== 404) return json({ error: 'לא ניתן למחוק את המסמך כרגע. נסו שוב.' }, 502);
        }
        if (isSignedRequestPath(item.company_id, item.driver_id, item.id, item.signed_file_path)) {
          const { error: storageError } = await access.adminClient.storage.from('documents').remove([item.signed_file_path]);
          if (storageError) return json({ error: 'מחיקת קובץ המסמך נכשלה' }, 500);
        }
        const { error: eraseError } = await access.adminClient.from('signature_requests').delete().eq('id', id).eq('company_id', companyId);
        if (eraseError) return json({ error: 'מחיקת המסמך נכשלה' }, 500);
        return json({ success: true });
      }

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
        // Reserve the pending request before touching DocuSeal. Without this,
        // a driver could finish signing between the initial read and the
        // provider deletion, leaving a completed remote document archived as
        // cancelled locally (or losing its evidence entirely).
        const lockStartedAt = new Date().toISOString();
        const lockUntil = new Date(Date.now() + 3 * 60_000).toISOString();
        const { data: claimed, error: claimError } = await access.adminClient.from('signature_requests')
          .update({ sync_locked_until: lockUntil })
          .eq('id', id).eq('company_id', companyId).eq('status', 'pending')
          .or(`sync_locked_until.is.null,sync_locked_until.lt.${lockStartedAt}`)
          .select('id').maybeSingle();
        if (claimError) return json({ error: 'ביטול המסמך נכשל' }, 500);
        if (!claimed) return json({ error: 'הנהג חותם על המסמך ברגע זה. חכו רגע ונסו שוב.' }, 409);

        const response = await docusealFetch(`/submissions/${item.docuseal_submission_id}`, { method: 'DELETE' });
        // Already gone on DocuSeal's side (e.g. deleted there directly) — nothing left to cancel.
        if (!response.ok && response.status !== 404) {
          await access.adminClient.from('signature_requests').update({ sync_locked_until: null })
            .eq('id', id).eq('status', 'pending').eq('sync_locked_until', lockUntil);
          return json({ error: 'לא ניתן לבטל את החתימה ב-DocuSeal כרגע' }, 502);
        }

        const { data: archived, error: archiveError } = await access.adminClient.from('signature_requests').update({
          archived_at: new Date().toISOString(), archived_by: access.callerId,
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: access.callerId,
          next_email_reminder_at: null,
          email_reminder_locked_until: null,
          sync_locked_until: null,
        }).eq('id', id).eq('status', 'pending').eq('sync_locked_until', lockUntil)
          .select('id').maybeSingle();
        if (archiveError || !archived) return json({ error: 'המסמך השתנה בזמן הביטול. רעננו ונסו שוב.' }, 409);
        return json({ success: true });
      }
      const { error: archiveError } = await access.adminClient.from('signature_requests').update({
        archived_at: new Date().toISOString(), archived_by: access.callerId,
        ...(item.status === 'pending' ? {
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: access.callerId,
          next_email_reminder_at: null,
          email_reminder_locked_until: null,
        } : {}),
      }).eq('id', id);
      if (archiveError) return json({ error: 'העברת המסמך לארכיון נכשלה' }, 500);
      return json({ success: true });
    }

    if (kind === 'template') {
      // Global templates are shared by every company, so only the platform
      // owner may archive, restore or delete one. A company's own template
      // (made in "מסמכים חתומים") may also be deleted by that company's admin,
      // in one step: `company-delete`.
      const user = await verifyUser(req.headers.get('Authorization'));
      if (!user.ok) return json({ error: user.error }, user.status);
      const { adminClient, userId } = user;

      const { data: template } = await adminClient.from('signing_templates').select('*').eq('id', id).single();
      if (!template) return json({ error: 'התבנית לא נמצאה' }, 404);
      const isGlobal = template.company_id === null;
      const ownCompanyAdmin = user.profile.role === 'admin' && !isGlobal && template.company_id === user.profile.company_id;
      if (action === 'company-delete' ? user.profile.role !== 'owner' && !ownCompanyAdmin : user.profile.role !== 'owner') {
        return json({ error: action === 'company-delete' ? 'אין הרשאה למחוק את המסמך' : 'רק הבעלים יכול לנהל תבניות' }, 403);
      }
      if (action === 'company-delete' && isGlobal) return json({ error: 'אי אפשר למחוק מסמך מוכן מהמערכת' }, 403);
      const sourcePathCompanyId = template.company_id ?? GLOBAL_COMPANY_SENTINEL;
      // A form's earlier versions keep their DocuSeal templates: they hold
      // drivers' signatures and are never deleted here.

      if (action === 'restore') {
        await adminClient.from('signing_templates').update({ archived_at: null, archived_by: userId }).eq('id', id);
        return json({ success: true });
      }
      if (action === 'permanent-delete' || action === 'company-delete') {
        // `company-delete` skips the archive step: the admin confirmed on screen,
        // and requests still waiting for a signature are cancelled with it.
        if (!template.archived_at && action !== 'company-delete') return json({ error: 'אפשר למחוק לצמיתות רק תבנית שנמצאת בארכיון' }, 409);
        let requestsQuery = adminClient.from('signature_requests')
          .select('id, company_id, driver_id, status, docuseal_submission_id, docuseal_submitter_id, signed_file_path')
          .eq('template_id', id);
        if (!isGlobal) requestsQuery = requestsQuery.eq('company_id', template.company_id);
        const { data: allRequests, error: requestsError } = await requestsQuery;
        if (requestsError) return json({ error: 'טעינת מסמכי התבנית נכשלה' }, 500);

        // Signed documents survive their template: the title is snapshotted so they
        // stay readable, and the foreign key detaches them instead of cascading. A
        // global template's requests can belong to any company, so this runs across
        // all of them rather than one.
        const signedRequests = (allRequests ?? []).filter((request) => request.status === 'completed');
        const requests = (allRequests ?? []).filter((request) => request.status !== 'completed');
        // A signed copy whose PDF never reached storage is fetched now (the same
        // repair the driver's folder runs), so the manager is not sent to sync
        // each driver by hand before the template can go.
        for (const request of signedRequests) {
          if (isSignedRequestPath(request.company_id, request.driver_id, request.id, request.signed_file_path)) continue;
          const path = await storeSignedPdf(adminClient, request);
          if (path) request.signed_file_path = path;
        }
        // Deleting the DocuSeal template can take its submissions down with it, so a
        // signed document without a locally stored PDF has no evidence left to keep.
        if (signedRequests.some((request) => !isSignedRequestPath(
          request.company_id,
          request.driver_id,
          request.id,
          request.signed_file_path,
        ))) {
          return json({ error: 'לטופס יש מסמך חתום שהקובץ שלו עוד לא הגיע מ-DocuSeal. נסו למחוק שוב בעוד כמה דקות.' }, 409);
        }

        // Meetings on this form ("מפגש שיחה") that are not signed evidence go
        // with it: drafts, and meetings still waiting for the driver (their
        // request is deleted below). Otherwise they lose their form and stay
        // behind where no screen shows them. Signed meetings stay in the file.
        const unsignedRequestIds = new Set(requests.map((request) => request.id));
        const { data: formMeetings, error: meetingsError } = await adminClient.from('checklist_meetings')
          .select('id, status, signature_request_id').eq('template_id', id);
        if (meetingsError) return json({ error: 'טעינת המילויים של הטופס נכשלה' }, 500);
        const meetingIds = (formMeetings ?? [])
          .filter((meeting) => meeting.status !== 'signed' || !meeting.signature_request_id || unsignedRequestIds.has(meeting.signature_request_id))
          .map((meeting) => meeting.id);

        // The snapshot update, the non-completed requests delete and the template
        // delete run as one transaction, so a crash mid-way can no longer leave the
        // DB half-updated (e.g. requests gone but the template still there).
        const { data: deleted, error: deleteError } = isGlobal
          ? await adminClient.rpc('delete_global_signing_template_records', {
            target_template_id: id, template_title_snapshot: template.title,
          })
          : await adminClient.rpc('delete_signing_template_records', {
            target_template_id: id, target_company_id: template.company_id, template_title_snapshot: template.title,
          });
        if (deleteError || deleted !== true) return json({ error: 'מחיקת התבנית נכשלה' }, 500);

        // The database is already consistent at this point. Everything below is
        // best-effort cleanup of external resources: a failure here leaves only an
        // orphaned DocuSeal template/submission or storage file, never a broken row.
        let cleanupPending = false;
        if (meetingIds.length) {
          const { error: meetingsDeleteError } = await adminClient.from('checklist_meetings').delete().in('id', meetingIds);
          if (meetingsDeleteError) {
            console.error('delete-signing-record: meeting cleanup failed', meetingsDeleteError.message);
            cleanupPending = true;
          }
        }
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
          ...(isSigningTemplateSourcePath(sourcePathCompanyId, template.source_file_path) ? [template.source_file_path] : []),
          ...requests.flatMap((request) => isSignedRequestPath(
            request.company_id,
            request.driver_id,
            request.id,
            request.signed_file_path,
          ) ? [request.signed_file_path] : []),
        ];
        if (paths.length) {
          const { error: storageError } = await adminClient.storage.from('documents').remove(paths);
          if (storageError) {
            console.error('delete-signing-record: storage cleanup failed', storageError.message);
            cleanupPending = true;
          }
        }
        return json({ success: true, cleanupPending });
      }
      // archive: blocked while any company anywhere still has a pending request.
      const { data: activeRequests } = await adminClient.from('signature_requests').select('id')
        .eq('template_id', id).eq('status', 'pending').is('archived_at', null).limit(1);
      if (activeRequests?.length) return json({ error: 'אי אפשר לארכב תבנית שיש לה מסמכים שממתינים לחתימה' }, 409);
      await adminClient.from('signing_templates').update({
        archived_at: new Date().toISOString(), archived_by: userId,
      }).eq('id', id);
      return json({ success: true });
    }

    return json({ error: 'סוג רשומה לא תקין' }, 400);
  } catch (error) {
    console.error('delete-signing-record failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'מחיקת המסמך נכשלה' }, 500);
  }
});
