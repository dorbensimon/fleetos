/**
 * Pure helpers shared by the fleet vehicle card and its stat cells
 * (insurance/test/service tone + progress-bar math). Split out of
 * FleetScreen.tsx so the logic is unit-testable without rendering.
 */

// Kept as literal hex/rgba (not imported from components/fleet/fleetTheme)
// so this file stays render-free and unit-testable on its own — see the
// module docstring. Mirrors the fleet-home severity palette exactly.
export const TONE_OK = '#34c759';
export const TONE_WARN = '#ff9f0a';
export const TONE_BAD = '#ff3b30';
export const TONE_NEUTRAL = 'rgba(11,12,16,.35)';

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
    return { label: badItems.length ? badItems.join(' · ') : 'דורש טיפול', bg: 'rgba(255,59,48,.14)', fg: TONE_BAD };
  }
  if (tone === TONE_WARN) return { label: 'מתקרב מועד', bg: 'rgba(255,159,10,.16)', fg: '#b26200' };
  if (tone === TONE_NEUTRAL) return { label: 'חסר נתונים', bg: 'rgba(11,12,16,.08)', fg: 'rgba(11,12,16,.6)' };
  return { label: 'תקין', bg: 'rgba(52,199,89,.14)', fg: '#1e8e3e' };
}
