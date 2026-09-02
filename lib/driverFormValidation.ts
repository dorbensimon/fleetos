import { isValidIsraeliPhone } from './phone';
import { parseDateValue } from './theme';
import { isValidEmail } from './validation';

export type DriverFormValidationState = {
  full_name: string;
  phone: string;
  email: string;
  password: string;
  national_id: string;
  license_classes: string;
  license_expiry: string;
};

export type DriverFormField = keyof DriverFormValidationState;

const CREATE_REQUIRED_FIELDS = [
  'full_name',
  'phone',
  'national_id',
  'license_classes',
  'license_expiry',
  'email',
  'password',
] as const satisfies readonly DriverFormField[];

const EDIT_REQUIRED_FIELDS = [
  'full_name',
  'phone',
  'national_id',
  'license_classes',
  'license_expiry',
] as const satisfies readonly DriverFormField[];

export function getRequiredDriverFields(isEdit: boolean): readonly DriverFormField[] {
  return isEdit ? EDIT_REQUIRED_FIELDS : CREATE_REQUIRED_FIELDS;
}

export function countFilledRequiredDriverFields(
  form: DriverFormValidationState,
  isEdit: boolean
): number {
  return getRequiredDriverFields(isEdit).filter((field) => form[field].trim().length > 0).length;
}

export function isValidIsraeliNationalId(value: string | null | undefined): boolean {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!/^\d{9}$/.test(digits)) return false;

  const checksum = digits
    .split('')
    .map(Number)
    .reduce((sum, digit, index) => {
      const product = digit * (index % 2 === 0 ? 1 : 2);
      return sum + (product > 9 ? product - 9 : product);
    }, 0);

  return checksum % 10 === 0;
}

export function isFutureDateOnly(value: string | null | undefined): boolean {
  if (!value) return false;
  const target = parseDateValue(value);
  if (Number.isNaN(target.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  return target.getTime() > today.getTime();
}

export function formatDateDots(value: string | null | undefined): string {
  if (!value) return '';
  const date = parseDateValue(value);
  if (Number.isNaN(date.getTime())) return value;

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getFullYear()}`;
}

export function dateOnlyIsoFromLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function validateDriverForm(
  form: DriverFormValidationState,
  isEdit: boolean
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.full_name.trim()) errors.full_name = 'שדה חובה';
  if (!form.phone.trim()) errors.phone = 'שדה חובה';
  else if (!isValidIsraeliPhone(form.phone)) errors.phone = 'מספר טלפון לא תקין';

  if (!form.national_id.trim()) errors.national_id = 'שדה חובה';
  else if (!isValidIsraeliNationalId(form.national_id)) errors.national_id = 'תעודת זהות לא תקינה';

  if (!form.license_classes.trim()) errors.license_classes = 'שדה חובה';
  if (!form.license_expiry.trim()) errors.license_expiry = 'שדה חובה';
  else if (!isFutureDateOnly(form.license_expiry)) errors.license_expiry = 'תוקף הרישיון חייב להיות עתידי';

  if (!isEdit) {
    if (!form.email.trim()) errors.email = 'שדה חובה';
    else if (!isValidEmail(form.email)) errors.email = 'כתובת מייל לא תקינה';
    if (!form.password || form.password.length < 8) errors.password = 'לפחות 8 תווים';
  }

  return errors;
}
