// פונקציית שרת: קישור אישי לנהג בוואטסאפ
// Edge Function: driver-quick-link
//
// A manager presses "send on WhatsApp"; their own WhatsApp opens with a
// message that holds a personal link for the driver (migration 138).
//
// Manager actions (signed in, may manage the company):
//   create { kind: 'sign', requestId }                 → DocuSeal signing link
//   create { kind: 'odometer', driverId, vehicleId }    → /d/<token>
//   create { kind: 'document', driverId, category, title } → /d/<token>
// Driver actions (no sign-in, the token is the key):
//   resolve  { token }
//   odometer { token, odometer }
//   upload   { token, fileName, mimeType, base64 }

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { safeDocusealAppUrl } from '../_shared/docuseal.ts';
import { validExpiry } from '../_shared/quickLinkExpiry.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';
import { verifyUser } from '../_shared/verifyUser.ts';

const MAX_UPLOADS = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
// A driver typing an extra zero must not jump the vehicle a million km.
const MAX_ODOMETER_JUMP = 200_000;
const UPLOAD_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
};
type Expiry = 'required' | 'optional' | 'none';
// documents.category of the fixed driver folders, with whether their files
// carry an expiry date (lib/driverDocumentFolders.ts; the licence is dated).
const DRIVER_FOLDERS: Record<string, Expiry> = {
  license_docs: 'required', general: 'required', transport_info: 'required', driver_file: 'required',
  notes_feedback: 'optional', traffic_reports: 'optional', accompanying_drivers: 'required',
  procedure_6: 'optional', certifications: 'required', hazmat: 'required', trainings: 'required',
};

// Per link, per minute (migration 131 counts by any uuid).
const PUBLIC_RATE_LIMIT = 20;

type Link = {
  id: string;
  company_id: string;
  driver_id: string;
  kind: 'odometer' | 'document';
  vehicle_id: string | null;
  category: string | null;
  title: string | null;
  expires_at: string;
  used_at: string | null;
  uploads: number;
};

// תשובת JSON
function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// גיבוב האסימון
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// אסימון אקראי
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// פרטי הנהג והחברה להודעה
async function driverAndCompany(admin: SupabaseClient, companyId: string, driverId: string) {
  const [{ data: driver }, { data: company }] = await Promise.all([
    admin.from('profiles').select('id, full_name, phone, role, company_id').eq('id', driverId).maybeSingle(),
    admin.from('companies').select('name').eq('id', companyId).maybeSingle(),
  ]);
  if (!driver || driver.role !== 'driver' || driver.company_id !== companyId) return null;
  return { driverName: driver.full_name ?? '', phone: driver.phone ?? '', companyName: company?.name ?? '' };
}

// יצירת קישור על ידי מנהל
async function create(req: Request, body: Record<string, unknown>) {
  const kind = body.kind;

  if (kind === 'sign') {
    const user = await verifyUser(req.headers.get('Authorization'));
    if (!user.ok) return json({ error: user.error }, user.status);
    const { data: request } = await user.adminClient
      .from('signature_requests')
      .select('company_id, driver_id, status, archived_at, deleted_at, docuseal_submitter_slug, template_title')
      .eq('id', String(body.requestId ?? ''))
      .maybeSingle();
    if (!request) return json({ error: 'המסמך לא נמצא' }, 404);
    const access = await verifyCompanyAccess(req.headers.get('Authorization'), request.company_id);
    if (!access.ok) return json({ error: access.error }, access.status);
    if (request.status !== 'pending' || request.archived_at || request.deleted_at || !request.docuseal_submitter_slug) {
      return json({ error: 'המסמך אינו ממתין לחתימה' }, 409);
    }
    const who = await driverAndCompany(access.adminClient, request.company_id, request.driver_id);
    if (!who) return json({ error: 'הנהג לא נמצא' }, 404);
    return json({
      ...who,
      title: request.template_title ?? '',
      url: `${safeDocusealAppUrl()}/s/${request.docuseal_submitter_slug}`,
    });
  }

  if (kind !== 'odometer' && kind !== 'document') return json({ error: 'סוג קישור לא מוכר' }, 400);

  const driverId = String(body.driverId ?? '');
  const user = await verifyUser(req.headers.get('Authorization'));
  if (!user.ok) return json({ error: user.error }, user.status);
  const companyId = user.profile.company_id;
  const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId);
  if (!access.ok) return json({ error: access.error }, access.status);
  const admin = access.adminClient;

  const who = await driverAndCompany(admin, companyId!, driverId);
  if (!who) return json({ error: 'הנהג לא נמצא' }, 404);

  let vehicleId: string | null = null;
  let plate: string | null = null;
  let category: string | null = null;
  let title: string | null = null;
  if (kind === 'odometer') {
    vehicleId = String(body.vehicleId ?? '');
    const [{ data: vehicle }, { data: assigned }] = await Promise.all([
      admin.from('vehicles').select('id, plate_number').eq('id', vehicleId).eq('company_id', companyId).maybeSingle(),
      activeAssignment(admin, vehicleId, driverId),
    ]);
    if (!vehicle || !assigned) return json({ error: 'הרכב אינו משויך לנהג' }, 404);
    plate = vehicle.plate_number;
  } else {
    category = typeof body.category === 'string' ? body.category.trim().slice(0, 80) : '';
    title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
    if (!category || !title) return json({ error: 'חסרה תיקייה' }, 400);
    if (!(await driverFolderExpiry(admin, companyId!, category))) return json({ error: 'התיקייה לא נמצאה' }, 404);
  }

  const token = newToken();
  const { error } = await admin.from('driver_quick_links').insert({
    token_hash: await sha256(token),
    company_id: companyId,
    driver_id: driverId,
    kind,
    vehicle_id: vehicleId,
    category,
    title,
    created_by: access.callerId,
  });
  if (error) return json({ error: 'יצירת הקישור נכשלה' }, 500);
  return json({ ...who, token, plate, title });
}

// שיוך פעיל של הנהג לרכב
function activeAssignment(admin: SupabaseClient, vehicleId: string, driverId: string) {
  return admin.from('vehicle_drivers').select('vehicle_id')
    .eq('vehicle_id', vehicleId).eq('driver_id', driverId).is('unassigned_at', null).maybeSingle();
}

// תיקיית נהג קיימת (קבועה או של החברה), והאם הקבצים בה עם תוקף
/** null when the category is no driver folder of this company. */
async function driverFolderExpiry(admin: SupabaseClient, companyId: string, category: string): Promise<Expiry | null> {
  if (DRIVER_FOLDERS[category]) return DRIVER_FOLDERS[category];
  const id = category.startsWith('folder:') ? category.slice('folder:'.length) : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await admin.from('company_document_folders').select('tracks_expiry')
    .eq('id', id).eq('company_id', companyId).eq('owner_type', 'driver').maybeSingle();
  return data ? (data.tracks_expiry ? 'required' : 'none') : null;
}

// סוג הקובץ לפי הבייטים הראשונים
function contentMatches(bytes: Uint8Array, mimeType: string): boolean {
  const head = (n: number) => String.fromCharCode(...bytes.slice(0, n));
  if (mimeType === 'application/pdf') return head(5) === '%PDF-';
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') return head(8) === '\x89PNG\r\n\x1a\n';
  if (mimeType === 'image/webp') return head(4) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (mimeType === 'image/heic') return String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
  return false;
}

// קישור תקף לפי אסימון
async function openLink(admin: SupabaseClient, token: unknown): Promise<Link | Response> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 64) return json({ error: 'הקישור אינו תקין', code: 'invalid' }, 404);
  const { data } = await admin
    .from('driver_quick_links')
    .select('id, company_id, driver_id, kind, vehicle_id, category, title, expires_at, used_at, uploads')
    .eq('token_hash', await sha256(token))
    .maybeSingle();
  if (!data) return json({ error: 'הקישור אינו תקין', code: 'invalid' }, 404);
  const link = data as Link;
  const { data: allowed } = await admin.rpc('edge_rate_limit_hit', { p_user: link.id, p_max: PUBLIC_RATE_LIMIT });
  if (allowed === false) return json({ error: 'יותר מדי ניסיונות. נסה שוב בעוד דקה', code: 'wait' }, 429);
  if (new Date(link.expires_at).getTime() < Date.now()) return json({ error: 'תוקף הקישור פג. בקש/י מהמנהל קישור חדש', code: 'expired' }, 410);
  if (link.used_at) return json({ error: 'הקישור כבר נוצל. תודה!', code: 'used' }, 410);
  // A link outlives nothing the sign-in would refuse (verifyUser): an
  // archived driver, an inactive company, or a vehicle taken from the driver.
  const [{ data: driver }, { data: company }, assignment] = await Promise.all([
    admin.from('driver_details').select('status').eq('id', link.driver_id).maybeSingle(),
    admin.from('companies').select('status').eq('id', link.company_id).maybeSingle(),
    link.vehicle_id ? activeAssignment(admin, link.vehicle_id, link.driver_id) : Promise.resolve({ data: true }),
  ]);
  if (driver?.status !== 'active' || company?.status !== 'active' || !assignment.data) {
    return json({ error: 'הקישור כבר אינו בתוקף', code: 'closed' }, 410);
  }
  return link;
}

// שם הנהג
async function driverName(admin: SupabaseClient, driverId: string): Promise<string> {
  const { data } = await admin.from('profiles').select('full_name').eq('id', driverId).maybeSingle();
  return data?.full_name || 'נהג';
}

// פעולות הנהג בלי התחברות
async function publicAction(action: string, body: Record<string, unknown>) {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const opened = await openLink(admin, body.token);
  if (opened instanceof Response) return opened;
  const link = opened;

  if (action === 'resolve') {
    const [name, { data: company }, { data: vehicle }] = await Promise.all([
      driverName(admin, link.driver_id),
      admin.from('companies').select('name').eq('id', link.company_id).maybeSingle(),
      link.vehicle_id
        ? admin.from('vehicles').select('plate_number, odometer').eq('id', link.vehicle_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const expiry = link.category ? await driverFolderExpiry(admin, link.company_id, link.category) : null;
    return json({
      kind: link.kind,
      // First name only: the page is open to whoever holds the link.
      driverFirstName: name.split(/\s+/)[0] ?? '',
      companyName: company?.name ?? '',
      plate: vehicle?.plate_number ?? null,
      odometer: vehicle?.odometer ?? null,
      title: link.title,
      uploads: link.uploads,
      maxUploads: MAX_UPLOADS,
      expiry: expiry ?? 'none',
    });
  }

  if (action === 'odometer') {
    if (link.kind !== 'odometer' || !link.vehicle_id) return json({ error: 'הקישור אינו לעדכון קילומטראז׳' }, 400);
    const value = Number(body.odometer);
    if (!Number.isInteger(value) || value < 0) return json({ error: 'יש להזין מספר שלם' }, 400);
    const { data: vehicle } = await admin.from('vehicles').select('plate_number, odometer').eq('id', link.vehicle_id).single();
    if (!vehicle) return json({ error: 'הרכב לא נמצא' }, 404);
    const current = vehicle.odometer ?? 0;
    if (value < current) return json({ error: `לא ניתן להזין פחות מ-${current.toLocaleString('he-IL')} ק״מ` }, 400);
    if (value - current > MAX_ODOMETER_JUMP) return json({ error: 'המספר גבוה מדי. בדוק/י שאין ספרה מיותרת' }, 400);

    // Claim the link first so a double tap cannot write twice.
    const { data: claimed } = await admin
      .from('driver_quick_links')
      .update({ used_at: new Date().toISOString() })
      .eq('id', link.id)
      .is('used_at', null)
      .select('id')
      .maybeSingle();
    if (!claimed) return json({ error: 'הקישור כבר נוצל. תודה!', code: 'used' }, 410);

    const now = new Date().toISOString();
    // Only while the reading is still at most the new value: an update made
    // in between (by the driver in the app) is never lowered.
    const { data: updated, error } = await admin
      .from('vehicles')
      .update({ odometer: value, odometer_updated_at: now, updated_at: now })
      .eq('id', link.vehicle_id)
      .lte('odometer', value)
      .select('id')
      .maybeSingle();
    if (error || !updated) {
      await admin.from('driver_quick_links').update({ used_at: null }).eq('id', link.id);
      return json(error ? { error: 'העדכון נכשל', code: 'server' } : { error: 'הקילומטראז׳ עודכן בינתיים. רענן/י את הדף ונסה/י שוב' }, error ? 500 : 409);
    }
    const name = await driverName(admin, link.driver_id);
    // Same wording as update_own_vehicle_odometer (75), which the client parses.
    await admin.from('notifications').insert({
      company_id: link.company_id,
      actor_id: link.driver_id,
      actor_name: name,
      message: `${name} עדכן/ה קילומטראז׳ ברכב ${vehicle.plate_number} ל-${value} ק״מ`,
      notification_type: 'driver_odometer_update',
    });
    return json({ success: true });
  }

  if (action === 'upload') {
    if (link.kind !== 'document' || !link.category) return json({ error: 'הקישור אינו להעלאת מסמך' }, 400);
    if (link.uploads >= MAX_UPLOADS) return json({ error: 'הועלו כבר מספיק קבצים בקישור הזה', code: 'used' }, 410);
    const mimeType = String(body.mimeType ?? '').toLowerCase();
    const ext = UPLOAD_TYPES[mimeType];
    if (!ext) return json({ error: 'ניתן להעלות PDF או תמונה בלבד' }, 400);
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(String(body.base64 ?? '')), (c) => c.charCodeAt(0));
    } catch {
      return json({ error: 'הקובץ אינו תקין' }, 400);
    }
    if (!bytes.byteLength) return json({ error: 'הקובץ ריק' }, 400);
    if (bytes.byteLength > MAX_FILE_BYTES) return json({ error: 'הקובץ גדול מ-10MB' }, 400);
    if (!contentMatches(bytes, mimeType)) return json({ error: 'ניתן להעלות PDF או תמונה בלבד' }, 400);
    // The folder decides: a dated folder needs the new copy's expiry.
    const expiryRule = await driverFolderExpiry(admin, link.company_id, link.category);
    if (!expiryRule) return json({ error: 'התיקייה כבר לא קיימת', code: 'closed' }, 410);
    const expiryDate = expiryRule === 'none' || !body.expiryDate ? null : validExpiry(body.expiryDate);
    if (body.expiryDate && expiryRule !== 'none' && !expiryDate) return json({ error: 'תאריך התוקף אינו תקין' }, 400);
    if (expiryRule === 'required' && !expiryDate) return json({ error: 'יש לבחור תאריך תוקף' }, 400);

    // Claim the link first: one file per link, so a double tap or a return to the page cannot upload again.
    const { data: counted } = await admin
      .from('driver_quick_links')
      .update({ uploads: link.uploads + 1, used_at: new Date().toISOString() })
      .eq('id', link.id)
      .eq('uploads', link.uploads)
      .is('used_at', null)
      .select('id')
      .maybeSingle();
    if (!counted) return json({ error: 'נסה/י שוב' }, 409);

    const path = `${link.company_id}/driver/${link.driver_id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { error: uploadError } = await admin.storage.from('documents').upload(path, bytes, { contentType: mimeType, upsert: false });
    // A failed save gives the upload back.
    const refund = () => admin.from('driver_quick_links').update({ uploads: link.uploads, used_at: null }).eq('id', link.id).eq('uploads', link.uploads + 1);
    if (uploadError) {
      await refund();
      return json({ error: 'שמירת הקובץ נכשלה', code: 'server' }, 500);
    }
    const fileName = String(body.fileName ?? '').trim().slice(0, 120) || `${link.title}.${ext}`;
    const { error } = await admin.from('documents').insert({
      company_id: link.company_id,
      owner_type: 'driver',
      owner_id: link.driver_id,
      category: link.category,
      title: link.title,
      file_path: path,
      file_name: fileName,
      mime_type: mimeType,
      file_size: bytes.byteLength,
      expiry_date: expiryDate,
      uploaded_by: link.driver_id,
    });
    if (error) {
      await admin.storage.from('documents').remove([path]);
      await refund();
      return json({ error: 'שמירת המסמך נכשלה', code: 'server' }, 500);
    }
    const name = await driverName(admin, link.driver_id);
    // Same wording and target as log_driver_document_upload (93).
    await admin.from('notifications').insert({
      company_id: link.company_id,
      actor_id: link.driver_id,
      actor_name: name,
      message: `${name} העלה/תה מסמך: ${link.title}`,
      notification_type: 'driver_document_upload',
      folder_key: link.category,
    });
    return json({ success: true, uploads: link.uploads + 1, maxUploads: MAX_UPLOADS });
  }

  return json({ error: 'פעולה לא מוכרת' }, 400);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);
  try {
    const body = await req.json();
    const action = String(body?.action ?? '');
    if (action === 'create') return await create(req, body);
    return await publicAction(action, body);
  } catch (error) {
    console.error('driver-quick-link failed', error instanceof Error ? error.message : error);
    return json({ error: 'אירעה שגיאה בלתי צפויה', code: 'server' }, 500);
  }
});
