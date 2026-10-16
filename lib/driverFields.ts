// שדות טופס הנהג: דרגות רישיון, מצב משפחתי, השכלה ומחלקות
import type { Department, DriverRow } from './adminApi';
import { t } from './i18n';

// דרגות הרישיון לבחירה
export const LICENSE_CLASS_OPTIONS = [
  { value: 'A2', get label() { return t('license.class.A2'); } },
  { value: 'A1', get label() { return t('license.class.A1'); } },
  { value: 'A', get label() { return t('license.class.A'); } },
  { value: 'B', get label() { return t('license.class.B'); } },
  { value: 'C1', get label() { return t('license.class.C1'); } },
  { value: 'C', get label() { return t('license.class.C'); } },
  { value: 'C+E', get label() { return t('license.class.CE'); } },
  { value: 'D1', get label() { return t('license.class.D1'); } },
  { value: 'D2', get label() { return t('license.class.D2'); } },
  { value: 'D3', get label() { return t('license.class.D3'); } },
  { value: 'D', get label() { return t('license.class.D'); } },
  { value: '1', get label() { return t('license.class.T'); } },
  { value: 'PERMIT', get label() { return t('license.class.machinery'); } },
];

// אפשרויות מצב משפחתי
// Stored as the Hebrew label itself (the columns are plain text), so the
// value never changes with the UI language; only the label shown is translated.
const MARITAL_STATUS_KEYS: Record<string, string> = {
  'רווק/ה': 'driver.marital.single',
  'נשוי/אה': 'driver.marital.married',
  'ידוע/ה בציבור': 'driver.marital.partner',
  'גרוש/ה': 'driver.marital.divorced',
  'פרוד/ה': 'driver.marital.separated',
  'אלמן/ה': 'driver.marital.widowed',
};

// אפשרויות השכלה
const EDUCATION_KEYS: Record<string, string> = {
  'יסודית': 'driver.edu.elementary',
  'תיכונית ללא בגרות': 'driver.edu.highSchool',
  'בגרות מלאה': 'driver.edu.matriculation',
  'מקצועית / הנדסאי': 'driver.edu.vocational',
  'תואר ראשון': 'driver.edu.bachelor',
  'תואר שני ומעלה': 'driver.edu.master',
};

// הטקסט להצגה של ערך שמור, בשפת הממשק
/** The label for a stored marital status or education value, in the UI language. */
export function storedValueLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = MARITAL_STATUS_KEYS[value] ?? EDUCATION_KEYS[value];
  return key ? t(key) : value;
}

// רשימת מצב משפחתי לבחירה
export const MARITAL_STATUS_OPTIONS = Object.entries(MARITAL_STATUS_KEYS)
  .map(([value, key]) => ({ value, get label() { return t(key); } }));

// רשימת השכלה לבחירה
export const EDUCATION_OPTIONS = Object.entries(EDUCATION_KEYS)
  .map(([value, key]) => ({ value, get label() { return t(key); } }));

// מוסיף לרשימה ערך שמור שלא נמצא בה
/** Keeps a saved value that is not in the list selectable, so it is never shown as empty. */
export function optionsWithCurrent(
  options: { value: string; label: string }[],
  current: string | null | undefined,
): { value: string; label: string }[] {
  const value = current?.trim();
  if (!value || options.some((option) => option.value === value)) return options;
  return [...options, { value, label: storedValueLabel(value) ?? value }];
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

// מפריד דרגת רישיון ראשית ומשנית
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

// מחבר דרגות רישיון לשמירה
export function joinLicenseClasses(primary: string, secondary: string): string {
  return [primary, secondary]
    .map((item) => item.trim())
    .filter(Boolean)
    .join(', ');
}

// שם המחלקה לפי מזהה
export function departmentNameById(departments: Department[], departmentId: string | null | undefined): string | null {
  return departments.find((department) => department.id === departmentId)?.name ?? null;
}

// רשימת המחלקות לבחירה
export function departmentOptions(departments: Department[]): { value: string; label: string }[] {
  return departments.map((department) => ({ value: department.id, label: department.name }));
}

// הודעת אזהרה לפני מחיקת מחלקה
/** True when a save failed because the selected department was deleted (by someone else) while the form was open. */
/** The delete warning, naming what is still tagged with the department: it stays without one. */
export function departmentDeleteMessage(name: string, usage: { vehicles: number; drivers: number }): string {
  const parts = [
    usage.vehicles === 1 ? 'רכב אחד' : usage.vehicles > 0 ? `${usage.vehicles} רכבים` : '',
    usage.drivers === 1 ? t('common.oneDriver') : usage.drivers > 0 ? `${usage.drivers} נהגים` : '',
  ].filter(Boolean);
  const isSingular = usage.vehicles + usage.drivers === 1;
  return parts.length
    ? `למחוק את "${name}"? ${parts.join(' ו')} ${isSingular ? 'משויך' : 'משויכים'} אליה כרגע, ו${isSingular ? 'יישאר' : 'יישארו'} ללא מחלקה.`
    : `למחוק את "${name}"?`;
}

// האם השמירה נכשלה כי המחלקה נמחקה בינתיים
export function isStaleDepartmentError(message: string | null | undefined): boolean {
  return !!message && message.includes('department_id_fkey');
}

// ממלא את טופס העריכה מנתוני הנהג
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
