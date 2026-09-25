import { Platform, type ViewStyle } from 'react-native';
import { daysUntilExpiry, expiryState, type ExpiryState } from '../../lib/theme';

/**
 * The icar phone kit's design tokens — the brand carried into every screen
 * on the phone, the driver's and the manager's alike (the desktop keeps its
 * own look in components/desktop).
 *
 * Night hero on top (the brand ink with blue/cyan light), a calm, cool-grey
 * canvas below, white surfaces, and colour reserved for meaning: blue for
 * action, the status family for validity. Greys are all tinted toward the
 * brand ink so nothing reads warm next to the blue.
 */
export const DK = {
  night: ['#12306E', '#0B1C45', '#0A1626'] as const,
  nightInk: '#0A1626',
  glowBlue: '#2F5BFF',
  glowCyan: '#19C6F0',
  mint: '#2EE6A8',

  canvas: '#F1F4F9',
  surface: '#FFFFFF',
  surfaceSunk: '#F6F8FB',

  ink: '#0A1626',
  inkSoft: '#2B3A4F',
  muted: '#56657A', // 5.6:1 on white
  faint: '#8593A6', // decorative / non-essential only
  hairline: 'rgba(10,22,38,0.08)',

  accent: '#2F5BFF',
  accentPress: '#244AE0',
  accentSoft: '#EAF0FF',

  onNight: '#FFFFFF',
  onNightMuted: 'rgba(255,255,255,0.72)',
  onNightFaint: 'rgba(255,255,255,0.5)',
  glass: 'rgba(255,255,255,0.12)',
  glassBorder: 'rgba(255,255,255,0.22)',
} as const;

export const DK_RADIUS = { card: 28, inner: 18, chip: 12, pill: 999 } as const;

export const DK_SPACE = { xs: 6, sm: 10, md: 16, lg: 20, xl: 28 } as const;

/** Heebo for display and numbers (geometric, like the wordmark), Assistant for reading. */
export const DK_FONT = {
  display: 'Heebo_800ExtraBold',
  title: 'Heebo_700Bold',
  numeric: 'Heebo_600SemiBold',
  regular: 'Assistant_400Regular',
  medium: 'Assistant_500Medium',
  semibold: 'Assistant_600SemiBold',
  bold: 'Assistant_700Bold',
} as const;

/** One light source, above: shadows are tinted with the brand ink, never black. */
export const DK_SHADOW: ViewStyle = Platform.select<ViewStyle>({
  web: { boxShadow: '0 1px 2px rgba(10,22,38,0.04), 0 12px 32px rgba(10,22,38,0.07)' } as ViewStyle,
  default: {
    shadowColor: DK.nightInk,
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
}) as ViewStyle;

export type Status = 'ok' | 'soon' | 'expired' | 'missing';

/** Status colours: `fg` is text-safe on white and on `soft`; `fill` is for bars and dots. */
export const STATUS: Record<Status, { fg: string; fill: string; soft: string; label: string; icon: 'checkmark-circle' | 'time' | 'alert-circle' | 'help-circle' }> = {
  ok: { fg: '#0B7D57', fill: '#22C48A', soft: '#E4F7EF', label: 'בתוקף', icon: 'checkmark-circle' },
  soon: { fg: '#9A5300', fill: '#FFAE1A', soft: '#FFF3DB', label: 'מתקרב', icon: 'time' },
  expired: { fg: '#C21F37', fill: '#FF4D5E', soft: '#FFE8EB', label: 'פג תוקף', icon: 'alert-circle' },
  missing: { fg: '#56657A', fill: '#C9D2DE', soft: '#EEF1F6', label: 'חסר', icon: 'help-circle' },
};

export function statusOf(state: ExpiryState): Status {
  return state === 'expired' ? 'expired' : state === 'soon' ? 'soon' : state === 'ok' ? 'ok' : 'missing';
}

export function statusOfDate(date: string | null | undefined): Status {
  return statusOf(expiryState(date));
}

/**
 * How much validity is left, as a bar length: a full year or more reads as
 * full, the last days drain it. Expired and missing keep a short sliver so
 * the bar is still visibly there.
 */
export function validityProgress(date: string | null | undefined): number {
  const days = daysUntilExpiry(date);
  if (days == null) return 0.06;
  if (days <= 0) return 0.06;
  return Math.max(0.08, Math.min(1, days / 365));
}

/** "בעוד 12 ימים" / "היום" / "לפני 3 ימים" — plain words next to the date. */
export function relativeDays(date: string | null | undefined): string | null {
  const days = daysUntilExpiry(date);
  if (days == null) return null;
  if (days === 0) return 'היום';
  if (days === 1) return 'מחר';
  if (days === -1) return 'אתמול';
  if (days > 0) return `בעוד ${days.toLocaleString('he-IL')} ימים`;
  return `לפני ${Math.abs(days).toLocaleString('he-IL')} ימים`;
}
