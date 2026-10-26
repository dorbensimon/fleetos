// דוח נהגים להורדה (PDF או אקסל)
import { Company } from './supabase';
import { DriverRow } from './adminApi';
import { daysUntilExpiry } from './theme';
import { formatPlate } from './plate';
import { formatPhone } from './phone';
import { expiryCell, deliverTableReport, ReportCell, type ReportFormat, type TableReportOptions } from './reportTemplate';

// Licence expiry lists live in "תוקפים" (lib/validityList.ts), with an Excel export.
export type ReportCategory = 'all' | 'no_vehicle';

// סוגי הדוח לבחירה
export const REPORT_CATEGORIES: { value: ReportCategory; label: string; icon: string }[] = [
  { value: 'all', label: 'כל הנהגים', icon: 'people-outline' },
  { value: 'no_vehicle', label: 'ללא רכב משויך', icon: 'ban-outline' },
];

// כותרת לכל סוג דוח
const CATEGORY_TITLES: Record<ReportCategory, string> = {
  all: 'דוח כלל הנהגים',
  no_vehicle: 'דוח נהגים ללא רכב משויך',
};

// מסנן את הנהגים לפי סוג הדוח
function filterDrivers(drivers: DriverRow[], category: ReportCategory): DriverRow[] {
  switch (category) {
    case 'no_vehicle':
      return drivers.filter((d) => !d.vehicle_plate);
    default:
      return drivers;
  }
}

const UNIT = { one: 'נהג אחד', many: 'נהגים' };

// בונה את טבלת הדוח
function buildReport(company: Company, drivers: DriverRow[], category: ReportCategory): TableReportOptions {
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
    case 'no_vehicle':
      return ({
        ...common,
        columns: [{ label: 'שם מלא', width: 24 }, { label: 'טלפון', width: 20 }, { label: 'תפקיד', width: 20 }, { label: 'דרגת רישיון', width: 14 }, { label: 'תוקף רישיון', width: 22 }],
        sections: [{ title: '', rows: drivers.map((d) => [name(d), phone(d), job(d), classes(d), expiry(d)]) }],
        grandTitle: 'סה״כ נהגים ללא רכב משויך',
        note: 'הדוח כולל נהגים שאין להם רכב משויך כרגע.',
        emptyText: 'לכל הנהגים יש רכב משויך',
      });
    default:
      return ({
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
  category: ReportCategory,
  format: ReportFormat = 'pdf'
): Promise<void> {
  const filtered = filterDrivers(drivers, category);
  await deliverTableReport(buildReport(company, filtered, category), CATEGORY_TITLES[category], format);
}
