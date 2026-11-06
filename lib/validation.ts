// בדיקות תקינות: סיסמה ומייל
// אורך מינימלי לסיסמה קבועה
/** A user's own real, permanent password (SetPasswordScreen). */
export const MIN_PASSWORD_LENGTH = 8;

// אורך מינימלי לסיסמה זמנית
/**
 * A temporary password an admin gives someone else (driver/admin creation,
 * or an admin-initiated reset). Supabase Auth rejects short or leaked
 * passwords, so it is 8+ characters of anything but whitespace — use
 * generateTemporaryPassword() for one that always passes.
 * Keep in sync with supabase/functions/_shared/accountSecurity.ts.
 */
export const MIN_TEMP_PASSWORD_LENGTH = 8;

// בודק סיסמה זמנית
export function isValidTemporaryPassword(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.length >= MIN_TEMP_PASSWORD_LENGTH && value.length <= 72 && !/\s/.test(value);
}

// יוצר סיסמה זמנית אקראית
/** 10 characters, letters and digits, without look-alikes (0/O, 1/l/I). */
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export function generateTemporaryPassword(length = 10): string {
  const values = new Uint32Array(length);
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(values);
  else for (let i = 0; i < length; i++) values[i] = Math.floor(Math.random() * 2 ** 32);
  let out = '';
  for (let i = 0; i < length; i++) out += TEMP_PASSWORD_ALPHABET[values[i] % TEMP_PASSWORD_ALPHABET.length];
  // Always mix letters and digits so it reads as a password, not a code.
  if (!/\d/.test(out) || !/[A-Za-z]/.test(out)) return generateTemporaryPassword(length);
  return out;
}

// תבנית לבדיקת מייל
/**
 * name@domain.tld — Latin letters only, no leading/trailing/double dots, a real
 * TLD. Not RFC-complete, but rejects gibberish and Hebrew. Keep in sync with
 * EMAIL_RE in supabase/functions/update-company-settings.
 */
export const EMAIL_RE = /^[A-Za-z0-9_%+-]+(\.[A-Za-z0-9_%+-]+)*@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

// בודק כתובת מייל
export function isValidEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  return EMAIL_RE.test(value.trim());
}
