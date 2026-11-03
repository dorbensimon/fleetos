// תוקף של מסמך שהנהג מעלה מקישור (driver-quick-link)
// A renewed document's new expiry: from today up to 20 years ahead.
const MAX_EXPIRY_YEARS = 20;

// תאריך תוקף תקין: יום אמיתי, מהיום ועד 20 שנה קדימה
export function validExpiry(value: unknown, today = new Date().toISOString().slice(0, 10)): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value) return null;
  const max = `${Number(today.slice(0, 4)) + MAX_EXPIRY_YEARS}${today.slice(4)}`;
  return value >= today && value <= max ? value : null;
}
