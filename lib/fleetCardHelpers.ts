/**
 * Pure helpers shared by the fleet vehicle card and its stat cells
 * (insurance/test/service tone + progress-bar math). Split out of
 * FleetScreen.tsx so the logic is unit-testable without rendering.
 */

export const TONE_OK = '#1DBF73';
export const TONE_WARN = '#F5A623';
export const TONE_BAD = '#E5484D';
export const TONE_NEUTRAL = '#979797';

export const YEAR_DAYS = 365;
export const SERVICE_WARN_KM = 1000;

/** Same rule for every stat: green with runway left, yellow inside the warning window, red once overdue. */
export function remainingTone(remaining: number | null, warnAt: number): string {
  if (remaining == null) return TONE_NEUTRAL;
  if (remaining < 0) return TONE_BAD;
  return remaining <= warnAt ? TONE_WARN : TONE_OK;
}

/**
 * The line grows from empty toward full as the deadline approaches — green
 * while there's runway left, still growing (now yellow) once inside the
 * warning window, and a full red line once the deadline has passed.
 */
export function remainingRatio(remaining: number | null, total: number): number {
  if (remaining == null) return 0.06;
  return Math.max(0, Math.min(1, 1 - remaining / total));
}

export function worstTone(tones: string[]): string {
  if (tones.includes(TONE_BAD)) return TONE_BAD;
  if (tones.includes(TONE_WARN)) return TONE_WARN;
  if (tones.every((t) => t === TONE_NEUTRAL)) return TONE_NEUTRAL;
  return TONE_OK;
}

export function chipFor(tone: string, badItems: string[] = []): { label: string; bg: string; fg: string } {
  if (tone === TONE_BAD) {
    return { label: badItems.length ? badItems.join(' · ') : 'דורש טיפול', bg: '#FDECEC', fg: TONE_BAD };
  }
  if (tone === TONE_WARN) return { label: 'מתקרב מועד', bg: '#FFF6E5', fg: '#B9720A' };
  if (tone === TONE_NEUTRAL) return { label: 'חסר נתונים', bg: '#F2F2F2', fg: TONE_NEUTRAL };
  return { label: 'תקין', bg: '#EAF8F1', fg: '#118653' };
}
