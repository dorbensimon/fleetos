import { corsHeaders } from '../_shared/cors.ts';
import { docusealFetch } from '../_shared/docuseal.ts';
import { signaturePng } from '../_shared/checklistDocument.ts';
import { verifyUser } from '../_shared/verifyUser.ts';
import {
  DEFAULT_INSPECTION_FORM,
  DRIVER_FIELD,
  DRIVER_ROLE,
  INSPECTION_LIMITS,
  INSPECTION_TITLE,
  OFFICER_FIELD,
  OFFICER_ROLE,
  addMonths,
  dayText,
  defectCount,
  formatPlate,
  inspectionProblem,
  isIsoDay,
  parseExtraDefects,
  parseInspectionAnswers,
  parseInspectionForm,
  renderInspectionHtml,
  type InspectionFacts,
  type InspectionForm,
} from '../_shared/inspectionDocument.ts';

/**
 * "בדיקות בטיחות": the safety officer's periodic check of a vehicle
 * (lib/inspections.ts, supabase/sql/103_vehicle_safety_inspections.sql).
 *
 * save         starts an inspection of a vehicle, or saves one in progress.
 * sign         the officer signs: the document is rendered, the officer's
 *              drawing is stamped into their field, and the driver gets a
 *              normal signing request in the app. Sets the vehicle's next
 *              inspection and raises its odometer if the reading is higher.
 * driver-sign  the driver signs right away, on the manager's device.
 * notify       tells the driver there is an inspection to sign.
 * close        the driver never signed: the document is issued with the
 *              officer's signature and the manager's note instead.
 * cancel       a draft is thrown away; a signed inspection is kept, marked
 *              "בוטל", and the vehicle's next date goes back.
 * document     a short-lived link to the finished PDF.
 * set-next     moves one vehicle's next inspection.
 * settings     how often vehicles are checked, and the company's own list.
 *
 * Only the company's managers (and the platform owner) reach any of these.
 */

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGN_LOCK_MINUTES = 3;
const MAX_ODOMETER = 9_999_999;

type Submitter = { id?: number; submission_id?: number; slug?: string; role?: string; external_id?: string | null; sent_at?: string | null; created_at?: string };
// deno-lint-ignore no-explicit-any
type Db = any;
type Inspection = {
  id: string;
  company_id: string;
  vehicle_id: string;
  driver_id: string | null;
  title: string;
  form: unknown;
  answers: unknown;
  extra_defects: unknown;
  odometer: number | null;
  inspection_date: string;
  officer_name: string | null;
  officer_signature: string | null;
  facts: InspectionFacts | null;
  status: 'draft' | 'signed' | 'closed' | 'cancelled';
  signature_request_id: string | null;
  closing_submission_id: number | null;
  file_path: string | null;
};

function oneLine(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** Today in Israel, as YYYY-MM-DD. */
function israelToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** A whole number of kilometres, or null. */
function odometerOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_ODOMETER) return null;
  return value;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The finished inspection closed without the driver lives beside the vehicle, in the evidence folder managers cannot change. */
function closedFilePath(companyId: string, vehicleId: string, inspectionId: string): string {
  return `${companyId}/vehicle/${vehicleId}/signed/inspection-${inspectionId}.pdf`;
}

function driverSignedPath(companyId: string, driverId: string, requestId: string): string {
  return `${companyId}/driver/${driverId}/signed/${requestId}.pdf`;
}

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
    const db: Db = user.adminClient;

    const loadInspection = async (): Promise<Inspection | null> => {
      if (typeof body.inspectionId !== 'string' || !UUID.test(body.inspectionId)) return null;
      const { data } = await db.from('vehicle_inspections').select('*').eq('id', body.inspectionId).eq('company_id', companyId).maybeSingle();
      return data;
    };

    /** An active driver of the company, or null. */
    const activeDriver = async (driverId: unknown) => {
      if (typeof driverId !== 'string' || !UUID.test(driverId)) return null;
      const [{ data: profile }, { data: details }] = await Promise.all([
        db.from('profiles').select('id, full_name').eq('id', driverId).eq('company_id', companyId).eq('role', 'driver').maybeSingle(),
        db.from('driver_details').select('id').eq('id', driverId).eq('company_id', companyId).eq('status', 'active').maybeSingle(),
      ]);
      return profile && details ? profile as { id: string; full_name: string | null } : null;
    };

    // ── save ──────────────────────────────────────────────────────────
    if (action === 'save') {
      const officerName = oneLine(body.officerName, INSPECTION_LIMITS.officerName);
      const odometer = odometerOrNull(body.odometer);
      let driverId: string | null = null;
      if (body.driverId != null) {
        const driver = await activeDriver(body.driverId);
        if (!driver) return json({ error: 'אפשר לבחור רק נהג פעיל של החברה' }, 400);
        driverId = driver.id;
      }

      if (body.inspectionId) {
        const inspection = await loadInspection();
        if (!inspection) return json({ error: 'הבדיקה לא נמצאה' }, 404);
        if (inspection.status !== 'draft') return json({ error: 'הבדיקה כבר נחתמה ואי אפשר לשנות אותה' }, 409);
        const form = parseInspectionForm(inspection.form);
        if (!form) return json({ error: 'רשימת הסעיפים של הבדיקה אינה תקינה' }, 500);
        const { data: saved, error } = await db.from('vehicle_inspections').update({
          answers: parseInspectionAnswers(body.answers, form),
          extra_defects: parseExtraDefects(body.extraDefects),
          odometer,
          officer_name: officerName || null,
          driver_id: driverId,
          inspection_date: israelToday(),
        }).eq('id', inspection.id).eq('status', 'draft').select('*').maybeSingle();
        if (error || !saved) return json({ error: 'שמירת הטיוטה נכשלה' }, 500);
        return json({ inspection: saved });
      }

      const { vehicleId } = body;
      if (typeof vehicleId !== 'string' || !UUID.test(vehicleId)) return json({ error: 'חסר הרכב לבדיקה' }, 400);
      const { data: vehicle } = await db.from('vehicles').select('id, status').eq('id', vehicleId).eq('company_id', companyId).maybeSingle();
      if (!vehicle || vehicle.status === 'archived') return json({ error: 'אפשר לבדוק רק רכב פעיל של החברה' }, 400);
      const form = await companyForm(db, companyId);
      const { data: created, error } = await db.from('vehicle_inspections').insert({
        company_id: companyId,
        vehicle_id: vehicleId,
        driver_id: driverId,
        created_by: user.userId,
        title: INSPECTION_TITLE,
        form,
        answers: parseInspectionAnswers(body.answers, form),
        extra_defects: parseExtraDefects(body.extraDefects),
        odometer,
        officer_name: officerName || null,
        inspection_date: israelToday(),
      }).select('*').single();
      if (error || !created) return json({ error: 'פתיחת הבדיקה נכשלה' }, 500);
      return json({ inspection: created });
    }

    // ── sign (the officer) ────────────────────────────────────────────
    if (action === 'sign') {
      const inspection = await loadInspection();
      if (!inspection) return json({ error: 'הבדיקה לא נמצאה' }, 404);
      if (inspection.status !== 'draft') return json({ error: 'הבדיקה כבר נחתמה' }, 409);
      const form = parseInspectionForm(inspection.form);
      if (!form) return json({ error: 'רשימת הסעיפים של הבדיקה אינה תקינה' }, 500);
      const answers = parseInspectionAnswers(body.answers, form);
      const problem = inspectionProblem(form, answers);
      if (problem) return json({ error: problem }, 400);
      const extraDefects = parseExtraDefects(body.extraDefects);
      const odometer = odometerOrNull(body.odometer);
      if (odometer == null) return json({ error: 'יש להקליד את הקילומטראז׳ של הרכב' }, 400);
      const officerName = oneLine(body.officerName, INSPECTION_LIMITS.officerName);
      if (!officerName) return json({ error: 'חסר השם של קצין הבטיחות' }, 400);
      const officerSignature = signaturePng(body.officerSignature);
      if (!officerSignature) return json({ error: 'החתימה לא נקלטה. חתמו שוב ונסו שוב.' }, 400);
      const driver = await activeDriver(body.driverId);
      if (!driver) return json({ error: 'יש לבחור את הנהג שחותם על הבדיקה' }, 400);
      const driverName = driver.full_name?.trim();
      if (!driverName) return json({ error: 'יש להשלים את שם הנהג בפרופיל לפני החתימה' }, 400);

      const today = israelToday();
      const [{ data: vehicle }, { data: company }, { data: authData }, { data: compliance }, settings] = await Promise.all([
        db.from('vehicles').select('id, plate_number, manufacturer, model, odometer, status').eq('id', inspection.vehicle_id).eq('company_id', companyId).maybeSingle(),
        db.from('companies').select('name, logo_url').eq('id', companyId).single(),
        db.auth.admin.getUserById(driver.id),
        db.from('compliance_items').select('item_type, expiry_date, last_date')
          .eq('owner_type', 'vehicle').eq('owner_id', inspection.vehicle_id).in('item_type', ['annual_test', 'insurance_mandatory']),
        companySettings(db, companyId),
      ]);
      if (!vehicle || vehicle.status === 'archived') return json({ error: 'אפשר לחתום רק על רכב פעיל של החברה' }, 400);
      const driverEmail = authData?.user?.email;
      if (!driverEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(driverEmail)) {
        return json({ error: 'יש לעדכן כתובת אימייל תקינה בפרופיל הנהג לפני החתימה' }, 400);
      }

      const rows = (compliance ?? []) as Array<{ item_type: string; expiry_date: string | null; last_date: string | null }>;
      const test = rows.find((r) => r.item_type === 'annual_test');
      const insurance = rows.find((r) => r.item_type === 'insurance_mandatory');
      const nextDue = settings.repeatMonths > 0 ? addMonths(today, settings.repeatMonths) : null;
      const facts: InspectionFacts = {
        plate: vehicle.plate_number,
        vehicle: [vehicle.manufacturer, vehicle.model].filter(Boolean).join(' '),
        odometer,
        driverName,
        inspectionDate: today,
        nextDue,
        // The app's rule for the test: its expiry, or a year after it was done.
        testUntil: test?.expiry_date ?? (test?.last_date ? addDays(test.last_date, 365) : null),
        insuranceUntil: insurance?.expiry_date ?? null,
      };

      // One signing at a time: a double tap or a retry after a slow network
      // must not create two documents.
      const lockUntil = new Date(Date.now() + SIGN_LOCK_MINUTES * 60_000).toISOString();
      const { data: claimed } = await db.from('vehicle_inspections')
        .update({ signing_locked_until: lockUntil })
        .eq('id', inspection.id).eq('status', 'draft')
        .or(`signing_locked_until.is.null,signing_locked_until.lt.${new Date().toISOString()}`)
        .select('id').maybeSingle();
      if (!claimed) return json({ error: 'החתימה כבר נשמרת. חכו רגע ורעננו את המסך.' }, 409);
      const release = () => db.from('vehicle_inspections').update({ signing_locked_until: null }).eq('id', inspection.id).eq('status', 'draft');

      const html = renderInspectionHtml({ form, letterhead: letterheadOf(company), facts, answers, extraDefects, officerName });

      const { data: request, error: requestError } = await db.from('signature_requests').insert({
        company_id: companyId,
        template_id: null,
        driver_id: driver.id,
        created_by: user.userId,
        template_title: INSPECTION_TITLE,
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
            name: [INSPECTION_TITLE, formatPlate(vehicle.plate_number), dayText(today)].join(' - '),
            send_email: false,
            order: 'preserved',
            documents: [{ name: INSPECTION_TITLE, html, size: 'A4' }],
            submitters: [
              {
                role: OFFICER_ROLE,
                name: officerName,
                // The officer signs on the manager's own signed-in device.
                email: user.email,
                send_email: false,
                completed: true,
                values: { [OFFICER_FIELD]: officerSignature },
                metadata: { vehicle_inspection_id: inspection.id, company_id: companyId, signed_by_user: user.userId },
              },
              {
                role: DRIVER_ROLE,
                name: driverName,
                email: driverEmail,
                send_email: false,
                external_id: request.id,
                metadata: { signature_request_id: request.id, vehicle_inspection_id: inspection.id, company_id: companyId },
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
        console.error('vehicle-inspection sign failed', error instanceof Error ? error.message : 'unknown');
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
        console.error('vehicle-inspection request linking failed', linkError.message);
        await cleanupProvisionedRequest(db, request.id, driverSubmitter);
        await release();
        return json({ error: 'המסמך לא נשמר. נסו שוב בעוד רגע.' }, 500);
      }
      const { data: signed, error: signError } = await db.from('vehicle_inspections').update({
        status: 'signed',
        driver_id: driver.id,
        answers,
        extra_defects: extraDefects,
        defect_count: defectCount(form, answers, extraDefects),
        odometer,
        inspection_date: today,
        officer_name: officerName,
        officer_signature: officerSignature,
        facts,
        signed_at: now,
        signature_request_id: request.id,
        signing_locked_until: null,
      }).eq('id', inspection.id).eq('status', 'draft').select('*').maybeSingle();
      if (signError || !signed) {
        console.error('vehicle-inspection inspection linking failed', signError?.message ?? 'no row');
        await cleanupProvisionedRequest(db, request.id, driverSubmitter);
        await release();
        return json({ error: 'המסמך לא נשמר. נסו שוב בעוד רגע.' }, 500);
      }

      const scheduled = await scheduleNextInspection(db, signed, nextDue, user.userId);
      // The reading goes to the vehicle only when it moves forward.
      if (odometer > (vehicle.odometer ?? 0)) {
        const { error: odometerError } = await db.from('vehicles').update({ odometer })
          .eq('id', vehicle.id).eq('company_id', companyId).lt('odometer', odometer);
        if (odometerError) console.error('vehicle-inspection odometer update failed');
      }
      if (body.notifyDriver === true) await notifyDriver(db, companyId, user.userId, user.profile.full_name, driver.id, request.id, vehicle.plate_number);
      return json({ inspection: signed, requestId: request.id, nextDue: scheduled });
    }

    // ── driver-sign ───────────────────────────────────────────────────
    if (action === 'driver-sign') {
      const inspection = await loadInspection();
      if (!inspection) return json({ error: 'הבדיקה לא נמצאה' }, 404);
      if (inspection.status !== 'signed' || !inspection.signature_request_id) return json({ error: 'הבדיקה לא ממתינה לחתימת הנהג' }, 409);
      const driverSignature = signaturePng(body.driverSignature);
      if (!driverSignature) return json({ error: 'החתימה לא נקלטה. חתמו שוב ונסו שוב.' }, 400);
      const { data: request } = await db.from('signature_requests')
        .select('id, company_id, driver_id, status, docuseal_submitter_id, signed_file_path')
        .eq('id', inspection.signature_request_id).eq('company_id', companyId).maybeSingle();
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
      const releaseDriver = () => db.from('signature_requests').update({ sync_locked_until: null })
        .eq('id', request.id).eq('status', 'pending').eq('sync_locked_until', driverLockUntil);

      let update: Response;
      try {
        update = await docusealFetch(`/submitters/${request.docuseal_submitter_id}`, {
          method: 'PUT',
          body: JSON.stringify({ completed: true, send_email: false, values: { [DRIVER_FIELD]: driverSignature } }),
        });
      } catch {
        await releaseDriver();
        return json({ error: 'שמירת החתימה של הנהג נכשלה. נסו שוב.' }, 502);
      }
      if (!update.ok) {
        console.error('vehicle-inspection driver-sign rejected', update.status);
        await releaseDriver();
        return json({ error: 'שמירת החתימה של הנהג נכשלה. נסו שוב.' }, 502);
      }

      // The signed PDF takes DocuSeal a moment. Wait a little for it; if it is
      // still not ready, the webhook (or the next download) stores it.
      const { url: documentUrl, completedAt } = await submitterDocument(request.docuseal_submitter_id);
      let signedFilePath: string | null = null;
      if (documentUrl) {
        const path = driverSignedPath(request.company_id, request.driver_id, request.id);
        if (await storePdf(db, documentUrl, path)) signedFilePath = path;
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
      const inspection = await loadInspection();
      if (!inspection) return json({ error: 'הבדיקה לא נמצאה' }, 404);
      if (inspection.status !== 'signed' || !inspection.signature_request_id || !inspection.driver_id) return json({ error: 'הבדיקה לא ממתינה לחתימת הנהג' }, 409);
      const { data: request } = await db.from('signature_requests').select('status').eq('id', inspection.signature_request_id).maybeSingle();
      if (request?.status !== 'pending') return json({ error: 'המסמך כבר לא ממתין לחתימה' }, 409);
      const sent = await notifyDriver(db, companyId, user.userId, user.profile.full_name, inspection.driver_id, inspection.signature_request_id, inspection.facts?.plate ?? '', true);
      if (sent === 'recent') return json({ error: 'הנהג כבר קיבל התראה בשעה האחרונה. אפשר לשלוח תזכורת נוספת מאוחר יותר.' }, 409);
      if (sent === 'failed') return json({ error: 'השליחה לנהג נכשלה' }, 500);
      return json({ success: true });
    }

    // ── close (without the driver) ────────────────────────────────────
    if (action === 'close') {
      const inspection = await loadInspection();
      if (!inspection) return json({ error: 'הבדיקה לא נמצאה' }, 404);
      if (inspection.status !== 'signed') return json({ error: 'אפשר לסגור רק בדיקה שממתינה לחתימת הנהג' }, 409);
      const note = oneLine(body.note, INSPECTION_LIMITS.closedNote);
      if (!note) return json({ error: 'כתבו בקצרה למה הבדיקה נסגרת בלי חתימת הנהג' }, 400);
      const form = parseInspectionForm(inspection.form);
      const officerSignature = signaturePng(inspection.officer_signature);
      if (!form || !inspection.facts || !inspection.officer_name || !officerSignature) return json({ error: 'פרטי הבדיקה חסרים' }, 500);

      const { data: request } = inspection.signature_request_id
        ? await db.from('signature_requests').select('id, status, docuseal_submission_id').eq('id', inspection.signature_request_id).maybeSingle()
        : { data: null };
      if (request?.status === 'completed') return json({ error: 'הנהג כבר חתם על הבדיקה' }, 409);

      const lockUntil = new Date(Date.now() + SIGN_LOCK_MINUTES * 60_000).toISOString();
      const { data: claimed } = await db.from('vehicle_inspections')
        .update({ signing_locked_until: lockUntil })
        .eq('id', inspection.id).eq('status', 'signed')
        .or(`signing_locked_until.is.null,signing_locked_until.lt.${new Date().toISOString()}`)
        .select('id').maybeSingle();
      if (!claimed) return json({ error: 'הבדיקה נשמרת כעת בפעולה אחרת. חכו רגע ונסו שוב.' }, 409);
      const release = () => db.from('vehicle_inspections').update({ signing_locked_until: null }).eq('id', inspection.id).eq('status', 'signed');

      const today = israelToday();
      const { data: company } = await db.from('companies').select('name, logo_url').eq('id', companyId).single();
      const html = renderInspectionHtml({
        form,
        letterhead: letterheadOf(company),
        facts: inspection.facts,
        answers: parseInspectionAnswers(inspection.answers, form),
        extraDefects: parseExtraDefects(inspection.extra_defects),
        officerName: inspection.officer_name,
        closedNote: { text: note, by: user.profile.full_name?.trim() || 'מנהל', on: dayText(today) },
      });

      // The new document first: until it exists, nothing about the old one changes.
      let officerSubmitter: Submitter | undefined;
      try {
        const response = await docusealFetch('/submissions/html', {
          method: 'POST',
          body: JSON.stringify({
            name: [INSPECTION_TITLE, formatPlate(inspection.facts.plate), dayText(inspection.inspection_date), 'נסגר בלי חתימת נהג'].join(' - '),
            send_email: false,
            documents: [{ name: INSPECTION_TITLE, html, size: 'A4' }],
            submitters: [{
              role: OFFICER_ROLE,
              name: inspection.officer_name,
              email: user.email,
              send_email: false,
              completed: true,
              values: { [OFFICER_FIELD]: officerSignature },
              metadata: { vehicle_inspection_id: inspection.id, company_id: companyId, closed_by_user: user.userId },
            }],
          }),
        });
        if (!response.ok) throw new Error(`DocuSeal rejected the submission (${response.status})`);
        const payload = await response.json() as { submitters?: Submitter[] } | Submitter[];
        const submitters = Array.isArray(payload) ? payload : payload.submitters ?? [];
        officerSubmitter = submitters[0];
        if (!officerSubmitter?.id || !officerSubmitter.submission_id) throw new Error('DocuSeal returned no submission');
      } catch (error) {
        console.error('vehicle-inspection close failed', error instanceof Error ? error.message : 'unknown');
        if (officerSubmitter?.submission_id) await discardSubmission(officerSubmitter.submission_id);
        await release();
        return json({ error: 'יצירת המסמך נכשלה. נסו שוב בעוד רגע.' }, 502);
      }

      // Now take the driver's request off their list. A driver signing this
      // very moment holds its lock, and wins.
      const now = new Date().toISOString();
      if (request?.status === 'pending') {
        const { data: taken, error: takeError } = await db.from('signature_requests').update({
          status: 'cancelled', cancelled_at: now, cancelled_by: user.userId,
          next_email_reminder_at: null, email_reminder_locked_until: null,
        }).eq('id', request.id).eq('status', 'pending')
          .or(`sync_locked_until.is.null,sync_locked_until.lt.${now}`)
          .select('id').maybeSingle();
        if (takeError || !taken) {
          await discardSubmission(officerSubmitter.submission_id!);
          await release();
          const { data: current } = await db.from('signature_requests').select('status').eq('id', request.id).maybeSingle();
          if (current?.status === 'completed') return json({ error: 'הנהג בדיוק חתם על הבדיקה, אין צורך לסגור אותה' }, 409);
          return json({ error: 'חתימת הנהג נשמרת כעת. חכו רגע ונסו שוב.' }, 409);
        }
        // The half-signed original is no longer needed.
        if (request.docuseal_submission_id) await discardSubmission(request.docuseal_submission_id);
      }

      const { url: documentUrl } = await submitterDocument(officerSubmitter.id!);
      const path = closedFilePath(companyId, inspection.vehicle_id, inspection.id);
      const filePath = documentUrl && await storePdf(db, documentUrl, path) ? path : null;

      const { data: closed, error: closeError } = await db.from('vehicle_inspections').update({
        status: 'closed',
        closed_note: note,
        closed_at: now,
        closed_by: user.userId,
        closing_submission_id: officerSubmitter.submission_id,
        file_path: filePath,
        signing_locked_until: null,
      }).eq('id', inspection.id).eq('status', 'signed').select('*').maybeSingle();
      if (closeError || !closed) {
        console.error('vehicle-inspection close linking failed', closeError?.message ?? 'no row');
        await release();
        return json({ error: 'סגירת הבדיקה נכשלה. נסו שוב.' }, 500);
      }
      return json({ inspection: closed });
    }

    // ── cancel ────────────────────────────────────────────────────────
    if (action === 'cancel') {
      const inspection = await loadInspection();
      if (!inspection) return json({ error: 'הבדיקה לא נמצאה' }, 404);
      if (inspection.status === 'cancelled') return json({ success: true, inspection });

      // A draft was never signed: it simply goes away.
      if (inspection.status === 'draft') {
        const { error } = await db.from('vehicle_inspections').delete().eq('id', inspection.id).eq('status', 'draft')
          .or(`signing_locked_until.is.null,signing_locked_until.lt.${new Date().toISOString()}`);
        if (error) return json({ error: 'מחיקת הטיוטה נכשלה' }, 500);
        const { data: still } = await db.from('vehicle_inspections').select('id').eq('id', inspection.id).maybeSingle();
        if (still) return json({ error: 'הבדיקה נחתמת כעת. חכו רגע ורעננו את המסך.' }, 409);
        return json({ success: true, removed: true });
      }

      const now = new Date().toISOString();
      if (inspection.signature_request_id) {
        const { data: request } = await db.from('signature_requests')
          .select('id, status, docuseal_submission_id').eq('id', inspection.signature_request_id).maybeSingle();
        if (request?.status === 'pending') {
          // The same lock as driver-sign, so a signature being saved is never cut in half.
          const { data: taken, error: takeError } = await db.from('signature_requests').update({
            status: 'cancelled', cancelled_at: now, cancelled_by: user.userId,
            next_email_reminder_at: null, email_reminder_locked_until: null,
          }).eq('id', request.id).eq('status', 'pending')
            .or(`sync_locked_until.is.null,sync_locked_until.lt.${now}`)
            .select('id').maybeSingle();
          if (takeError) return json({ error: 'ביטול הבדיקה נכשל' }, 500);
          if (!taken) {
            const { data: current } = await db.from('signature_requests').select('status').eq('id', request.id).maybeSingle();
            if (current?.status === 'pending') return json({ error: 'חתימת הנהג נשמרת כעת. חכו רגע ונסו לבטל שוב.' }, 409);
          } else if (request.docuseal_submission_id) {
            await discardSubmission(request.docuseal_submission_id);
          }
        }
      }

      const { data: cancelled, error } = await db.from('vehicle_inspections').update({
        status: 'cancelled', cancelled_at: now, cancelled_by: user.userId,
      }).eq('id', inspection.id).in('status', ['signed', 'closed'])
        .or(`signing_locked_until.is.null,signing_locked_until.lt.${now}`)
        .select('*').maybeSingle();
      if (error) return json({ error: 'ביטול הבדיקה נכשל' }, 500);
      if (!cancelled) return json({ error: 'הבדיקה נשמרת כעת בפעולה אחרת. חכו רגע ונסו שוב.' }, 409);
      if (!await restoreScheduleAfterCancellation(db, inspection.id, user.userId, now)) {
        console.error('vehicle-inspection schedule restore failed');
      }
      return json({ success: true, inspection: cancelled });
    }

    // ── document ──────────────────────────────────────────────────────
    if (action === 'document') {
      const inspection = await loadInspection();
      if (!inspection) return json({ error: 'הבדיקה לא נמצאה' }, 404);
      const path = await finishedDocumentPath(db, inspection);
      if (path === 'pending') return json({ error: 'המסמך יהיה מוכן אחרי חתימת הנהג, או אחרי סגירת הבדיקה' }, 409);
      if (!path) return json({ error: 'המסמך עוד בהכנה. נסו שוב בעוד דקה.' }, 409);
      const { data: signedUrl, error } = await db.storage.from('documents').createSignedUrl(path, 60 * 10);
      if (error || !signedUrl?.signedUrl) return json({ error: 'פתיחת המסמך נכשלה' }, 500);
      const plate = inspection.facts?.plate ? formatPlate(inspection.facts.plate) : '';
      return json({ url: signedUrl.signedUrl, fileName: `בדיקת בטיחות ${plate} ${dayText(inspection.inspection_date).replace(/\//g, '-')}.pdf`.replace(/\s+/g, ' ') });
    }

    // ── set-next ──────────────────────────────────────────────────────
    if (action === 'set-next') {
      const { vehicleId, nextDue } = body;
      if (typeof vehicleId !== 'string' || !UUID.test(vehicleId)) return json({ error: 'חסר הרכב' }, 400);
      const today = israelToday();
      if (!isIsoDay(nextDue) || nextDue < today || nextDue > addMonths(today, 36)) {
        return json({ error: 'בחרו תאריך מהיום ועד שלוש שנים קדימה' }, 400);
      }
      const { data: vehicle } = await db.from('vehicles').select('id, status').eq('id', vehicleId).eq('company_id', companyId).maybeSingle();
      if (!vehicle || vehicle.status === 'archived') return json({ error: 'הרכב לא נמצא' }, 404);
      const { error } = await db.from('vehicle_inspection_schedule').upsert({
        vehicle_id: vehicleId, company_id: companyId, next_due: nextDue, manual_next_due: nextDue,
        inspection_id: null, updated_by: user.userId, updated_at: new Date().toISOString(),
      }, { onConflict: 'vehicle_id' });
      if (error) return json({ error: 'שמירת התאריך נכשלה' }, 500);
      return json({ success: true, nextDue });
    }

    // ── settings ──────────────────────────────────────────────────────
    if (action === 'settings') {
      const patch: Record<string, unknown> = {};
      if (body.repeatMonths !== undefined) {
        if (typeof body.repeatMonths !== 'number' || !Number.isInteger(body.repeatMonths) || body.repeatMonths < 0 || body.repeatMonths > 12) {
          return json({ error: 'התדירות אינה תקינה' }, 400);
        }
        patch.repeat_months = body.repeatMonths;
      }
      if (body.form !== undefined) {
        if (body.form === null) patch.form = null;
        else {
          const form = parseInspectionForm(body.form);
          if (!form) return json({ error: 'רשימת הסעיפים אינה תקינה. בדקו שלכל קבוצה יש שם ולפחות סעיף אחד.' }, 400);
          patch.form = form;
        }
      }
      if (!Object.keys(patch).length) return json({ error: 'אין מה לשמור' }, 400);
      const { data: saved, error } = await db.from('vehicle_inspection_settings')
        .upsert({ company_id: companyId, ...patch, updated_by: user.userId }, { onConflict: 'company_id' })
        .select('company_id, repeat_months, form').single();
      if (error || !saved) return json({ error: 'שמירת ההגדרות נכשלה' }, 500);
      return json({ settings: saved });
    }

    return json({ error: 'פעולה לא מוכרת' }, 400);
  } catch (error) {
    console.error('vehicle-inspection failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'הפעולה נכשלה' }, 500);
  }
});

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function letterheadOf(company: { name?: string | null; logo_url?: string | null } | null) {
  const logosPrefix = `${Deno.env.get('SUPABASE_URL') ?? ''}/storage/v1/object/public/company-logos/`;
  return {
    name: (company?.name ?? '').trim() || 'החברה',
    logoUrl: typeof company?.logo_url === 'string' && company.logo_url.startsWith(logosPrefix) ? company.logo_url : null,
  };
}

async function companySettings(db: Db, companyId: string): Promise<{ repeatMonths: number; form: InspectionForm | null }> {
  const { data } = await db.from('vehicle_inspection_settings').select('repeat_months, form').eq('company_id', companyId).maybeSingle();
  const months = typeof data?.repeat_months === 'number' ? data.repeat_months : 1;
  return { repeatMonths: months, form: data?.form ? parseInspectionForm(data.form) : null };
}

/** The list a new inspection starts from: the company's own, or the ready-made one. */
async function companyForm(db: Db, companyId: string): Promise<InspectionForm> {
  return (await companySettings(db, companyId)).form ?? DEFAULT_INSPECTION_FORM;
}

/** The submitter's finished PDF, waiting a few seconds for DocuSeal to render it. */
async function submitterDocument(submitterId: number): Promise<{ url: string | null; completedAt: string | null }> {
  let url: string | null = null;
  let completedAt: string | null = null;
  for (let attempt = 0; attempt < 4 && !url; attempt += 1) {
    if (attempt) await sleep(1500);
    let response: Response;
    try {
      response = await docusealFetch(`/submitters/${submitterId}`);
    } catch {
      continue;
    }
    if (!response.ok) continue;
    const submitter = await response.json() as { status?: string; completed_at?: string; documents?: Array<{ url?: string }> };
    completedAt = submitter.completed_at ?? completedAt;
    if (submitter.status === 'completed') url = submitter.documents?.[0]?.url ?? null;
  }
  return { url, completedAt };
}

async function storePdf(db: Db, url: string, path: string): Promise<boolean> {
  try {
    const pdf = await fetch(url);
    if (!pdf.ok) return false;
    const { error } = await db.storage.from('documents').upload(path, new Uint8Array(await pdf.arrayBuffer()), { contentType: 'application/pdf', upsert: true });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Where the finished PDF is stored, fetching it from DocuSeal first if it
 * was not ready when the inspection finished. 'pending' while the driver
 * has not signed; null when it cannot be had right now.
 */
async function finishedDocumentPath(db: Db, inspection: Inspection): Promise<string | null | 'pending'> {
  if (inspection.file_path) return inspection.file_path;
  if (inspection.closing_submission_id) {
    const response = await docusealFetch(`/submissions/${inspection.closing_submission_id}`).catch(() => null);
    if (!response?.ok) return null;
    const submission = await response.json() as { combined_document_url?: string | null; documents?: Array<{ url?: string }>; submitters?: Array<{ documents?: Array<{ url?: string }> }> };
    const url = submission.combined_document_url || submission.documents?.[0]?.url || submission.submitters?.[0]?.documents?.[0]?.url;
    if (!url) return null;
    const path = closedFilePath(inspection.company_id, inspection.vehicle_id, inspection.id);
    if (!await storePdf(db, url, path)) return null;
    // A cancelled inspection keeps its document; only the path is filled in.
    await db.from('vehicle_inspections').update({ file_path: path }).eq('id', inspection.id).is('file_path', null);
    return path;
  }
  if (!inspection.signature_request_id) return 'pending';
  const { data: request } = await db.from('signature_requests')
    .select('id, company_id, driver_id, status, signed_file_path, docuseal_submitter_id')
    .eq('id', inspection.signature_request_id).maybeSingle();
  if (!request || request.status !== 'completed') return 'pending';
  if (request.signed_file_path) return request.signed_file_path;
  if (!request.docuseal_submitter_id) return null;
  const { url } = await submitterDocument(request.docuseal_submitter_id);
  if (!url) return null;
  const path = driverSignedPath(request.company_id, request.driver_id, request.id);
  if (!await storePdf(db, url, path)) return null;
  await db.from('signature_requests').update({ signed_file_path: path }).eq('id', request.id).eq('status', 'completed').is('signed_file_path', null);
  return path;
}

/**
 * After the officer signs: the vehicle's next inspection is this one's date
 * plus the company's months. An inspection older than one already signed
 * (not possible today, every inspection is dated the day it is signed)
 * leaves the date alone. Returns the date, or null.
 */
async function scheduleNextInspection(db: Db, inspection: { id: string; company_id: string; vehicle_id: string; inspection_date: string }, nextDue: string | null, userId: string): Promise<string | null> {
  if (!nextDue) return null;
  const { data: newer } = await db.from('vehicle_inspections').select('id')
    .eq('vehicle_id', inspection.vehicle_id).in('status', ['signed', 'closed'])
    .neq('id', inspection.id).gt('inspection_date', inspection.inspection_date).limit(1);
  if (newer?.length) return null;
  const { data: existing, error: readError } = await db.from('vehicle_inspection_schedule').select('manual_next_due')
    .eq('vehicle_id', inspection.vehicle_id).maybeSingle();
  if (readError) {
    console.error('vehicle-inspection schedule read failed');
    return null;
  }
  const { error } = await db.from('vehicle_inspection_schedule').upsert({
    vehicle_id: inspection.vehicle_id, company_id: inspection.company_id,
    next_due: nextDue, manual_next_due: existing?.manual_next_due ?? null,
    inspection_id: inspection.id, updated_by: userId, updated_at: new Date().toISOString(),
  }, { onConflict: 'vehicle_id' });
  if (error) {
    console.error('vehicle-inspection schedule failed');
    return null;
  }
  return nextDue;
}

/** A cancelled inspection gives the vehicle back the date it had before it. */
async function restoreScheduleAfterCancellation(db: Db, inspectionId: string, userId: string, now: string): Promise<boolean> {
  const { data: schedule, error: readError } = await db.from('vehicle_inspection_schedule').select('manual_next_due')
    .eq('inspection_id', inspectionId).maybeSingle();
  if (readError) return false;
  if (!schedule) return true;
  if (schedule.manual_next_due) {
    const { error } = await db.from('vehicle_inspection_schedule').update({
      next_due: schedule.manual_next_due, inspection_id: null, updated_by: userId, updated_at: now,
    }).eq('inspection_id', inspectionId);
    return !error;
  }
  const { error } = await db.from('vehicle_inspection_schedule').delete().eq('inspection_id', inspectionId);
  return !error;
}

async function discardSubmission(submissionId: number): Promise<boolean> {
  try {
    const response = await docusealFetch(`/submissions/${submissionId}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      console.error('vehicle-inspection submission cleanup failed', response.status);
      return false;
    }
    return true;
  } catch {
    console.error('vehicle-inspection submission cleanup failed');
    return false;
  }
}

async function cleanupProvisionedRequest(db: Db, requestId: string, submitter: Submitter) {
  const submissionId = submitter.submission_id;
  if (!submissionId) return;
  if (await discardSubmission(submissionId)) {
    const { error } = await db.from('signature_requests').delete().eq('id', requestId).eq('status', 'pending');
    if (!error) return;
    console.error('vehicle-inspection local cleanup failed');
  }
  // Keep enough remote identity to find and clean up the submission later.
  await db.from('signature_requests').update({
    status: 'failed',
    failure_reason: 'DocuSeal submission cleanup failed after vehicle inspection provisioning',
    docuseal_submission_id: submissionId,
    docuseal_submitter_id: submitter.id,
    docuseal_submitter_slug: submitter.slug,
    provisioning_locked_until: null,
  }).eq('id', requestId).eq('status', 'pending');
}

/**
 * Tells the driver there is an inspection to sign. When the officer signs it
 * goes out once; a reminder a manager asks for goes out again, at most once
 * an hour.
 */
async function notifyDriver(db: Db, companyId: string, actorId: string, actorName: string | null, driverId: string, requestId: string, plate: string, reminder = false): Promise<'sent' | 'skipped' | 'recent' | 'failed'> {
  const { data: existing } = await db.from('notifications').select('id, created_at')
    .eq('signature_request_id', requestId).eq('recipient_id', driverId)
    .order('created_at', { ascending: false }).limit(1);
  const last = existing?.[0] as { created_at?: string } | undefined;
  if (last && !reminder) return 'skipped';
  if (last?.created_at && Date.now() - new Date(last.created_at).getTime() < 60 * 60_000) return 'recent';
  const what = plate ? `בדיקת בטיחות של הרכב ${formatPlate(plate)}` : 'בדיקת בטיחות';
  const { error } = await db.from('notifications').insert({
    company_id: companyId,
    actor_id: actorId,
    actor_name: actorName || 'מנהל',
    recipient_id: driverId,
    message: last ? `תזכורת: יש ${what} שמחכה לחתימה שלך` : `יש ${what} שמחכה לחתימה שלך`,
    notification_type: 'signature_request_assigned',
    signature_request_id: requestId,
  });
  if (error) {
    console.error('vehicle-inspection notification failed');
    return 'failed';
  }
  return 'sent';
}
