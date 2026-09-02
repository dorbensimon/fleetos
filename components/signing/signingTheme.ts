/**
 * Design tokens for the "מסמכים לחתימה" (admin document-signing) screen.
 *
 * Deliberately separate from `lib/theme.ts` — per product decision this
 * screen follows the iOS-native glass spec in the design handoff (Assistant
 * font at 400/500/600/700, sky gradient, frosted-glass cards) rather than
 * the app-wide single-accent design system. Do not reuse these tokens
 * elsewhere.
 */

export const SG_COLORS = {
  skyTop: '#7FC4E8',
  sky2: '#A9D9F1',
  sky3: '#DCEEF8',
  sky4: '#F6FAFC',
  skyBottom: '#FFFFFF',

  accentLine: '#7FC4E8',
  deepSky: '#59AEDB',
  slateBlue: '#3E7EA0',
  lineArt: '#5E93B5',

  brand: '#0088CC',

  textPrimary: '#0E1E2B',
  textSecondary: 'rgba(14,30,43,0.68)',
  textTertiary: 'rgba(14,30,43,0.45)',
  textQuaternary: 'rgba(14,30,43,0.35)',

  statusSigned: '#3E9E6B',
  statusSignedBg: 'rgba(62,158,107,0.12)',
  statusPending: '#0088CC',
  statusPendingBg: 'rgba(0,136,204,0.12)',

  neutralFill: '#F0F5F8',
  hairline: 'rgba(14,30,43,0.12)',

  white: '#FFFFFF',
  overlay: 'rgba(14,40,60,0.3)',
} as const;

export const SG_FONT = {
  regular: 'Assistant_400Regular',
  medium: 'Assistant_500Medium',
  semiBold: 'Assistant_600SemiBold',
  bold: 'Assistant_700Bold',
} as const;

export const SG_TYPO = {
  screenTitle: { fontFamily: SG_FONT.semiBold, fontSize: 29, letterSpacing: -0.5 },
  sectionTitle: { fontFamily: SG_FONT.bold, fontSize: 26, letterSpacing: -0.5 },
  cardTitle: { fontFamily: SG_FONT.semiBold, fontSize: 23, letterSpacing: -0.3 },
  badge: { fontFamily: SG_FONT.bold, fontSize: 17 },
  listTitle: { fontFamily: SG_FONT.bold, fontSize: 16.5, letterSpacing: -0.2 },
  sheetButton: { fontFamily: SG_FONT.bold, fontSize: 16.5 },
  recipients: { fontFamily: SG_FONT.semiBold, fontSize: 14 },
  cardMeta: { fontFamily: SG_FONT.semiBold, fontSize: 13.5 },
  chip: { fontFamily: SG_FONT.bold, fontSize: 12.5 },
  sub: { fontFamily: SG_FONT.regular, fontSize: 12.5 },
  label: { fontFamily: SG_FONT.regular, fontSize: 11 },
  sheetTitle: { fontFamily: SG_FONT.bold, fontSize: 24, letterSpacing: -0.4 },
} as const;

export const SG_RADIUS = {
  dot: 5,
  chip: 9,
  button: 18,
  circle: 21,
  card: 22,
  cornerPanel: 26,
  sheetTop: 30,
} as const;

export const SG_SPACING = {
  pageH: 22,
} as const;

export const SG_SHADOW = {
  cardPrimary: {
    shadowColor: 'rgba(20,60,90,1)',
    shadowOpacity: 0.28,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 8,
  },
  cardSecondary: {
    shadowColor: 'rgba(20,60,90,1)',
    shadowOpacity: 0.2,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  badge: {
    shadowColor: 'rgba(20,60,90,1)',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  sheet: {
    shadowColor: 'rgba(14,40,60,1)',
    shadowOpacity: 0.2,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -10 },
    elevation: 10,
  },
  primaryButton: {
    shadowColor: 'rgba(89,174,219,1)',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;
