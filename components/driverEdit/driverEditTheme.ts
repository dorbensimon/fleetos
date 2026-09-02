/**
 * Design tokens for the "עריכת נהג" (Edit Driver) screen's Liquid Glass
 * redesign — per EDIT_DRIVER_SPEC.md, since extended (product decision)
 * to carry a light accent wash: the app's single brand accent on editable
 * rows/the save button, a real status color, and a real expiry-badge
 * color, layered onto the neutral ink/glass base. Deliberately separate
 * from `lib/theme.ts` (different type scale) and from `driverCardTheme.ts`
 * (different screen, different visual language). Do not reuse these
 * tokens elsewhere.
 */

export const DE_COLORS = {
  ink: '#111014',
  ink70: 'rgba(17,16,20,0.62)',
  ink50: 'rgba(17,16,20,0.50)',
  ink40: 'rgba(17,16,20,0.40)',
  ink30: 'rgba(17,16,20,0.30)',
  hairline: 'rgba(17,16,20,0.08)',
  rowTint: 'rgba(17,16,20,0.035)',
  rowTintHover: 'rgba(17,16,20,0.07)',
  glassCardBg: 'rgba(255,255,255,0.60)',
  glassNavBg: 'rgba(255,255,255,0.55)',
  glassSheetBg: 'rgba(255,255,255,0.78)',
  glassBorder: 'rgba(255,255,255,0.90)',
  screenTop: '#fbfbfc',
  screenMid: '#f4f4f6',
  screenBottom: '#eeeef1',
  scrim: 'rgba(20,18,40,0.28)',
  toastBg: 'rgba(28,27,32,0.92)',

  // Brand accent (same blue as the rest of the app, lib/theme COLORS.accent)
  // — used only for the three editable rows and the save button, so color
  // keeps meaning "you can touch this" instead of decorating everything.
  accent: '#0088CC',
  accentTint: 'rgba(0,136,204,0.09)',
  accentTintHover: 'rgba(0,136,204,0.16)',

  statusActiveDot: '#34C759',
  statusActiveBg: 'rgba(52,199,89,0.14)',
  statusActiveText: '#1E8E3E',
  statusInactiveDot: 'rgba(17,16,20,0.4)',
  statusInactiveBg: 'rgba(17,16,20,0.06)',
  statusInactiveText: 'rgba(17,16,20,0.5)',

  avatarBlueLight: '#0A84FF',
  avatarBlueDeep: '#0060DF',

  // Very light per-card washes, layered under the blur so each group reads
  // apart at a glance without breaking the glass surface.
  washBlueTop: 'rgba(0,136,204,0.10)',
  washIndigoTop: 'rgba(88,86,214,0.10)',
  washTransparent: 'rgba(255,255,255,0)',
} as const;

export const DE_FONT = {
  bold: 'Heebo_700Bold',
  semiBold: 'Heebo_600SemiBold',
  medium: 'Heebo_500Medium',
  regular: 'Heebo_400Regular',
} as const;

export const DE_TYPO = {
  cardTitle: { fontFamily: DE_FONT.bold, fontSize: 19 },
  navTitle: { fontFamily: DE_FONT.semiBold, fontSize: 17 },
  navSubtitle: { fontFamily: DE_FONT.regular, fontSize: 11.5 },
  rowLabel: { fontFamily: DE_FONT.medium, fontSize: 15 },
  rowValue: { fontFamily: DE_FONT.regular, fontSize: 15 },
  caption: { fontFamily: DE_FONT.regular, fontSize: 12.5 },
  pill: { fontFamily: DE_FONT.semiBold, fontSize: 10.5 },
  button: { fontFamily: DE_FONT.semiBold, fontSize: 16 },
  sheetTitle: { fontFamily: DE_FONT.bold, fontSize: 17 },
  sheetOption: { fontFamily: DE_FONT.medium, fontSize: 15.5 },
} as const;

export const DE_RADIUS = {
  card: 30,
  nav: 26,
  sheet: 34,
  row: 18,
  button: 26,
  pillMin: 9,
  pillMax: 14,
} as const;

export const DE_CARD_SHADOW = {
  shadowColor: 'rgba(30,26,60,0.35)',
  shadowOpacity: 0.09,
  shadowOffset: { width: 0, height: 10 },
  shadowRadius: 30,
  elevation: 8,
} as const;
