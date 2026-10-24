// האם רכב חייב טכוגרף
import type { VehicleType } from './adminApi';

// משאיות ואוטובוסים חייבים טכוגרף
/**
 * The current fleet model distinguishes heavy goods vehicles and buses, but
 * does not store gross vehicle weight or a paid-passenger-service flag.
 * Until those fields exist, only these two unambiguous categories receive a
 * tachograph-expiry document requirement.
 */
export function requiresTachograph(vehicleType: VehicleType): boolean {
  return vehicleType === 'truck' || vehicleType === 'bus';
}

// תיקיית הטכוגרף ותוקף הבדיקה שלה
export const TACHOGRAPH_CATEGORY = 'tachograph_calibration';
const TACHOGRAPH_VALID_MONTHS = 12;

/** How many months a folder's document stays valid after its inspection date, or null when the date is typed by hand. */
export function inspectionValidityMonths(category: string): number | null {
  return category === TACHOGRAPH_CATEGORY ? TACHOGRAPH_VALID_MONTHS : null;
}

/** `YYYY-MM-DD` plus whole months; a day past the month's end (31 Jan + 1) lands on its last day. */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, last));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
}
