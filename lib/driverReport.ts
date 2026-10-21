// דוח נהגים להורדה (PDF)
import { Company } from './supabase';
import { DriverRow } from './adminApi';
import { daysUntilExpiry, expiryState } from './theme';
import { formatPlate } from './plate';
import { formatPhone } from './phone';
import { buildTableReport, expiryCell, printOrShareReport, ReportCell } from './reportTemplate';

export type ReportCategory = 'all' | 'soon' | 'expired' | 'no_vehicle';

// סוגי הדוח לבחירה
export const REPORT_CATEGORIES: { value: ReportCategory; label: string; icon: string }[] = [
  { value: 'all', label: 'כל הנהגים', icon: 'people-outline' },
  { value: 'soon', label: 'רישיון קרוב לפוג', icon: 'hourglass-outline' },
  { value: 'expired', label: 'רישיון פג / חסר', icon: 'warning' },
  { value: 'no_vehicle', label: 'ללא רכב משויך', icon: 'ban-outline' },
];

// כותרת לכל סוג דוח
const CATEGORY_TITLES: Record<ReportCategory, string> = {
  all: 'דוח כלל הנהגים',
  soon: 'דוח נהגים עם רישיון קרוב לפוג',
  expired: 'דוח נהגים ללא רישיון בתוקף',
  no_vehicle: 'דוח נהגים ללא רכב משויך',
};

// מסנן את הנהגים לפי סוג הדוח
function filterDrivers(drivers: DriverRow[], category: ReportCategory): DriverRow[] {
  switch (category) {
    case 'soon':
      return drivers.filter((d) => expiryState(d.license_expiry) === 'soon');
    case 'expired':
      return drivers.filter((d) => ['expired', 'missing'].includes(expiryState(d.license_expiry)));
    case 'no_vehicle':
      return drivers.filter((d) => !d.vehicle_plate);
    default:
      return drivers;
  }
}

const UNIT = { one: 'נהג אחד', many: 'נהגים' };

// בונה את ה-HTML של הדוח
function buildHtml(company: Company, drivers: DriverRow[], category: ReportCategory): string {
  const name = (d: DriverRow): ReportCell => ({ text: d.full_name });
  const phone = (d: DriverRow): ReportCell => ({ text: d.phone ? formatPhone(d.phone) : null, ltr: true });
  const job = (d: DriverRow): ReportCell => ({ text: d.job_title });
  const classes = (d: DriverRow): ReportCell => ({ text: d.license_classes });
  const vehicle = (d: DriverRow): ReportCell => {
    const plates = (d.vehicles?.length ? d.vehicles.map((v) => v.plate_number) : d.vehicle_plate ? [d.vehicle_plate] : []).map(formatPlate);
    return plates.length ? { text: plates.join(', '), ltr: true } : { text: 'ללא רכב', tone: 'muted' };
  };
  const expiry = (d: DriverRow): ReportCell => expiryCell(d.license_expiry, daysUntilExpiry(d.license_expiry));
  const common = { company: { name: company.name, businessId: company.business_id }, title: CATEGORY_TITLES[category], unit: UNIT };

  switch (category) {
    case 'soon':
      return buildTableReport({
        ...common,
        columns: [{ label: 'שם מלא', width: 22 }, { label: 'טלפון', width: 18 }, { label: 'דרגת רישיון', width: 14 }, { label: 'רכב משויך', width: 18 }, { label: 'תוקף רישיון', width: 28 }],
        sections: [{ title: '', rows: drivers.map((d) => [name(d), phone(d), classes(d), vehicle(d), expiry(d)]) }],
        grandTitle: 'סה״כ נהגים עם רישיון קרוב לפוג',
        note: 'הדוח כולל נהגים שהרישיון שלהם יפוג בתוך 30 הימים הקרובים.',
        emptyText: 'אין נהגים עם רישיון קרוב לפוג',
      });
    case 'expired': {
      const row = (d: DriverRow) => [name(d), phone(d), classes(d), vehicle(d), expiry(d)];
      return buildTableReport({
        ...common,
        columns: [{ label: 'שם מלא', width: 22 }, { label: 'טלפון', width: 18 }, { label: 'דרגת רישיון', width: 14 }, { label: 'רכב משויך', width: 18 }, { label: 'תוקף רישיון', width: 28 }],
        sections: [
          { title: 'סה״כ רישיון פג תוקף', rows: drivers.filter((d) => expiryState(d.license_expiry) === 'expired').map(row) },
          { title: 'סה״כ ללא תאריך רישיון', rows: drivers.filter((d) => expiryState(d.license_expiry) === 'missing').map(row) },
        ],
        grandTitle: 'סה״כ נהגים ללא רישיון בתוקף',
        note: 'הדוח כולל נהגים שהרישיון שלהם פג או שלא הוזן להם תוקף רישיון.',
        emptyText: 'לכל הנהגים יש רישיון בתוקף',
      });
    }
    case 'no_vehicle':
      return buildTableReport({
        ...common,
        columns: [{ label: 'שם מלא', width: 24 }, { label: 'טלפון', width: 20 }, { label: 'תפקיד', width: 20 }, { label: 'דרגת רישיון', width: 14 }, { label: 'תוקף רישיון', width: 22 }],
        sections: [{ title: '', rows: drivers.map((d) => [name(d), phone(d), job(d), classes(d), expiry(d)]) }],
        grandTitle: 'סה״כ נהגים ללא רכב משויך',
        note: 'הדוח כולל נהגים שאין להם רכב משויך כרגע.',
        emptyText: 'לכל הנהגים יש רכב משויך',
      });
    default:
      return buildTableReport({
        ...common,
        columns: [{ label: 'שם מלא', width: 20 }, { label: 'טלפון', width: 17 }, { label: 'תפקיד', width: 15 }, { label: 'דרגת רישיון', width: 13 }, { label: 'רכב משויך', width: 15 }, { label: 'תוקף רישיון', width: 20 }],
        sections: [{ title: '', rows: drivers.map((d) => [name(d), phone(d), job(d), classes(d), vehicle(d), expiry(d)]) }],
        grandTitle: 'סה״כ נהגים',
        note: 'רשימת כל הנהגים בחברה.',
        emptyText: 'אין נהגים בחברה',
      });
  }
}

// מפיק ומוריד את דוח הנהגים
export async function exportDriversReport(
  company: Company,
  drivers: DriverRow[],
  category: ReportCategory
): Promise<void> {
  const filtered = filterDrivers(drivers, category);
  const html = buildHtml(company, filtered, category);
  await printOrShareReport(html, CATEGORY_TITLES[category]);
}
