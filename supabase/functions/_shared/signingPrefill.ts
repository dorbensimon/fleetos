export const PREFILL_LABELS: Record<string, string> = {
  company_name: 'שם החברה', driver_full_name: 'שם הנהג', driver_phone: 'טלפון',
  driver_national_id: 'תעודת זהות', driver_license_number: 'מספר רישיון',
  driver_license_classes: 'דרגות רישיון', driver_license_expiry: 'תוקף רישיון',
};
export type TemplateField = { name?: string; required?: boolean; type?: string; submitter_uuid?: string };
export function missingPrefill(fields: TemplateField[], values: Record<string, unknown>): string[] {
  return fields.filter(field => field.required !== false && field.name && field.name in PREFILL_LABELS &&
    (values[field.name] == null || String(values[field.name]).trim() === '')).map(field => PREFILL_LABELS[field.name!]);
}
