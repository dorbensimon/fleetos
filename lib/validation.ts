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

/** Basic email format check — good enough to catch typos, not RFC-complete. */
export function isValidEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
