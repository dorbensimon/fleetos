/**
 * Israeli licence plate formatting.
 *
 * The registrar's grouping depends on how many digits the plate has:
 *   7 digits → 12-345-67   (2-3-2, private cars until 2017)
 *   8 digits → 123-45-678  (3-2-3, everything issued since)
 *
 * Shorter inputs are grouped as they type toward the 7-digit shape, so
 * the field never jumps around while a number is being entered.
 */

const MAX_DIGITS = 8;

export function plateDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, MAX_DIGITS);
}

export function formatPlate(value: string): string {
  const d = plateDigits(value);

  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
  if (d.length <= 7) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/**
 * Search helper: lets "1234567" find "12-345-67", and vice versa, so the
 * hyphens are a display concern rather than something to type exactly.
 */
export function plateMatches(plate: string, query: string): boolean {
  const q = plateDigits(query);
  if (!q) return false;
  return plateDigits(plate).includes(q);
}
