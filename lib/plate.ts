/**
 * Formats an Israeli licence plate for display. Strips whatever the value
 * already contains (digits, dashes, spaces) and reapplies the canonical
 * dash grouping for the digit count, so it doesn't matter whether the
 * underlying value was typed with dashes, without them, or came from
 * older data entered before this formatting existed.
 */
export function formatPlate(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');

  if (digits.length === 8) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  if (digits.length === 7) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  if (digits.length === 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length === 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;

  return digits || raw;
}
