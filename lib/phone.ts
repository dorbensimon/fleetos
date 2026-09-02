import { Linking } from 'react-native';

/**
 * Formats an Israeli phone number for display/typing as 05X-XXXXXXX
 * (e.g. 052-7898655) or 0X-XXXXXXX for landlines. Separators are stripped
 * before formatting so the result is stable regardless of the input format.
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '').slice(0, 10);

  const mobile = /^0[57]/.test(digits);
  const prefixLength = mobile || digits.length >= 10 ? 3 : 2;
  if (digits.length <= prefixLength) return digits;
  return `${digits.slice(0, prefixLength)}-${digits.slice(prefixLength)}`;
}

/** Validates a Long Israeli mobile/landline number (9-10 digits, starting with 0). */
export function isValidIsraeliPhone(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const digits = raw.replace(/\D/g, '');
  return /^0([23489]|5[0-9]|7[0-9])\d{6,7}$/.test(digits);
}

/** Opens the system dialer for a phone number, stripping everything but digits and a leading +. */
export function dialPhone(raw: string | null | undefined): void {
  if (!raw) return;
  Linking.openURL(`tel:${raw.replace(/[^\d+]/g, '')}`);
}
