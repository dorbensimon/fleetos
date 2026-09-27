/**
 * Driver-detail notifications list the changed fields by their Hebrew label
 * ("המנהל עדכן בתיק שלך: טלפון, תוקף רישיון" — supabase/sql/92). These are
 * the same labels, mapped back to the column each one stands for, so a
 * notification can open the screen at that exact field.
 */
const FIELD_BY_LABEL: Record<string, string> = {
  'שם מלא': 'full_name',
  'טלפון': 'phone',
  'תפקיד': 'job_title',
  'מחלקה': 'department_id',
  'מספר עובד': 'employee_number',
  'תעודת זהות': 'national_id',
  'תאריך לידה': 'birth_date',
  'כתובת': 'address',
  'טלפון בבית': 'home_phone',
  'מצב משפחתי': 'marital_status',
  'השכלה': 'education',
  'תחילת עבודה': 'employment_start_date',
  'מספר רישיון': 'license_number',
  'דרגת רישיון': 'license_classes',
  'הוצאת רישיון': 'license_issue_date',
  'תוקף רישיון': 'license_expiry',
};

/** The field keys named in a "…: a, b, c" message, in the order written. */
export function fieldKeysFromMessage(message: string | null | undefined): string[] {
  if (!message) return [];
  const colon = message.lastIndexOf(':');
  if (colon < 0) return [];
  return message
    .slice(colon + 1)
    .split(',')
    .map((label) => FIELD_BY_LABEL[label.trim()])
    .filter((key): key is string => !!key);
}

/** Joined for a route param, or undefined when nothing was recognised. */
export function focusParam(keys: readonly string[]): string | undefined {
  return keys.length ? keys.join(',') : undefined;
}

/** A driver's odometer notification names the plate: "… עדכן/ה קילומטראז׳ ברכב 12-345-67 ל-…". */
export function plateFromOdometerMessage(message: string | null | undefined): string | null {
  const match = message?.match(/ברכב\s+(.+?)\s+ל-/);
  return match ? match[1].trim() : null;
}
