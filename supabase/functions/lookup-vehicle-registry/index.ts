import { corsHeaders } from '../_shared/cors.ts';
import { verifyUser } from '../_shared/verifyUser.ts';

// Israel's vehicle registry (data.gov.il) splits vehicles across several
// datasets by category — a single resource never covers the whole fleet.
// The fleet here includes cars, minibuses, buses and trucks, so every
// lookup has to try each relevant dataset in turn until one matches.
const VEHICLE_RESOURCE_IDS = [
  '053cea08-09bc-40ec-8f7a-156f0677aff3', // כלי רכב פרטיים ומסחריים עד 3.5 טון
  'cf29862d-ca25-4691-84f6-1be60dcb4a1e', // כלי רכב ציבוריים (אוטובוסים, מיניבוסים)
  'cd3acc5c-03c3-4c89-9c54-d40f93c0d790', // כלי רכב מעל 3.5 טון (משאיות)
];
const LOOKUP_TIMEOUT_MS = 8_000;

type RegistryRecord = {
  mispar_rechev?: string | number;
  tozeret_nm?: string;
  degem_nm?: string;
  kinuy_mishari?: string;
  shnat_yitzur?: string | number;
  tzeva_rechev?: string;
  tokef_dt?: string;
};

type RegistryResponse = {
  success?: boolean;
  result?: { records?: RegistryRecord[] };
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalYear(value: unknown): number | null {
  const year = typeof value === 'number' ? value : Number(value);
  const currentYear = new Date().getUTCFullYear();
  return Number.isInteger(year) && year >= 1900 && year <= currentYear ? year : null;
}

function optionalIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

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
      if (found) { record = found; break; }
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
      },
    });
  } catch (error) {
    console.error('lookup-vehicle-registry failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'לא ניתן לחפש את פרטי הרכב כרגע. נסה שוב.' }, 500);
  }
});
