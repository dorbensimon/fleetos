/** A user's own real, permanent password (SetPasswordScreen). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * A temporary numeric password an admin gives someone else (driver/admin
 * creation, or an admin-initiated reset).
 */
export const MIN_TEMP_PASSWORD_LENGTH = 4;

export function isValidTemporaryPassword(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^\d{4,}$/.test(value);
}

/**
 * name@domain.tld — Latin letters only, no leading/trailing/double dots, a real
 * TLD. Not RFC-complete, but rejects gibberish and Hebrew. Keep in sync with
 * EMAIL_RE in supabase/functions/update-company-settings.
 */
export const EMAIL_RE = /^[A-Za-z0-9_%+-]+(\.[A-Za-z0-9_%+-]+)*@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function isValidEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  return EMAIL_RE.test(value.trim());
}
