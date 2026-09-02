/**
 * Design tokens for the new "כרטיס נהג" (Driver Card) screen.
 *
 * Deliberately separate from `lib/theme.ts` — per product decision this
 * screen follows the iOS-native spec in `DriverCard-spec.md` (Heebo,
 * multi-tint palette, iOS grouped-list styling) rather than the app-wide
 * single-accent design system. Do not reuse these tokens elsewhere.
 */

export const DC_COLORS = {
  bg: '#F2F2F7',
  surface: '#FFFFFF',
  label: '#000000',
  labelSecondary: 'rgba(60,60,67,0.6)',
  labelTertiary: 'rgba(60,60,67,0.5)',
  separator: 'rgba(60,60,67,0.16)',
  chevron: '#C7C7CC',
  blue: '#007AFF',
  blueDeep: '#0060DF',
  blueLight: '#0A84FF',
  green: '#34C759',
  orange: '#FF9500',
  red: '#FF3B30',
  purple: '#AF52DE',
  teal: '#30B0C7',
  indigo: '#5856D6',
  gray: '#8E8E93',
  fill: 'rgba(120,120,128,0.12)',
} as const;

export type DriverCardTint = keyof Pick<
  typeof DC_COLORS,
  'blue' | 'green' | 'orange' | 'red' | 'purple' | 'teal' | 'indigo' | 'gray'
>;

export const DC_FONT = {
  extraBold: 'Heebo_800ExtraBold',
  bold: 'Heebo_700Bold',
  semiBold: 'Heebo_600SemiBold',
  medium: 'Heebo_500Medium',
  regular: 'Heebo_400Regular',
} as const;

export const DC_TYPO = {
  largeTitle: { fontFamily: DC_FONT.extraBold, fontSize: 32, letterSpacing: -0.8 },
  navTitle: { fontFamily: DC_FONT.semiBold, fontSize: 16, letterSpacing: -0.3 },
  navBackLink: { fontFamily: DC_FONT.regular, fontSize: 17, letterSpacing: -0.3 },
  heroName: { fontFamily: DC_FONT.bold, fontSize: 22, letterSpacing: -0.4 },
  heroSubtitle: { fontFamily: DC_FONT.medium, fontSize: 14, letterSpacing: 0 },
  groupTitle: { fontFamily: DC_FONT.semiBold, fontSize: 12.5, letterSpacing: 0.2 },
  rowLabel: { fontFamily: DC_FONT.regular, fontSize: 16, letterSpacing: -0.2 },
  rowValue: { fontFamily: DC_FONT.medium, fontSize: 16, letterSpacing: -0.2 },
  badge: { fontFamily: DC_FONT.regular, fontSize: 13.5, letterSpacing: -0.1 },
  badgeWarn: { fontFamily: DC_FONT.semiBold, fontSize: 13.5, letterSpacing: -0.1 },
  quickActionLabel: { fontFamily: DC_FONT.semiBold, fontSize: 12.5, letterSpacing: -0.1 },
  destructive: { fontFamily: DC_FONT.medium, fontSize: 16, letterSpacing: -0.2 },
  destructiveBold: { fontFamily: DC_FONT.bold, fontSize: 16, letterSpacing: -0.2 },
  footer: { fontFamily: DC_FONT.regular, fontSize: 12.5, letterSpacing: 0 },
} as const;

export const DC_SPACING = {
  screenPaddingH: 16,
  groupRadius: 12,
  quickActionRadius: 14,
  rowMinHeight: 52,
  rowPaddingH: 14,
  iconTextGap: 12,
  iconSquare: 30,
  iconRadius: 8,
  avatarSize: 78,
  avatarRadius: 39,
  groupGap: 26,
  listBottomPadding: 34,
} as const;

export const DC_BADGE_TONE = {
  muted: { color: DC_COLORS.labelTertiary, fontWeight: '400' as const },
  warn: { color: DC_COLORS.orange, fontWeight: '600' as const },
  bad: { color: DC_COLORS.red, fontWeight: '600' as const },
};

export type DriverCardBadgeTone = keyof typeof DC_BADGE_TONE;
