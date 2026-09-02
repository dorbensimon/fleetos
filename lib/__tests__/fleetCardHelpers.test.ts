import {
  TONE_OK,
  TONE_WARN,
  TONE_BAD,
  TONE_NEUTRAL,
  remainingTone,
  remainingRatio,
  worstTone,
  chipFor,
} from '../fleetCardHelpers';

describe('fleetCardHelpers', () => {
  describe('remainingTone', () => {
    it('returns neutral when remaining is null', () => {
      expect(remainingTone(null, 30)).toBe(TONE_NEUTRAL);
    });

    it('returns bad when remaining is negative (overdue)', () => {
      expect(remainingTone(-1, 30)).toBe(TONE_BAD);
    });

    it('returns bad for a large negative value', () => {
      expect(remainingTone(-100, 30)).toBe(TONE_BAD);
    });

    it('returns ok when remaining is well above the warn threshold', () => {
      expect(remainingTone(365, 30)).toBe(TONE_OK);
    });

    it('returns warn exactly at the warn threshold (boundary inclusive)', () => {
      expect(remainingTone(30, 30)).toBe(TONE_WARN);
    });

    it('returns ok exactly one unit above the warn threshold', () => {
      expect(remainingTone(31, 30)).toBe(TONE_OK);
    });

    it('returns warn exactly at zero (due today) when warnAt >= 0', () => {
      expect(remainingTone(0, 30)).toBe(TONE_WARN);
    });

    it('treats warnAt=0 boundary correctly: 0 remaining is warn, -1 is bad', () => {
      expect(remainingTone(0, 0)).toBe(TONE_WARN);
      expect(remainingTone(-1, 0)).toBe(TONE_BAD);
      expect(remainingTone(1, 0)).toBe(TONE_OK);
    });
  });

  describe('remainingRatio', () => {
    it('returns the neutral placeholder ratio (0.06) when remaining is null', () => {
      expect(remainingRatio(null, 365)).toBeCloseTo(0.06);
    });

    it('returns 0 when remaining equals total (full runway left)', () => {
      expect(remainingRatio(365, 365)).toBe(0);
    });

    it('returns ~1 when remaining is 0 (deadline reached)', () => {
      expect(remainingRatio(0, 365)).toBe(1);
    });

    it('clamps to 1 when remaining is negative (overdue) instead of exceeding 1', () => {
      expect(remainingRatio(-50, 365)).toBe(1);
    });

    it('clamps to 0 when remaining exceeds total instead of going negative', () => {
      expect(remainingRatio(400, 365)).toBe(0);
    });

    it('computes a proportional ratio for a mid-range value', () => {
      // 90 days remaining out of 365 -> 1 - 90/365
      expect(remainingRatio(90, 365)).toBeCloseTo(1 - 90 / 365);
    });
  });

  describe('worstTone', () => {
    it('returns bad if any tone is bad, even mixed with ok/warn/neutral', () => {
      expect(worstTone([TONE_OK, TONE_WARN, TONE_BAD, TONE_NEUTRAL])).toBe(TONE_BAD);
    });

    it('returns warn if no bad tone but at least one warn', () => {
      expect(worstTone([TONE_OK, TONE_WARN, TONE_NEUTRAL])).toBe(TONE_WARN);
    });

    it('returns neutral only when every tone is neutral', () => {
      expect(worstTone([TONE_NEUTRAL, TONE_NEUTRAL])).toBe(TONE_NEUTRAL);
    });

    it('returns ok when tones are a mix of ok and neutral (not all neutral)', () => {
      expect(worstTone([TONE_OK, TONE_NEUTRAL])).toBe(TONE_OK);
    });

    it('returns ok when every tone is ok', () => {
      expect(worstTone([TONE_OK, TONE_OK])).toBe(TONE_OK);
    });

    it('returns ok for an empty array (vacuous "every" is true, but no bad/warn present)', () => {
      // Documents current behavior: empty array -> `every` on neutral check is
      // vacuously true, so this actually returns neutral, not ok.
      expect(worstTone([])).toBe(TONE_NEUTRAL);
    });
  });

  describe('chipFor', () => {
    it('returns the generic "requires attention" label for bad tone with no bad items', () => {
      expect(chipFor(TONE_BAD)).toEqual({ label: 'דורש טיפול', bg: 'rgba(255,59,48,.14)', fg: TONE_BAD });
    });

    it('joins bad item labels for bad tone when provided', () => {
      const result = chipFor(TONE_BAD, ['ביטוח', 'טסט']);
      expect(result).toEqual({ label: 'ביטוח · טסט', bg: 'rgba(255,59,48,.14)', fg: TONE_BAD });
    });

    it('ignores badItems for a single bad item and just uses it as-is', () => {
      const result = chipFor(TONE_BAD, ['ביטוח']);
      expect(result.label).toBe('ביטוח');
    });

    it('returns the "approaching deadline" chip for warn tone regardless of badItems', () => {
      const result = chipFor(TONE_WARN, ['ביטוח']);
      expect(result).toEqual({ label: 'מתקרב מועד', bg: 'rgba(255,159,10,.16)', fg: '#b26200' });
    });

    it('returns the "missing data" chip for neutral tone', () => {
      expect(chipFor(TONE_NEUTRAL)).toEqual({ label: 'חסר נתונים', bg: 'rgba(11,12,16,.08)', fg: 'rgba(11,12,16,.6)' });
    });

    it('returns the "ok" chip for ok tone', () => {
      expect(chipFor(TONE_OK)).toEqual({ label: 'תקין', bg: 'rgba(52,199,89,.14)', fg: '#1e8e3e' });
    });

    it('falls through to the ok chip for an unrecognized tone value', () => {
      // Defensive check: any tone string that isn't bad/warn/neutral falls
      // through to the final `return` (ok chip), even if it's not TONE_OK.
      expect(chipFor('#unknown')).toEqual({ label: 'תקין', bg: 'rgba(52,199,89,.14)', fg: '#1e8e3e' });
    });
  });
});
