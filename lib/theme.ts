/**
 * Tolvex design tokens.
 *
 * These are the values fixed in the product spec — every admin screen
 * must use them rather than hard-coding colours or font sizes, so the
 * whole app stays visually consistent.
 *
 * Rules from the spec:
 *   - #0075B3 is the ONLY accent colour (darkened from #0088CC for text contrast).
 *   - Cards are white on a #E4E4E4 background, separated by a soft
 *     shadow (never a border).
 *   - No emoji in the UI — vector icons (Ionicons) only.
 */

import { FLEET_COLORS } from './colors';

export const COLORS = {
  // text
  text: '#1A1A1A',
  textMuted: '#666666',
  textFaint: '#6B6B6B', // 4.7:1 on the screen background (WCAG AA); was #979797 (2.6:1)
  textInverse: '#FFFFFF',

  // surfaces
  screen: '#E4E4E4',
  card: '#FFFFFF',
  field: '#FAFAFA',

  // the single accent
  accent: '#0075B3', // 5.0:1 on white (WCAG AA); was #0088CC (3.9:1)
  accentSoft: 'rgba(0, 136, 204, 0.10)',

  // hairlines (used sparingly — cards use shadow, not border)
  divider: '#ECECEC',
  fieldBorder: '#E2E2E2',

  // semantic status — sourced from FLEET_COLORS' severity palette rather
  // than this file's own separate hex values, which used to mean the same
  // thing (e.g. "danger") with a different color from the fleet-home
  // screens. Token names stay the same so existing callers don't change.
  okBg: FLEET_COLORS.success.tint,
  okText: FLEET_COLORS.success.text,
  warnBg: FLEET_COLORS.warning.tint,
  warnText: FLEET_COLORS.warning.text,
  dangerBg: FLEET_COLORS.danger.tint,
  dangerText: FLEET_COLORS.danger.text,
  neutralBg: FLEET_COLORS.none.tint,
  neutralText: FLEET_COLORS.none.text,
} as const;

/**
 * Named values that already exist in screens (stage 1 of the frontend
 * unification — naming only, no visual change). Screens migrate to these
 * in stage 2 per the approved decisions.
 */
export const BRAND = {
  /** Hero / avatar gradient (light → deep blue). */
  heroGradient: ['#5CBBEE', '#0A7FD0'] as const,
  /** Admin screen background — also the end colour of the admin gradient halo. */
  screenBg: '#F1F4F7',
  /** Unified dark text for the newer admin screens. */
  ink: '#102A42',
  /** Unified secondary text. */
  inkSecondary: 'rgba(16,42,66,0.55)',
  /** Blue-tinted shadow colour used on signing / vehicle detail cards. */
  shadowInk: '#143C5A',
} as const;

/** iOS-style category tints for icon tiles (intentional variety). */
export const TINT = {
  indigo: '#5E5CE6',
  purple: '#AF52DE',
  teal: '#32ADE6',
  gray: '#8E8E93',
  orange: '#FF9500',
  green: '#34C759',
} as const;

/** Approved type scale (hero titles 26–34 stay as-is). */
export const FONT_SIZE = {
  xs: 11,
  sm: 12.5,
  md: 14,
  lg: 15.5,
  xl: 17,
  xxl: 20,
  title: 23,
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

/** Blue glow used under the accent-coloured CTA / selected chips — same colour as `COLORS.accent`. */
export const ACCENT_SHADOW = {
  shadowColor: COLORS.accent,
  shadowOpacity: 0.65,
  shadowRadius: 30,
  shadowOffset: { width: 0, height: 16 },
  elevation: 8,
} as const;

export const FONT = {
  regular: 'Assistant_400Regular',
  /** Loaded in App.tsx; for form labels/inputs that sit between regular and bold. */
  medium: 'Assistant_500Medium',
  semibold: 'Assistant_600SemiBold',
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

/**
 * Widest a screen's content is allowed to grow. The app is designed
 * mobile-first; on a desktop-width browser window we center the same
 * layout in this column instead of stretching it, so nothing on native
 * or on a phone-width browser is affected (their viewport never exceeds
 * this width).
 */
export const CONTENT_MAX_WIDTH = 640;

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
export type ExpiryState = 'ok' | 'soon' | 'expired' | 'missing' | 'optional';

/** Parses database date-only values without shifting them across time zones. */
export function parseDateValue(value: string): Date {
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12);
  }
  return new Date(value);
}

export function expiryState(date: string | null | undefined): ExpiryState {
  if (!date) return 'missing';
  const target = parseDateValue(date);
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
  optional: { bg: COLORS.accentSoft, fg: COLORS.accent, label: 'אופציונלי' },
};

/** Days remaining until an expiry date (negative once it's passed). `null` when the date is empty/invalid. */
export function daysUntilExpiry(date: string | null | undefined): number | null {
  if (!date) return null;
  const target = parseDateValue(date);
  if (Number.isNaN(target.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Time-of-day greeting word, computed from the device clock. */
export function timeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'בוקר טוב';
  if (hour >= 12 && hour < 18) return 'צהריים טובים';
  if (hour >= 18 && hour < 22) return 'ערב טוב';
  return 'לילה טוב';
}

/** Formats an ISO date as DD/MM/YYYY, or an em dash when empty. */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const d = parseDateValue(date);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Formats an ISO timestamp as DD/MM/YYYY HH:MM, or an em dash when empty. */
export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '—';
  const d = parseDateValue(date);
  if (Number.isNaN(d.getTime())) return '—';
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(date)} ${hh}:${min}`;
}
