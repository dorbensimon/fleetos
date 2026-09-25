import type { Department, DriverRow } from './adminApi';

export const LICENSE_CLASS_OPTIONS = [
  { value: 'A2', label: 'A2 — אופנוע קל, עד 125 סמ"ק / 14.9 כ"ס' },
  { value: 'A1', label: 'A1 — אופנוע בינוני, עד 47.46 כ"ס' },
  { value: 'A', label: 'A — אופנוע כבד, ללא הגבלת הספק או נפח' },
  { value: 'B', label: 'B — רכב פרטי, עד 3,500 ק"ג ו-8 נוסעים' },
  { value: 'C1', label: 'C1 — משא קל, 3,501–12,000 ק"ג' },
  { value: 'C', label: 'C — משא כבד, ללא הגבלת משקל' },
  { value: 'C+E', label: 'C+E — רכב מחובר (משאית עם גרור/נתמך)' },
  { value: 'D1', label: 'D1 — מונית ומיניבוס ציבורי, עד 16 נוסעים' },
  { value: 'D2', label: 'D2 — אוטובוס זעיר ציבורי (היתר מיוחד)' },
  { value: 'D3', label: 'D3 — אוטובוס זעיר פרטי' },
  { value: 'D', label: 'D — אוטובוס מלא, ללא הגבלת נוסעים' },
  { value: '1', label: '1 (T) — טרקטור, טרקטורון ורכב שטח' },
  { value: 'PERMIT', label: 'היתר מכונה ניידת (צמ"ה)' },
];

// Stored as the Hebrew label itself (the columns are plain text), so every
// screen can show the value without a lookup.
export const MARITAL_STATUS_OPTIONS = ['רווק/ה', 'נשוי/אה', 'ידוע/ה בציבור', 'גרוש/ה', 'פרוד/ה', 'אלמן/ה']
  .map((label) => ({ value: label, label }));

export const EDUCATION_OPTIONS = ['יסודית', 'תיכונית ללא בגרות', 'בגרות מלאה', 'מקצועית / הנדסאי', 'תואר ראשון', 'תואר שני ומעלה']
  .map((label) => ({ value: label, label }));

/** Keeps a saved value that is not in the list selectable, so it is never shown as empty. */
export function optionsWithCurrent(
  options: { value: string; label: string }[],
  current: string | null | undefined,
): { value: string; label: string }[] {
  const value = current?.trim();
  if (!value || options.some((option) => option.value === value)) return options;
  return [...options, { value, label: value }];
}

export interface DriverEditableFields {
  phone: string;
  national_id: string;
  employee_number: string;
  license_classes: string;
  license_classes_2: string;
  license_expiry: string;
  department_id: string | null;
}

export function splitLicenseClasses(value: string | null | undefined): { primary: string; secondary: string } {
  const [primary, secondary] = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    primary: primary ?? '',
    secondary: secondary ?? '',
  };
}

export function joinLicenseClasses(primary: string, secondary: string): string {
  return [primary, secondary]
    .map((item) => item.trim())
    .filter(Boolean)
    .join(', ');
}

export function departmentNameById(departments: Department[], departmentId: string | null | undefined): string | null {
  return departments.find((department) => department.id === departmentId)?.name ?? null;
}

export function departmentOptions(departments: Department[]): { value: string; label: string }[] {
  return departments.map((department) => ({ value: department.id, label: department.name }));
}

/** True when a save failed because the selected department was deleted (by someone else) while the form was open. */
/** The delete warning, naming what is still tagged with the department: it stays without one. */
export function departmentDeleteMessage(name: string, usage: { vehicles: number; drivers: number }): string {
  const parts = [
    usage.vehicles === 1 ? 'רכב אחד' : usage.vehicles > 0 ? `${usage.vehicles} רכבים` : '',
    usage.drivers === 1 ? 'נהג אחד' : usage.drivers > 0 ? `${usage.drivers} נהגים` : '',
  ].filter(Boolean);
  const isSingular = usage.vehicles + usage.drivers === 1;
  return parts.length
    ? `למחוק את "${name}"? ${parts.join(' ו')} ${isSingular ? 'משויך' : 'משויכים'} אליה כרגע, ו${isSingular ? 'יישאר' : 'יישארו'} ללא מחלקה.`
    : `למחוק את "${name}"?`;
}

export function isStaleDepartmentError(message: string | null | undefined): boolean {
  return !!message && message.includes('department_id_fkey');
}

export function driverEditableFieldsFromRow(driver: DriverRow | null | undefined): DriverEditableFields {
  const license = splitLicenseClasses(driver?.license_classes);
  return {
    phone: driver?.phone ?? '',
    national_id: driver?.national_id ?? '',
    employee_number: driver?.employee_number ?? '',
    license_classes: license.primary,
    license_classes_2: license.secondary,
    license_expiry: driver?.license_expiry ?? '',
    department_id: driver?.department_id ?? null,
  };
}
