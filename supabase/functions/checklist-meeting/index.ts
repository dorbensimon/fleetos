import { corsHeaders } from '../_shared/cors.ts';
import { docusealFetch } from '../_shared/docuseal.ts';
import { isSignedRequestPath } from '../_shared/signingPaths.ts';
import { verifyUser } from '../_shared/verifyUser.ts';
import {
  DRIVER_FIELD,
  DRIVER_ROLE,
  LIMITS,
  OFFICER_FIELD,
  OFFICER_ROLE,
  addMonths,
  everyItemAnswered,
  isIsoDay,
  parseAnswers,
  parseForm,
  renderChecklistHtml,
  repeatMonthsOf,
  signaturePng,
  type Form,
} from '../_shared/checklistDocument.ts';

/**
 * A meeting on a "רשימת סעיפים" form (lib/checklistForms.ts).
 *
 * save         starts a meeting from a company form, or saves one in progress.
 * sign         the officer signs: the document is rendered from the answers,
 *              the officer's drawing is stamped into their field, and the
 *              driver gets a normal signing request in the app.
 * driver-sign  the driver signs right away, on the manager's device.
 * notify       tells the driver there is a meeting form to sign.
 * cancel       deletes the meeting at any stage, with its document.
 * set-next     moves one driver's next meeting on a repeating form.
 * set-repeat   how often a form repeats (0 = one time).
 *
 * Signing a meeting on a repeating form sets the driver's next meeting
 * (checklist_schedule, supabase/sql/97_checklist_meeting_schedule.sql);
 * deleting that meeting takes the date back.
 *
 * Only the company's managers (and the platform owner) reach any of these.
 */

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGN_LOCK_MINUTES = 3;

type Submitter = { id?: number; submission_id?: number; slug?: string; role?: string; external_id?: string | null; sent_at?: string | null; created_at?: string };

function oneLine(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** Today in Israel, as YYYY-MM-DD. */
function israelToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** A meeting may be dated up to a year back (entered late), never in the future. */
function meetingDateOrNull(value: unknown): string | null {
  if (!isIsoDay(value)) return null;
  const today = israelToday();
  const yearAgo = new Date(`${today}T00:00:00Z`);
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  return value <= today && value >= yearAgo.toISOString().slice(0, 10) ? value : null;
}

function dayText(value: string): string {
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const body = await req.json();
    const { action, companyId } = body ?? {};
    if (typeof companyId !== 'string' || !UUID.test(companyId)) return json({ error: 'חסר מזהה חברה' }, 400);

    const user = await verifyUser(req.headers.get('Authorization'));
    if (!user.ok) return json({ error: user.error }, user.status);
    const allowed = user.profile.role === 'owner' || (user.profile.role === 'admin' && user.profile.company_id === companyId);
    if (!allowed) return json({ error: 'אין הרשאה לבצע פעולה זו' }, 403);
    const db = user.adminClient;

    const loadMeeting = async () => {
      if (typeof body.meetingId !== 'string' || !UUID.test(body.meetingId)) return null;
      const { data } = await db.from('checklist_meetings').select('*').eq('id', body.meetingId).eq('company_id', companyId).maybeSingle();
      return data;
    };

    // ── save ──────────────────────────────────────────────────────────
    if (action === 'save') {
      const officerName = oneLine(body.officerName, LIMITS.officerName);
      const meetingDate = meetingDateOrNull(body.meetingDate) ?? israelToday();

      if (body.meetingId) {
        const meeting = await loadMeeting();
        if (!meeting) return json({ error: 'המפגש לא נמצא' }, 404);
        if (meeting.status !== 'draft') return json({ error: 'המפגש כבר נחתם ואי אפשר לשנות אותו' }, 409);
        const form = parseForm(meeting.form);
        if (!form) return json({ error: 'הטופס של המפגש אינו תקין' }, 500);
        const { data: saved, error } = await db.from('checklist_meetings').update({
          answers: parseAnswers(body.answers, form),
          officer_name: officerName || null,
          meeting_date: meetingDate,
        }).eq('id', meeting.id).eq('status', 'draft').select('*').maybeSingle();
        if (error || !saved) return json({ error: 'שמירת הטיוטה נכשלה' }, 500);
        return json({ meeting: saved });
      }

      const { templateId, driverId } = body;
      if (typeof templateId !== 'string' || !UUID.test(templateId) || typeof driverId !== 'string' || !UUID.test(driverId)) {
        return json({ error: 'חסרים פרטי המפגש' }, 400);
      }
      const { data: template } = await db.from('signing_templates')
        .select('id, company_id, title, status, archived_at, form_kind, form_content')
        .eq('id', templateId).eq('company_id', companyId).maybeSingle();
      if (!template || template.form_kind !== 'checklist' || template.status !== 'ready' || template.archived_at) {
        return json({ error: 'הטופס לא נמצא' }, 404);
      }
      const form = parseForm(template.form_content);
      if (!form) return json({ error: 'הטופס אינו תקין' }, 500);
      const { data: driver } = await db.from('profiles').select('id').eq('id', driverId).eq('company_id', companyId).eq('role', 'driver').maybeSingle();
      const { data: details } = await db.from('driver_details').select('id').eq('id', driverId).eq('company_id', companyId).eq('status', 'active').maybeSingle();
      if (!driver || !details) return json({ error: 'אפשר לקיים מפגש רק עם נהג פעיל' }, 400);

      const { data: created, error } = await db.from('checklist_meetings').insert({
        company_id: companyId,
        template_id: template.id,
        driver_id: driverId,
        created_by: user.userId,
        title: template.title,
        form,
        answers: parseAnswers(body.answers, form),
        officer_name: officerName || null,
        meeting_date: meetingDate,
      }).select('*').single();
      if (error || !created) return json({ error: 'פתיחת המפגש נכשלה' }, 500);
      return json({ meeting: created });
    }

    // ── sign (the officer) ────────────────────────────────────────────
    if (action === 'sign') {
      const meeting = await loadMeeting();
      if (!meeting) return json({ error: 'המפגש לא נמצא' }, 404);
      if (meeting.status !== 'draft') return json({ error: 'המפגש כבר נחתם' }, 409);
      const form = parseForm(meeting.form) as Form | null;
      if (!form) return json({ error: 'הטופס של המפגש אינו תקין' }, 500);
      const answers = parseAnswers(body.answers, form);
      if (!everyItemAnswered(form, answers)) return json({ error: 'יש לסמן תשובה בכל הסעיפים לפני החתימה' }, 400);
      const officerName = oneLine(body.officerName, LIMITS.officerName);
      if (!officerName) return json({ error: 'חסר השם של מי שחותם' }, 400);
      const meetingDate = meetingDateOrNull(body.meetingDate);
      if (!meetingDate) return json({ error: 'תאריך המפגש אינו תקין' }, 400);
      const officerSignature = signaturePng(body.officerSignature);
      if (!officerSignature) return json({ error: 'החתימה לא נקלטה. חתמו שוב ונסו שוב.' }, 400);

      const [{ data: driver }, { data: details }, { data: company }, { data: authData }] = await Promise.all([
        db.from('profiles').select('id, full_name').eq('id', meeting.driver_id).eq('company_id', companyId).eq('role', 'driver').maybeSingle(),
        db.from('driver_details').select('national_id, license_number, license_classes, status').eq('id', meeting.driver_id).eq('company_id', companyId).maybeSingle(),
        db.from('companies').select('name, logo_url').eq('id', companyId).single(),
        db.auth.admin.getUserById(meeting.driver_id),
      ]);
      if (!driver || details?.status !== 'active') return json({ error: 'אפשר לחתום רק מול נהג פעיל' }, 400);
      if (!driver.full_name?.trim()) return json({ error: 'יש להשלים את שם הנהג בפרופיל לפני החתימה' }, 400);
      const driverEmail = authData?.user?.email;
      if (!driverEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(driverEmail)) {
        return json({ error: 'יש לעדכן כתובת אימייל תקינה בפרופיל הנהג לפני החתימה' }, 400);
      }

      // One signing at a time: a double tap or a retry after a slow network
      // must not create two documents.
      const lockUntil = new Date(Date.now() + SIGN_LOCK_MINUTES * 60_000).toISOString();
      const { data: claimed } = await db.from('checklist_meetings')
        .update({ signing_locked_until: lockUntil })
        .eq('id', meeting.id).eq('status', 'draft')
        .or(`signing_locked_until.is.null,signing_locked_until.lt.${new Date().toISOString()}`)
        .select('id').maybeSingle();
      if (!claimed) return json({ error: 'החתימה כבר נשמרת. חכו רגע ורעננו את המסך.' }, 409);
      const release = () => db.from('checklist_meetings').update({ signing_locked_until: null }).eq('id', meeting.id).eq('status', 'draft');

      const logosPrefix = `${Deno.env.get('SUPABASE_URL') ?? ''}/storage/v1/object/public/company-logos/`;
      const letterhead = {
        name: (company?.name ?? '').trim() || 'החברה',
        logoUrl: typeof company?.logo_url === 'string' && company.logo_url.startsWith(logosPrefix) ? company.logo_url : null,
      };
      const html = renderChecklistHtml({
        title: meeting.title,
        form,
        letterhead,
        meeting: {
          answers,
          meetingDate,
          officerName,
          driver: { name: driver.full_name.trim(), nationalId: details.national_id, licenseNumber: details.license_number, licenseClasses: details.license_classes },
        },
      });

      const { data: request, error: requestError } = await db.from('signature_requests').insert({
        company_id: companyId,
        template_id: meeting.template_id,
        driver_id: meeting.driver_id,
        created_by: user.userId,
        template_title: meeting.title,
        next_email_reminder_at: null,
        provisioning_locked_until: lockUntil,
      }).select('id').single();
      if (requestError || !request) {
        await release();
        return json({ error: 'שמירת המסמך נכשלה' }, 500);
      }

      let driverSubmitter: Submitter | undefined;
      try {
        const response = await docusealFetch('/submissions/html', {
          method: 'POST',
          body: JSON.stringify({
            name: [meeting.title, driver.full_name.trim(), dayText(meetingDate)].join(' - '),
            send_email: false,
            order: 'preserved',
            documents: [{ name: meeting.title, html, size: 'A4' }],
            submitters: [
              {
                role: OFFICER_ROLE,
                name: officerName,
                // The officer signs on the manager's own signed-in device.
                email: user.email,
                send_email: false,
                completed: true,
                values: { [OFFICER_FIELD]: officerSignature },
                metadata: { checklist_meeting_id: meeting.id, company_id: companyId, signed_by_user: user.userId },
              },
              {
                role: DRIVER_ROLE,
                name: driver.full_name.trim(),
                email: driverEmail,
                send_email: false,
                external_id: request.id,
                metadata: { signature_request_id: request.id, checklist_meeting_id: meeting.id, company_id: companyId },
                require_email_2fa: false,
                require_phone_2fa: false,
              },
            ],
          }),
        });
        if (!response.ok) throw new Error(`DocuSeal rejected the submission (${response.status})`);
        const payload = await response.json() as { submitters?: Submitter[] } | Submitter[];
        const submitters = Array.isArray(payload) ? payload : payload.submitters ?? [];
        driverSubmitter = submitters.find((s) => s.external_id === request.id) ?? submitters.find((s) => s.role === DRIVER_ROLE);
        if (!driverSubmitter?.id || !driverSubmitter.slug || !driverSubmitter.submission_id) throw new Error('DocuSeal returned no driver link');
      } catch (error) {
        console.error('checklist-meeting sign failed', error instanceof Error ? error.message : 'unknown');
        if (driverSubmitter?.submission_id) await cleanupProvisionedRequest(db, request.id, driverSubmitter);
        else await db.from('signature_requests').delete().eq('id', request.id).eq('status', 'pending');
        await release();
        return json({ error: 'יצירת המסמך נכשלה. נסו שוב בעוד רגע.' }, 502);
      }

      const now = new Date().toISOString();
      const { error: linkError } = await db.from('signature_requests').update({
        sent_at: driverSubmitter.sent_at || driverSubmitter.created_at || now,
        expires_at: null,
        docuseal_submission_id: driverSubmitter.submission_id,
        docuseal_submitter_id: driverSubmitter.id,
        docuseal_submitter_slug: driverSubmitter.slug,
        provisioning_locked_until: null,
        failure_reason: null,
      }).eq('id', request.id);
      if (linkError) {
        console.error('checklist-meeting request linking failed', linkError.message);
        await cleanupProvisionedRequest(db, request.id, driverSubmitter);
        await release();
        return json({ error: 'המסמך לא נשמר. נסו שוב בעוד רגע.' }, 500);
      }
      const { data: signed, error: meetingError } = await db.from('checklist_meetings').update({
        status: 'signed',
        answers,
        officer_name: officerName,
        officer_signature: officerSignature,
        meeting_date: meetingDate,
        signed_at: now,
        signature_request_id: request.id,
        signing_locked_until: null,
      }).eq('id', meeting.id).eq('status', 'draft').select('*').maybeSingle();
      if (meetingError || !signed) {
        console.error('checklist-meeting meeting linking failed', meetingError?.message ?? 'no row');
        await cleanupProvisionedRequest(db, request.id, driverSubmitter);
        await release();
        return json({ error: 'המסמך לא נשמר. נסו שוב בעוד רגע.' }, 500);
      }

      const nextDue = await scheduleNextMeeting(db, meeting, meetingDate, user.userId);
      if (body.notifyDriver === true) await notifyDriver(db, companyId, user.userId, user.profile.full_name, meeting.driver_id, request.id, meeting.title);
      return json({ meeting: signed, requestId: request.id, nextDue });
    }

    // ── driver-sign ───────────────────────────────────────────────────
    if (action === 'driver-sign') {
      const meeting = await loadMeeting();
      if (!meeting) return json({ error: 'המפגש לא נמצא' }, 404);
      if (meeting.status !== 'signed' || !meeting.signature_request_id) return json({ error: 'הקצין עוד לא חתם על המפגש' }, 409);
      const driverSignature = signaturePng(body.driverSignature);
      if (!driverSignature) return json({ error: 'החתימה לא נקלטה. חתמו שוב ונסו שוב.' }, 400);
      const { data: request } = await db.from('signature_requests')
        .select('id, company_id, driver_id, status, docuseal_submitter_id, signed_file_path')
        .eq('id', meeting.signature_request_id).eq('company_id', companyId).maybeSingle();
      if (!request) return json({ error: 'המסמך לא נמצא' }, 404);
      if (request.status === 'completed') return json({ status: 'completed', filePending: !request.signed_file_path });
      if (request.status !== 'pending' || !request.docuseal_submitter_id) return json({ error: 'המסמך כבר לא ממתין לחתימה' }, 409);

      const driverLockUntil = new Date(Date.now() + SIGN_LOCK_MINUTES * 60_000).toISOString();
      const driverLockStartedAt = new Date().toISOString();
      const { data: driverClaim, error: driverClaimError } = await db.from('signature_requests')
        .update({ sync_locked_until: driverLockUntil })
        .eq('id', request.id).eq('status', 'pending')
        .or(`sync_locked_until.is.null,sync_locked_until.lt.${driverLockStartedAt}`)
        .select('id').maybeSingle();
      if (driverClaimError) return json({ error: 'שמירת החתימה של הנהג נכשלה. נסו שוב.' }, 500);
      if (!driverClaim) {
        const { data: current } = await db.from('signature_requests').select('status, signed_file_path').eq('id', request.id).maybeSingle();
        if (current?.status === 'completed') return json({ status: 'completed', filePending: !current.signed_file_path });
        return json({ error: 'המסמך נשמר כעת בפעולה אחרת. חכו רגע ונסו שוב.' }, 409);
      }

      let update: Response;
      try {
        update = await docusealFetch(`/submitters/${request.docuseal_submitter_id}`, {
          method: 'PUT',
          body: JSON.stringify({ completed: true, send_email: false, values: { [DRIVER_FIELD]: driverSignature } }),
        });
      } catch {
        await db.from('signature_requests').update({ sync_locked_until: null })
          .eq('id', request.id).eq('status', 'pending').eq('sync_locked_until', driverLockUntil);
        return json({ error: 'שמירת החתימה של הנהג נכשלה. נסו שוב.' }, 502);
      }
      if (!update.ok) {
        console.error('checklist-meeting driver-sign rejected', update.status);
        await db.from('signature_requests').update({ sync_locked_until: null })
          .eq('id', request.id).eq('status', 'pending').eq('sync_locked_until', driverLockUntil);
        return json({ error: 'שמירת החתימה של הנהג נכשלה. נסו שוב.' }, 502);
      }

      // The signed PDF takes DocuSeal a moment. Wait a little for it; if it is
      // still not ready, the webhook (or the next refresh) stores it.
      let documentUrl: string | null = null;
      let completedAt: string | null = null;
      for (let attempt = 0; attempt < 4 && !documentUrl; attempt += 1) {
        if (attempt) await sleep(1500);
        let response: Response;
        try {
          response = await docusealFetch(`/submitters/${request.docuseal_submitter_id}`);
        } catch {
          continue;
        }
        if (!response.ok) continue;
        const submitter = await response.json() as { status?: string; completed_at?: string; documents?: Array<{ url?: string }> };
        completedAt = submitter.completed_at ?? completedAt;
        if (submitter.status === 'completed') documentUrl = submitter.documents?.[0]?.url ?? null;
      }
      let signedFilePath: string | null = null;
      if (documentUrl) {
        try {
          const pdf = await fetch(documentUrl);
          if (pdf.ok) {
            const path = `${request.company_id}/driver/${request.driver_id}/signed/${request.id}.pdf`;
            const { error: uploadError } = await db.storage.from('documents').upload(path, new Uint8Array(await pdf.arrayBuffer()), { contentType: 'application/pdf', upsert: true });
            if (!uploadError) signedFilePath = path;
          }
        } catch {
          // The webhook or a later sync will store the generated PDF.
        }
      }
      const { data: completed } = await db.from('signature_requests').update({
        status: 'completed',
        completed_at: completedAt || new Date().toISOString(),
        ...(signedFilePath ? { signed_file_path: signedFilePath } : {}),
        next_email_reminder_at: null,
        email_reminder_locked_until: null,
        sync_locked_until: null,
      }).eq('id', request.id).eq('status', 'pending').eq('sync_locked_until', driverLockUntil).select('id').maybeSingle();
      if (!completed) {
        const { data: current } = await db.from('signature_requests').select('status, signed_file_path').eq('id', request.id).maybeSingle();
        if (current?.status === 'completed') return json({ status: 'completed', filePending: !current.signed_file_path });
        return json({ error: 'המסמך בוטל לפני שהחתימה נשמרה' }, 409);
      }
      return json({ status: 'completed', filePending: !signedFilePath });
    }

    // ── notify ────────────────────────────────────────────────────────
    if (action === 'notify') {
      const meeting = await loadMeeting();
      if (!meeting) return json({ error: 'המפגש לא נמצא' }, 404);
      if (meeting.status !== 'signed' || !meeting.signature_request_id) return json({ error: 'הקצין עוד לא חתם על המפגש' }, 409);
      const { data: request } = await db.from('signature_requests').select('status').eq('id', meeting.signature_request_id).maybeSingle();
      if (request?.status !== 'pending') return json({ error: 'המסמך כבר לא ממתין לחתימה' }, 409);
      await notifyDriver(db, companyId, user.userId, user.profile.full_name, meeting.driver_id, meeting.signature_request_id, meeting.title);
      return json({ success: true });
    }

    // ── cancel ────────────────────────────────────────────────────────
    // The manager's "delete": the meeting goes away completely, with its
    // document (the DocuSeal submission, the stored PDF and the request), and
    // the driver's next meeting date goes back to what it was before.
    if (action === 'cancel') {
      const meeting = await loadMeeting();
      if (!meeting) return json({ error: 'המפגש לא נמצא' }, 404);

      if (meeting.signature_request_id) {
        const { data: request } = await db.from('signature_requests')
          .select('id, company_id, driver_id, status, docuseal_submission_id, signed_file_path')
          .eq('id', meeting.signature_request_id).maybeSingle();
        if (request) {
          const now = new Date().toISOString();
          if (request.status === 'pending') {
            // Claim the request before touching DocuSeal. A driver-sign flow uses
            // the same lock, so a signature being saved is never cut in half.
            const { data: claimed, error: claimError } = await db.from('signature_requests').update({
              status: 'cancelled', cancelled_at: now, cancelled_by: user.userId,
              next_email_reminder_at: null, email_reminder_locked_until: null,
            }).eq('id', request.id).eq('status', 'pending')
              .or(`sync_locked_until.is.null,sync_locked_until.lt.${now}`)
              .select('id').maybeSingle();
            if (claimError) return json({ error: 'מחיקת המפגש נכשלה' }, 500);
            if (!claimed) {
              const { data: current } = await db.from('signature_requests').select('status').eq('id', request.id).maybeSingle();
              if (current?.status === 'pending') return json({ error: 'חתימת הנהג נשמרת כעת. חכו רגע ונסו למחוק שוב.' }, 409);
            }
          }
          if (request.docuseal_submission_id && !await discardProvisionedSubmission(request.docuseal_submission_id)) {
            return json({ error: 'לא ניתן למחוק את המסמך כרגע. נסו שוב.' }, 502);
          }
          if (isSignedRequestPath(request.company_id, request.driver_id, request.id, request.signed_file_path)) {
            const { error: storageError } = await db.storage.from('documents').remove([request.signed_file_path]);
            if (storageError) return json({ error: 'מחיקת קובץ המסמך נכשלה' }, 500);
          }
          const { error: requestError } = await db.from('signature_requests').delete().eq('id', request.id);
          if (requestError) return json({ error: 'מחיקת המפגש נכשלה' }, 500);
        }
      }

      if (!await restoreScheduleAfterCancellation(db, meeting.id, user.userId, new Date().toISOString())) {
        return json({ error: 'מחיקת המפגש נכשלה. נסו שוב.' }, 500);
      }
      const { error } = await db.from('checklist_meetings').delete().eq('id', meeting.id);
      if (error) return json({ error: 'מחיקת המפגש נכשלה' }, 500);
      return json({ success: true, removed: true });
    }

    // ── set-next ──────────────────────────────────────────────────────
    if (action === 'set-next') {
      const { templateId, driverId, nextDue } = body;
      if (typeof templateId !== 'string' || !UUID.test(templateId) || typeof driverId !== 'string' || !UUID.test(driverId)) {
        return json({ error: 'חסרים פרטי המפגש' }, 400);
      }
      const today = israelToday();
      if (!isIsoDay(nextDue) || nextDue < today || nextDue > addMonths(today, 36)) {
        return json({ error: 'בחרו תאריך מהיום ועד שלוש שנים קדימה' }, 400);
      }
      const { data: template } = await db.from('signing_templates')
        .select('id, form_kind, archived_at').eq('id', templateId).eq('company_id', companyId).maybeSingle();
      if (!template || template.form_kind !== 'checklist' || template.archived_at) return json({ error: 'הטופס לא נמצא' }, 404);
      const { data: details } = await db.from('driver_details').select('id').eq('id', driverId).eq('company_id', companyId).eq('status', 'active').maybeSingle();
      if (!details) return json({ error: 'הנהג לא נמצא' }, 404);
      const { error } = await db.from('checklist_schedule').upsert({
        template_id: templateId, driver_id: driverId, company_id: companyId,
        next_due: nextDue, manual_next_due: nextDue, meeting_id: null, updated_by: user.userId, updated_at: new Date().toISOString(),
      }, { onConflict: 'template_id,driver_id' });
      if (error) return json({ error: 'שמירת התאריך נכשלה' }, 500);
      return json({ success: true, nextDue });
    }

    // ── set-repeat ────────────────────────────────────────────────────
    if (action === 'set-repeat') {
      const { templateId } = body;
      if (typeof templateId !== 'string' || !UUID.test(templateId)) return json({ error: 'חסר מזהה טופס' }, 400);
      if (typeof body.repeatMonths !== 'number' || repeatMonthsOf(body.repeatMonths) !== body.repeatMonths) {
        return json({ error: 'התדירות אינה תקינה' }, 400);
      }
      const { data: template } = await db.from('signing_templates')
        .select('id, form_kind, form_content, archived_at').eq('id', templateId).eq('company_id', companyId).maybeSingle();
      if (!template || template.form_kind !== 'checklist' || template.archived_at) return json({ error: 'הטופס לא נמצא' }, 404);
      const form = parseForm(template.form_content);
      if (!form) return json({ error: 'הטופס אינו תקין' }, 500);
      const { error } = await db.from('signing_templates')
        .update({ form_content: { ...form, repeatMonths: body.repeatMonths } })
        .eq('id', templateId).eq('company_id', companyId);
      if (error) return json({ error: 'שמירת התדירות נכשלה' }, 500);
      return json({ success: true, repeatMonths: body.repeatMonths });
    }

    return json({ error: 'פעולה לא מוכרת' }, 400);
  } catch (error) {
    console.error('checklist-meeting failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'הפעולה נכשלה' }, 500);
  }
});

/**
 * After the officer signs: the driver's next meeting on a repeating form is
 * this meeting's date plus the form's months. The template decides how often
 * (a later change applies to the next meeting too). Returns the date, or null.
 */
// deno-lint-ignore no-explicit-any
async function scheduleNextMeeting(db: any, meeting: { id: string; company_id: string; template_id: string | null; driver_id: string }, meetingDate: string, userId: string): Promise<string | null> {
  if (!meeting.template_id) return null;
  const { data: template } = await db.from('signing_templates').select('form_content').eq('id', meeting.template_id).maybeSingle();
  const months = repeatMonthsOf((template?.form_content as Record<string, unknown> | null)?.repeatMonths);
  if (!months) return null;
  const nextDue = addMonths(meetingDate, months);
  // A meeting entered late, older than one already signed, leaves the date alone.
  const { data: newer } = await db.from('checklist_meetings').select('id')
    .eq('template_id', meeting.template_id).eq('driver_id', meeting.driver_id).eq('status', 'signed')
    .neq('id', meeting.id).gt('meeting_date', meetingDate).limit(1);
  if (newer?.length) return null;
  const { data: existingSchedule, error: scheduleReadError } = await db.from('checklist_schedule').select('manual_next_due')
    .eq('template_id', meeting.template_id).eq('driver_id', meeting.driver_id).maybeSingle();
  if (scheduleReadError) {
    console.error('checklist-meeting schedule read failed');
    return null;
  }
  const { error } = await db.from('checklist_schedule').upsert({
    template_id: meeting.template_id, driver_id: meeting.driver_id, company_id: meeting.company_id,
    next_due: nextDue, manual_next_due: existingSchedule?.manual_next_due ?? null,
    meeting_id: meeting.id, updated_by: userId, updated_at: new Date().toISOString(),
  }, { onConflict: 'template_id,driver_id' });
  if (error) {
    console.error('checklist-meeting schedule failed');
    return null;
  }
  return nextDue;
}

async function discardProvisionedSubmission(submissionId: number): Promise<boolean> {
  try {
    const response = await docusealFetch(`/submissions/${submissionId}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      console.error('checklist-meeting submission cleanup failed', response.status);
      return false;
    }
    return true;
  } catch {
    console.error('checklist-meeting submission cleanup failed');
    return false;
  }
}

// deno-lint-ignore no-explicit-any
async function cleanupProvisionedRequest(db: any, requestId: string, submitter: Submitter) {
  const submissionId = submitter.submission_id;
  if (!submissionId) return;
  if (await discardProvisionedSubmission(submissionId)) {
    const { error } = await db.from('signature_requests').delete().eq('id', requestId).eq('status', 'pending');
    if (!error) return;
    console.error('checklist-meeting local cleanup failed');
  }
  // Keep enough remote identity to find and clean up the submission later. A
  // failed cleanup must never turn a traceable orphan into an invisible one.
  await db.from('signature_requests').update({
    status: 'failed',
    failure_reason: 'DocuSeal submission cleanup failed after checklist meeting provisioning',
    docuseal_submission_id: submissionId,
    docuseal_submitter_id: submitter.id,
    docuseal_submitter_slug: submitter.slug,
    provisioning_locked_until: null,
  }).eq('id', requestId).eq('status', 'pending');
}

// deno-lint-ignore no-explicit-any
async function restoreScheduleAfterCancellation(db: any, meetingId: string, userId: string, now: string): Promise<boolean> {
  const { data: schedule, error: readError } = await db.from('checklist_schedule').select('manual_next_due')
    .eq('meeting_id', meetingId).maybeSingle();
  if (readError) return false;
  if (schedule?.manual_next_due) {
    const { error } = await db.from('checklist_schedule').update({
      next_due: schedule.manual_next_due,
      meeting_id: null,
      updated_by: userId,
      updated_at: now,
    }).eq('meeting_id', meetingId);
    return !error;
  }
  const { error } = await db.from('checklist_schedule').delete().eq('meeting_id', meetingId);
  return !error;
}

// deno-lint-ignore no-explicit-any
async function notifyDriver(db: any, companyId: string, actorId: string, actorName: string | null, driverId: string, requestId: string, title: string) {
  const { data: existing } = await db.from('notifications').select('id').eq('signature_request_id', requestId).eq('recipient_id', driverId).limit(1);
  if (existing?.length) return;
  const { error } = await db.from('notifications').insert({
    company_id: companyId,
    actor_id: actorId,
    actor_name: actorName || 'מנהל',
    recipient_id: driverId,
    message: `יש לך טופס חדש לחתימה: ${title}`,
    notification_type: 'signature_request_assigned',
    signature_request_id: requestId,
  });
  if (error) console.error('checklist-meeting notification failed');
}
