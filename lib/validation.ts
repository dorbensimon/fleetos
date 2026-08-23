/** Israeli phone numbers: mobile (05X-XXXXXXX), landline (0X-XXXXXXX) or VOIP (07X-XXXXXXX). */
const ISRAELI_PHONE_REGEX = /^0(5\d{8}|7\d{8}|[23489]\d{7})$/;

export function phoneDigits(value: string): string {
  return value
    .trim()
    .replace(/[\s-]/g, '')
    .replace(/^\+972/, '0')
    .replace(/^972/, '0')
    .replace(/\D/g, '')
    .slice(0, 10);
}

export function isValidIsraeliPhone(value: string): boolean {
  return ISRAELI_PHONE_REGEX.test(phoneDigits(value));
}

/**
 * Live-formats a phone number with the standard hyphen as the user
 * types: a 3-digit prefix for mobile (05X) and VOIP (07X) numbers, a
 * 2-digit prefix for landlines (single-digit area codes).
 */
export function formatIsraeliPhone(value: string): string {
  const d = phoneDigits(value);
  const prefixLen = /^0[57]/.test(d) ? 3 : 2;
  if (d.length <= prefixLen) return d;
  return `${d.slice(0, prefixLen)}-${d.slice(prefixLen)}`;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}
