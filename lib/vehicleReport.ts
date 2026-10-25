// דוח רכבים להורדה (PDF)
import { Company } from './supabase';
import { Vehicle, ComplianceItem, VehicleDriverWithProfile } from './adminApi';
import { listDepartments } from './adminApi/departments';
import { daysUntilExpiry } from './theme';
import { formatPlate } from './plate';
import { nextServiceKmOf } from './serviceSchedule';
import {
  VEHICLE_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  complianceRemainingDays,
  complianceTargetDate,
  vehicleTest,
} from './compliance';
import { TONE_BAD, TONE_NEUTRAL, TONE_OK, TONE_WARN, SERVICE_WARN_KM, remainingTone } from './fleetCardHelpers';
import { buildTableReport, expiryCell, printOrShareReport, ReportCell } from './reportTemplate';

// Expiry-only lists (insurance, test...) live in "תוקפים" (lib/validityList.ts), with an Excel export.
export type VehicleReportCategory = 'all' | 'service' | 'issues';

// סוגי הדוח לבחירה
export const VEHICLE_REPORT_CATEGORIES: { value: VehicleReportCategory; label: string; icon: string }[] = [
  { value: 'all', label: 'כל הרכבים', icon: 'car-outline' },
  { value: 'issues', label: 'רכבים עם חריגה', icon: 'warning' },
  { value: 'service', label: 'טיפול קרוב / באיחור', icon: 'build-outline' },
];

// כותרת לכל סוג דוח
const CATEGORY_TITLES: Record<VehicleReportCategory, string> = {
  all: 'דוח כלל הרכבים',
  issues: 'דוח רכבים עם חריגה',
  service: 'דוח טיפולים',
};

interface VehicleSummary {
  vehicle: Vehicle;
  insurance: string | null;
  insDays: number | null;
  insTone: string;
  test: string | null;
  testDays: number | null;
  testTone: string;
  nextServiceKm: number | null;
  kmToService: number | null;
  svcTone: string;
  driverName: string | null;
}

// מסכם כל רכב לשורה בדוח
function summarize(
  vehicle: Vehicle,
  compliance: Map<string, ComplianceItem[]>,
  vehicleDrivers: Map<string, VehicleDriverWithProfile[]>
): VehicleSummary {
  const items = compliance.get(vehicle.id) ?? [];
  const insuranceItem = items.find((c) => c.item_type === 'insurance_mandatory') ?? null;
  const { def: testDef, item: testItem } = vehicleTest(items);

  const insurance = insuranceItem?.expiry_date ?? null;
  const insDays = daysUntilExpiry(insurance);
  const rawTestDays = testDef ? complianceRemainingDays(testDef, testItem) : daysUntilExpiry(testItem?.expiry_date ?? null);
  const testDays = rawTestDays === Number.POSITIVE_INFINITY ? null : rawTestDays;
  const nextServiceKm = nextServiceKmOf(vehicle);
  const kmToService = nextServiceKm != null ? nextServiceKm - vehicle.odometer : null;

  const assignedDrivers = vehicleDrivers.get(vehicle.id) ?? [];
  const driverName = assignedDrivers.find((d) => d.is_primary)?.full_name ?? assignedDrivers[0]?.full_name ?? null;

  return {
    vehicle,
    insurance,
    insDays,
    insTone: remainingTone(insDays, 30),
    test: testDef ? complianceTargetDate(testDef, testItem) : testItem?.expiry_date ?? null,
    testDays,
    testTone: remainingTone(testDays, 30),
    nextServiceKm,
    kmToService,
    svcTone: remainingTone(kmToService, SERVICE_WARN_KM),
    driverName,
  };
}

// שמות הסטטוסים בדוח כלל הרכבים, לפי הסדר
const STATUS_SECTIONS: [Vehicle['status'], string][] = [
  ['active', 'סה״כ רכבים פעילים'],
  ['maintenance', 'סה״כ רכבים בטיפול'],
  ['disabled', 'סה״כ רכבים מושבתים'],
];

const UNIT = { one: 'רכב אחד', many: 'רכבים' };
const PLATE = { label: 'מספר רישוי', width: 15 };
const MODEL = { label: 'יצרן ודגם', width: 22 };
const TYPE = { label: 'סוג', width: 11 };
const DEPT = { label: 'מחלקה', width: 13 };
const DRIVER = { label: 'נהג משויך', width: 18 };

// בונה את ה-HTML של הדוח
function buildHtml(
  company: Company,
  summaries: VehicleSummary[],
  category: VehicleReportCategory,
  departments: Map<string, string>
): string {
  const plate = (s: VehicleSummary): ReportCell => ({ text: formatPlate(s.vehicle.plate_number), ltr: true });
  const model = (s: VehicleSummary): ReportCell => ({ text: [s.vehicle.manufacturer, s.vehicle.model].filter(Boolean).join(' ') });
  const type = (s: VehicleSummary): ReportCell => ({ text: VEHICLE_TYPE_LABELS[s.vehicle.vehicle_type] ?? s.vehicle.vehicle_type });
  const dept = (s: VehicleSummary): ReportCell => ({ text: s.vehicle.department_id ? departments.get(s.vehicle.department_id) : null });
  const driver = (s: VehicleSummary): ReportCell => ({ text: s.driverName ?? 'ללא נהג', tone: s.driverName ? undefined : 'muted' });
  const base = (s: VehicleSummary) => [plate(s), model(s), type(s), dept(s), driver(s)];
  const km = (n: number) => n.toLocaleString('en-US');
  const serviceCell = (s: VehicleSummary): ReportCell => {
    if (s.nextServiceKm == null || s.kmToService == null) return { text: 'לא הוזן', tone: 'muted' };
    const text = `${km(s.nextServiceKm)} ק״מ`;
    return s.kmToService < 0
      ? { text, tone: 'bad', sub: `באיחור של ${km(-s.kmToService)} ק״מ` }
      : { text, sub: `בעוד ${km(s.kmToService)} ק״מ` };
  };

  const common = { company: { name: company.name, businessId: company.business_id }, title: CATEGORY_TITLES[category], unit: UNIT };

  switch (category) {
    case 'service':
      return buildTableReport({
        ...common,
        columns: [PLATE, MODEL, TYPE, DEPT, { label: 'ק״מ נוכחי', width: 14 }, { label: 'טיפול הבא', width: 25 }],
        sections: [
          { title: 'סה״כ טיפול באיחור', rows: summaries.filter((s) => s.svcTone === TONE_BAD) },
          { title: 'סה״כ טיפול קרוב', rows: summaries.filter((s) => s.svcTone === TONE_WARN) },
          { title: 'סה״כ ללא נתוני טיפול', rows: summaries.filter((s) => s.svcTone === TONE_NEUTRAL) },
        ].map((sec) => ({
          title: sec.title,
          rows: sec.rows.map((s) => [plate(s), model(s), type(s), dept(s), { text: km(s.vehicle.odometer), ltr: true }, serviceCell(s)]),
        })),
        grandTitle: 'סה״כ רכבים שדורשים טיפול',
        note: `טיפול קרוב: פחות מ־${km(SERVICE_WARN_KM)} ק״מ עד הטיפול הבא.`,
        emptyText: 'אין רכבים שצריכים טיפול',
      });
    case 'issues': {
      const short = (s: VehicleSummary) => [plate(s), model(s), dept(s), driver(s)];
      return buildTableReport({
        ...common,
        columns: [PLATE, MODEL, { label: 'מחלקה', width: 13 }, DRIVER, { label: 'פירוט', width: 32 }],
        sections: [
          { title: 'סה״כ טסט פג, קרוב או חסר', rows: summaries.filter((s) => s.testTone !== TONE_OK).map((s) => [...short(s), s.test ? expiryCell(s.test, s.testDays) : { text: 'טסט לא הוזן', tone: 'muted' as const }]) },
          { title: 'סה״כ ביטוח חובה פג, קרוב או חסר', rows: summaries.filter((s) => s.insTone !== TONE_OK).map((s) => [...short(s), s.insurance ? expiryCell(s.insurance, s.insDays) : { text: 'ביטוח חובה לא הועלה', tone: 'muted' as const }]) },
          { title: 'סה״כ טיפול באיחור, קרוב או חסר', rows: summaries.filter((s) => s.svcTone !== TONE_OK).map((s) => [...short(s), serviceCell(s)]) },
        ],
        grandTitle: 'סה״כ רכבים עם חריגה',
        grandCount: summaries.length,
        note: 'רכב עם כמה חריגות מופיע בכל אחד מהסעיפים שלו, אבל נספר פעם אחת בסה״כ.',
        emptyText: 'אין רכבים עם חריגה',
      });
    }
    default:
      return buildTableReport({
        ...common,
        columns: [PLATE, MODEL, TYPE, DEPT, DRIVER, { label: 'סטטוס', width: 21 }],
        sections: STATUS_SECTIONS.map(([status, title]) => ({
          title,
          rows: summaries.filter((s) => s.vehicle.status === status).map((s) => [...base(s), { text: VEHICLE_STATUS_LABELS[status] ?? status }]),
        })),
        grandTitle: 'סה״כ רכבים בצי',
        note: 'רשימת כל הרכבים בצי, מקובצת לפי סטטוס.',
        emptyText: 'אין רכבים בצי',
      });
  }
}

// מסנן רכבים לפי סוג הדוח
function filterVehicles(summaries: VehicleSummary[], category: VehicleReportCategory): VehicleSummary[] {
  switch (category) {
    case 'service':
      return summaries.filter((s) => s.svcTone !== TONE_OK);
    case 'issues':
      return summaries.filter((s) => s.testTone !== TONE_OK || s.insTone !== TONE_OK || s.svcTone !== TONE_OK);
    default:
      return summaries;
  }
}

// מפיק ומוריד את הדוח
export async function exportVehiclesReport(
  company: Company,
  vehicles: Vehicle[],
  compliance: Map<string, ComplianceItem[]>,
  vehicleDrivers: Map<string, VehicleDriverWithProfile[]>,
  category: VehicleReportCategory
): Promise<void> {
  const activeVehicles = vehicles.filter((v) => v.status !== 'archived');
  const summaries = activeVehicles.map((v) => summarize(v, compliance, vehicleDrivers));
  const departments = new Map((await listDepartments(company.id)).map((d) => [d.id, d.name]));
  const html = buildHtml(company, filterVehicles(summaries, category), category, departments);
  await printOrShareReport(html, CATEGORY_TITLES[category]);
}
