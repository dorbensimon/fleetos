/**
 * Tolvex design tokens.
 *
 * These are the values fixed in the product spec — every admin screen
 * must use them rather than hard-coding colours or font sizes, so the
 * whole app stays visually consistent.
 *
 * Rules from the spec:
 *   - #0088CC is the ONLY accent colour.
 *   - Cards are white on a #E4E4E4 background, separated by a soft
 *     shadow (never a border).
 *   - No emoji in the UI — vector icons (Ionicons) only.
 */

export const COLORS = {
  // text
  text: '#1A1A1A',
  textMuted: '#666666',
  textFaint: '#979797',
  textInverse: '#FFFFFF',

  // surfaces
  screen: '#E4E4E4',
  card: '#FFFFFF',
  field: '#FAFAFA',

  // the single accent
  accent: '#0088CC',
  accentSoft: 'rgba(0, 136, 204, 0.10)',

  // hairlines (used sparingly — cards use shadow, not border)
  divider: '#ECECEC',
  fieldBorder: '#E2E2E2',

  // semantic status
  okBg: '#E9F1EC',
  okText: '#5C8A6E',
  warnBg: '#FDF3E2',
  warnText: '#A9720F',
  dangerBg: '#F8E7E5',
  dangerText: '#C0392B',
  neutralBg: '#EFEFEF',
  neutralText: '#666666',
} as const;

/** Card elevation, exactly as specified. */
export const CARD_SHADOW = {
  shadowColor: '#000000',
  shadowOpacity: 0.1,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 8 },
  elevation: 6,
} as const;

/** A lighter shadow for small inline surfaces (chips, list rows). */
export const SUBTLE_SHADOW = {
  shadowColor: '#000000',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
} as const;

export const FONT = {
  regular: 'Assistant_400Regular',
  bold: 'Assistant_700Bold',
} as const;

export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 18,
  pill: 999,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Text presets, so screens don't re-declare font/size/colour each time. */
export const TYPO = {
  screenTitle: { fontFamily: FONT.bold, fontSize: 23, color: COLORS.text },
  sectionTitle: { fontFamily: FONT.bold, fontSize: 16, color: COLORS.text },
  cardTitle: { fontFamily: FONT.bold, fontSize: 15.5, color: COLORS.text },
  body: { fontFamily: FONT.regular, fontSize: 14, color: COLORS.text },
  bodyMuted: { fontFamily: FONT.regular, fontSize: 13, color: COLORS.textMuted },
  label: { fontFamily: FONT.bold, fontSize: 12.5, color: COLORS.textMuted },
  caption: { fontFamily: FONT.regular, fontSize: 12, color: COLORS.textFaint },
  button: { fontFamily: FONT.bold, fontSize: 15, color: COLORS.textInverse },
} as const;

/**
 * Turns an expiry date into the badge shown across vehicle and driver
 * lists. `null` means the date was never filled in.
 *
 * expired  — already past
 * soon     — within 30 days
 * ok       — comfortably valid
 */
export type ExpiryState = 'ok' | 'soon' | 'expired' | 'missing';

export function expiryState(date: string | null | undefined): ExpiryState {
  if (!date) return 'missing';
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return 'missing';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return 'expired';
  if (days <= 30) return 'soon';
  return 'ok';
}

export const EXPIRY_STYLE: Record<ExpiryState, { bg: string; fg: string; label: string }> = {
  ok: { bg: COLORS.okBg, fg: COLORS.okText, label: 'בתוקף' },
  soon: { bg: COLORS.warnBg, fg: COLORS.warnText, label: 'קרוב' },
  expired: { bg: COLORS.dangerBg, fg: COLORS.dangerText, label: 'פג' },
  missing: { bg: COLORS.neutralBg, fg: COLORS.neutralText, label: 'חסר' },
};

/** Days remaining until an expiry date (negative once it's passed). `null` when the date is empty/invalid. */
export function daysUntilExpiry(date: string | null | undefined): number | null {
  if (!date) return null;
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Formats an ISO date as DD/MM/YYYY, or an em dash when empty. */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
