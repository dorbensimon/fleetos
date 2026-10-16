// עזרים לכרטיסי רכב/נהג: צבעי מצב ופס התקדמות
/**
 * Pure helpers shared by the fleet vehicle card and its stat cells
 * (insurance/test/service tone + progress-bar math). Split out of
 * FleetScreen.tsx so the logic is unit-testable without rendering.
 */

// Kept as literal hex/rgba (not imported from lib/colors) so this file
// stays render-free and unit-testable on its own — see the module
// docstring. Mirrors FLEET_COLORS.success/warning/danger.fill exactly.
import { t } from './i18n';

// ירוק - תקין
export const TONE_OK = '#34c759';
// כתום - בקרוב
export const TONE_WARN = '#ff9f0a';
// אדום - פג
export const TONE_BAD = '#ff3b30';
// אפור - ניטרלי
export const TONE_NEUTRAL = 'rgba(11,12,16,.35)';

// ימים בשנה
export const YEAR_DAYS = 365;
// כמה ק"מ לפני טיפול מתחילים להזהיר
export const SERVICE_WARN_KM = 1000;

// צבע לפי כמה זמן נשאר
/** Same rule for every stat: green with runway left, yellow inside the warning window, red once overdue. */
export function remainingTone(remaining: number | null, warnAt: number): string {
  if (remaining == null) return TONE_NEUTRAL;
  if (remaining < 0) return TONE_BAD;
  return remaining <= warnAt ? TONE_WARN : TONE_OK;
}

// כמה הפס מלא לפי כמה זמן נשאר
/**
 * The line grows from empty toward full as the deadline approaches — green
 * while there's runway left, still growing (now yellow) once inside the
 * warning window, and a full red line once the deadline has passed.
 */
export function remainingRatio(remaining: number | null, total: number): number {
  if (remaining == null) return 0.06;
  return Math.max(0, Math.min(1, 1 - remaining / total));
}

// הצבע הכי חמור מתוך כמה
export function worstTone(tones: string[]): string {
  if (tones.includes(TONE_BAD)) return TONE_BAD;
  if (tones.includes(TONE_WARN)) return TONE_WARN;
  if (tones.every((entry) => entry === TONE_NEUTRAL)) return TONE_NEUTRAL;
  return TONE_OK;
}

// תגית מצב (טקסט וצבעים)
export function chipFor(tone: string, badItems: string[] = []): { label: string; bg: string; fg: string } {
  if (tone === TONE_BAD) {
    return { label: badItems.length ? badItems.join(' · ') : t('status.needsAttention'), bg: 'rgba(255,59,48,.14)', fg: TONE_BAD };
  }
  if (tone === TONE_WARN) return { label: t('fleet.status.dueSoon'), bg: 'rgba(255,159,10,.16)', fg: '#b26200' };
  if (tone === TONE_NEUTRAL) return { label: t('fleet.status.missingData'), bg: 'rgba(11,12,16,.08)', fg: 'rgba(11,12,16,.6)' };
  return { label: t('status.ok'), bg: 'rgba(52,199,89,.14)', fg: '#1e8e3e' };
}
