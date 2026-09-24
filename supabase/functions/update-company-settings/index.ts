// Edge Function: update-company-settings
// The one server-side write path for company details by an admin (or owner).
// `companies` RLS only grants UPDATE to the platform owner, so this narrow
// path validates every field and writes only the columns listed below —
// never status or anything billing-related.
//
// Partial by design: only the keys present in `settings` are validated and
// written. The desktop settings screen sends everything; the phone's admin
// profile sends just `landline`.

import { corsHeaders } from '../_shared/cors.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';

const PHONE_RE = /^0([23489]|5[0-9]|7[0-9])\d{6,7}$/;
const EMAIL_RE = /^[A-Za-z0-9_%+-]+(\.[A-Za-z0-9_%+-]+)*@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COMPANY_TYPES = ['בע״מ', 'עוסק מורשה'];

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

class Invalid extends Error {}

function text(value: unknown, max = 200): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Invalid('ערך לא תקין');
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Invalid('ערך ארוך מדי');
  return trimmed || null;
}

function phone(value: unknown, label: string): string | null {
  const raw = text(value, 20);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!PHONE_RE.test(digits)) throw new Invalid(`${label}: מספר טלפון לא תקין`);
  return digits;
}

function email(value: unknown, label: string): string | null {
  const raw = text(value, 254);
  if (!raw) return null;
  if (!EMAIL_RE.test(raw)) throw new Invalid(`${label}: כתובת מייל לא תקינה`);
  return raw.toLowerCase();
}

function imageUrl(value: unknown): string | null {
  const raw = text(value, 1000);
  if (!raw) return null;
  // Only files that live in our own storage — never an arbitrary external URL.
  const base = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/company-logos/`;
  if (!raw.startsWith(base)) throw new Invalid('קובץ התמונה לא תקין');
  return raw;
}

/** Validates and maps only the keys the caller sent. */
function buildPatch(s: Record<string, unknown>): Record<string, unknown> {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(s, key);
  const patch: Record<string, unknown> = {};

  if (has('name')) {
    const name = text(s.name, 120);
    if (!name) throw new Invalid('שם החברה הוא שדה חובה');
    patch.name = name;
  }
  if (has('businessId')) {
    const businessId = (text(s.businessId, 20) ?? '').replace(/\D/g, '');
    if (businessId.length !== 9) throw new Invalid('ח.פ / ע.מ צריך להכיל 9 ספרות');
    patch.business_id = businessId;
  }
  if (has('companyType')) {
    const companyType = s.companyType ?? null;
    if (companyType !== null && !COMPANY_TYPES.includes(companyType as string)) throw new Invalid('סוג חברה לא תקין');
    patch.company_type = companyType;
  }
  if (has('address')) patch.address = text(s.address, 300);
  if (has('carrierLicenseExpiry')) {
    const expiry = text(s.carrierLicenseExpiry, 10);
    if (expiry && (!DATE_RE.test(expiry) || Number.isNaN(Date.parse(expiry)))) {
      throw new Invalid('תאריך תוקף רישיון מוביל לא תקין');
    }
    patch.carrier_license_expiry = expiry;
  }
  if (has('landline')) patch.phone = phone(s.landline, 'טלפון קווי');
  if (has('mobile')) patch.mobile_phone = phone(s.mobile, 'טלפון נייד');
  if (has('fax')) patch.fax = phone(s.fax, 'פקס');
  if (has('email')) patch.email = email(s.email, 'מייל החברה');
  if (has('filesEmail')) patch.files_email = email(s.filesEmail, 'מייל לשליחת קבצים');
  if (has('filesEmail2')) patch.files_email_2 = email(s.filesEmail2, 'מייל נוסף לשליחת קבצים');
  if (has('reportEmail')) patch.odometer_report_email = email(s.reportEmail, 'מייל הדוח החודשי');
  if (has('reportAuto')) {
    patch.odometer_report_enabled = s.reportAuto === true;
    if (patch.odometer_report_enabled && has('reportEmail') && !patch.odometer_report_email) {
      throw new Invalid('כדי להפעיל שליחה צריך מייל');
    }
  }
  if (has('contacts')) {
    const contacts = Array.isArray(s.contacts) ? s.contacts.slice(0, 2) : [];
    patch.contacts = contacts.map((c: Record<string, unknown>, i: number) => ({
      name: text(c?.name, 120) ?? '',
      role: text(c?.role, 120) ?? '',
      phone: phone(c?.phone, `איש קשר ${i + 1}`) ?? '',
      email: email(c?.email, `איש קשר ${i + 1}`) ?? '',
    }));
  }
  if (has('officers')) {
    const officers = (Array.isArray(s.officers) ? s.officers : []) as Record<string, unknown>[];
    patch.safety_officer_name = text(officers[0]?.name, 120);
    patch.safety_officer_phone = phone(officers[0]?.phone, 'קצין בטיחות 1');
    patch.safety_officer_2_name = text(officers[1]?.name, 120);
    patch.safety_officer_2_phone = phone(officers[1]?.phone, 'קצין בטיחות 2');
  }
  if (has('logoUrl')) patch.logo_url = imageUrl(s.logoUrl);
  if (has('stampUrl')) patch.stamp_url = imageUrl(s.stampUrl);
  return patch;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'השיטה אינה נתמכת' }, 405);

  try {
    const { companyId, settings: s } = await req.json();
    const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!access.ok) return json({ error: access.error }, access.status);
    if (!s || typeof s !== 'object') return json({ error: 'חסרים נתונים' }, 400);

    let patch: Record<string, unknown>;
    try {
      patch = buildPatch(s as Record<string, unknown>);
      if (Object.keys(patch).length === 0) throw new Invalid('אין שינויים לשמירה');
    } catch (error) {
      if (error instanceof Invalid) return json({ error: error.message }, 400);
      throw error;
    }

    const { data, error } = await access.adminClient
      .from('companies')
      .update(patch)
      .eq('id', companyId)
      .select('*')
      .single();
    if (error || !data) {
      console.error('update-company-settings write failed', error?.code ?? 'no row');
      return json({ error: 'שמירת הגדרות החברה נכשלה' }, 500);
    }

    return json({ success: true, company: data });
  } catch (error) {
    console.error('update-company-settings failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'אירעה שגיאה בלתי צפויה' }, 500);
  }
});
