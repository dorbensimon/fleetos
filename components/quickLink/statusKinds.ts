// מצבי הסיום של דף הקישור לנהג: צבע וסמל לכל מצב
export type QuickLinkStatusKind = 'done' | 'used' | 'expired' | 'closed' | 'invalid' | 'offline' | 'error' | 'wait';

const GREEN = '#34C759';
const BLUE = '#2F5BFF';
const AMBER = '#F59E0B';
const GRAY = '#8B98A4';
const RED = '#FF3B30';
const CLOCK = 'M60 34 V60 L77 70';

/** Each status: its color and the symbol drawn inside the ring (one SVG path, viewBox 0 0 120 120). */
export const QUICK_LINK_STATUS: Record<QuickLinkStatusKind, { color: string; glyph: string }> = {
  done: { color: GREEN, glyph: 'M38 62 l15 15 l30 -32' },
  used: { color: BLUE, glyph: 'M38 62 l15 15 l30 -32' },
  expired: { color: AMBER, glyph: CLOCK },
  wait: { color: AMBER, glyph: CLOCK },
  closed: { color: GRAY, glyph: 'M47 56 V47 a13 13 0 0 1 26 0 V56 M41 56 H79 V82 H41 Z' },
  invalid: { color: RED, glyph: 'M45 45 L75 75 M75 45 L45 75' },
  offline: { color: GRAY, glyph: 'M32 56 Q60 30 88 56 M43 67 Q60 53 77 67 M58 79 h4 M38 38 L82 82' },
  error: { color: RED, glyph: 'M60 36 V66 M60 80 V81' },
};

/** Server codes that end the page; any other failure stays on the form as a message. */
export function statusFromCode(code: string | undefined): QuickLinkStatusKind | null {
  switch (code) {
    case 'used': case 'expired': case 'closed': case 'invalid': case 'wait': return code;
    case 'network': return 'offline';
    case 'server': return 'error';
    default: return null;
  }
}
