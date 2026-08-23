/**
 * Formats an Israeli phone number for display/typing as 0XX-XXXXXXX
 * (mobile, e.g. 052-7898655) or 0X-XXXXXXX (landline). Strips whatever
 * the value already contains and reapplies dashes for the digit count.
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '').slice(0, 10);

  if (digits.length <= 3) return digits;

  const mobilePrefix = /^0(5[0-9]|7[0-9])/.test(digits);
  const splitAt = mobilePrefix ? 3 : 2;
  return `${digits.slice(0, splitAt)}-${digits.slice(splitAt)}`;
}

/** Validates a Long Israeli mobile/landline number (9-10 digits, starting with 0). */
export function isValidIsraeliPhone(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const digits = raw.replace(/\D/g, '');
  return /^0([23489]|5[0-9]|7[0-9])\d{6,7}$/.test(digits);
}
