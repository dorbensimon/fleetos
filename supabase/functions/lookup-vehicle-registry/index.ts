// פונקציית שרת: חיפוש רכב במאגר הממשלתי
import { corsHeaders } from '../_shared/cors.ts';
import { verifyUser } from '../_shared/verifyUser.ts';

// המאגרים לחיפוש
// Israel's vehicle registry (data.gov.il) splits vehicles across several
// datasets by category — a single resource never covers the whole fleet.
// The fleet here includes cars, minibuses, buses and trucks, so every
// lookup has to try each relevant dataset in turn until one matches.
const VEHICLE_RESOURCE_IDS = [
  '053cea08-09bc-40ec-8f7a-156f0677aff3', // כלי רכב פרטיים ומסחריים עד 3.5 טון
  'cf29862d-ca25-4691-84f6-1be60dcb4a1e', // כלי רכב ציבוריים (אוטובוסים, מיניבוסים)
  'cd3acc5c-03c3-4c89-9c54-d40f93c0d790', // כלי רכב מעל 3.5 טון (משאיות)
];
// כמה זמן מחכים לתשובה
const LOOKUP_TIMEOUT_MS = 8_000;

type RegistryRecord = {
  [field: string]: unknown;
  mispar_rechev?: string | number;
  tozeret_nm?: string;
  degem_nm?: string;
  kinuy_mishari?: string;
  shnat_yitzur?: string | number;
  tzeva_rechev?: string;
  tokef_dt?: string;
  sug_degem?: string;
  sug_rechev_nm?: string;
  kvutzat_sug_rechev?: string;
  mishkal_kolel?: number | string;
};

type RegistryResponse = {
  success?: boolean;
  result?: { records?: RegistryRecord[] };
};

// תשובת JSON
function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// טקסט או ריק
function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// שנה או ריק
function optionalYear(value: unknown): number | null {
  const year = typeof value === 'number' ? value : Number(value);
  const currentYear = new Date().getUTCFullYear();
  return Number.isInteger(year) && year >= 1900 && year <= currentYear ? year : null;
}

// תאריך או ריק
function optionalIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

// סוג הרכב לפי המאגר שבו נמצא
/**
 * Maps the registry record to one of the app's vehicle types, or null when
 * the record does not say clearly. Each dataset names the type differently:
 * private/commercial uses sug_degem (P/M), public vehicles sug_rechev_nm,
 * the third dataset kvutzat_sug_rechev plus the gross weight.
 */
function vehicleTypeFrom(resourceId: string, record: RegistryRecord): string | null {
  if (resourceId === VEHICLE_RESOURCE_IDS[0]) {
    return record.sug_degem === 'P' ? 'car' : record.sug_degem === 'M' ? 'minibus' : null;
  }
  if (resourceId === VEHICLE_RESOURCE_IDS[1]) {
    const name = record.sug_rechev_nm ?? '';
    if (name.includes('מונית')) return 'taxi';
    return name.includes('אוטובוס') ? 'bus' : null;
  }
  const group = record.kvutzat_sug_rechev ?? '';
  if (group === 'פרטי') return 'car';
  if (group === 'טרקטור') return 'tractor';
  if (group === 'גרור נתמך') return 'trailer';
  if (group === 'מסחרי') return Number(record.mishkal_kolel) > 3500 ? 'truck' : 'minibus';
  return null;
}

// תאריך עלייה לכביש ("2023-3" ← 2023-03-01)
function roadDate(value: unknown): string | null {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{1,2})$/.exec(value.trim()) : null;
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-01` : null;
}

// מספר שלדה תקין בלבד
function optionalVin(value: unknown): string | null {
  const vin = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null;
}

// כל שאר הנתונים מהמאגר
/**
 * Every other registry value, by the app's keys (lib/vehicleRegistryFields.ts).
 * Values are kept as text; empty, zero and "not cancelled"-style noise is dropped.
 */
function registryDetails(record: RegistryRecord): Record<string, string> {
  const pick: Record<string, unknown> = {
    registry_kind: record.sug_rechev_nm || record.kvutzat_sug_rechev,
    trim_level: record.ramat_gimur,
    model_code: optionalText(record.kinuy_mishari) ? record.degem_nm : null,
    origin_country: record.tozeret_eretz_nm,
    fuel_type: record.sug_delek_nm,
    engine_model: record.degem_manoa,
    engine_number: record.mispar_manoa,
    engine_volume_cc: record.nefach_manoa,
    drive_type: record.hanaa_nm,
    tires_front: record.zmig_kidmi,
    tires_rear: record.zmig_ahori,
    last_test_date: optionalIsoDate(record.mivchan_acharon_dt),
    seats: record.mispar_mekomot,
    seats_beside_driver: record.mispar_mekomot_leyd_nahag,
    gross_weight_kg: record.mishkal_kolel,
    curb_weight_kg: record.mishkal_azmi,
    lift_weight_kg: record.mishkal_mitan_harama,
    tow_hitch: record.grira_nm,
    eu_category: record.sug_rechev_EU_cd || record.tkina_EU,
    ownership: record.baalut,
    pollution_group: record.kvutzat_zihum,
    safety_level: record.ramat_eivzur_betihuty,
  };
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(pick)) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text && text !== '0') out[key] = text;
  }
  return out;
}

// מחפש ומחזיר את נתוני הרכב
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'השיטה אינה נתמכת' }, 405);

  try {
    const user = await verifyUser(req.headers.get('Authorization'));
    if (!user.ok) return json({ error: user.error }, user.status);
    if (user.profile.role !== 'owner' && user.profile.role !== 'admin') {
      return json({ error: 'הפעולה זמינה למנהלים בלבד' }, 403);
    }

    const { plateNumber } = await req.json();
    const plate = typeof plateNumber === 'string' ? plateNumber.replace(/\D/g, '') : '';
    if (!/^\d{7,8}$/.test(plate)) {
      return json({ error: 'מספר הרישוי חייב להכיל 7–8 ספרות' }, 400);
    }

    let record: RegistryRecord | null = null;
    let recordResource = '';
    let anyRequestSucceeded = false;
    for (const resourceId of VEHICLE_RESOURCE_IDS) {
      const url = new URL('https://data.gov.il/api/3/action/datastore_search');
      url.searchParams.set('resource_id', resourceId);
      url.searchParams.set('limit', '1');
      url.searchParams.set('filters', JSON.stringify({ mispar_rechev: Number(plate) }));

      let response: Response;
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
      } catch (error) {
        console.error('vehicle registry request failed', resourceId, error instanceof Error ? error.name : 'unknown');
        continue;
      }

      if (!response.ok) {
        console.error('vehicle registry response failed', resourceId, response.status);
        continue;
      }

      anyRequestSucceeded = true;
      const payload = await response.json() as RegistryResponse;
      const found = payload.success ? payload.result?.records?.[0] : null;
      if (found) { record = found; recordResource = resourceId; break; }
    }

    if (!record) {
      if (!anyRequestSucceeded) {
        return json({ error: 'מאגר משרד התחבורה אינו זמין כרגע. אפשר לנסות שוב או למלא ידנית.' }, 503);
      }
      return json({ found: false });
    }

    const commercialModel = optionalText(record.kinuy_mishari);
    return json({
      found: true,
      vehicle: {
        plateNumber: String(record.mispar_rechev ?? plate),
        manufacturer: optionalText(record.tozeret_nm),
        model: commercialModel ?? optionalText(record.degem_nm),
        productionYear: optionalYear(record.shnat_yitzur),
        color: optionalText(record.tzeva_rechev),
        licenseExpiry: optionalIsoDate(record.tokef_dt),
        vehicleType: vehicleTypeFrom(recordResource, record),
        vin: optionalVin(record.misgeret ?? record.mispar_shilda),
        roadRegistrationDate: roadDate(record.moed_aliya_lakvish),
        details: registryDetails(record),
      },
    });
  } catch (error) {
    console.error('lookup-vehicle-registry failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'לא ניתן לחפש את פרטי הרכב כרגע. נסה שוב.' }, 500);
  }
});
