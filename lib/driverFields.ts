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

export interface DriverEditableFields {
  phone: string;
  national_id: string;
  employee_number: string;
  license_classes: string;
  license_classes_2: string;
  license_expiry: string;
  department_id: string | null;
}

export function splitDriverFullName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  const [firstName, ...rest] = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: firstName ?? '',
    lastName: rest.join(' '),
  };
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
