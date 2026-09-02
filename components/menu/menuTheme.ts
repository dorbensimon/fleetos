/**
 * Design tokens for the full-screen menu (screens/MenuScreen.tsx), pulled
 * directly from the pasted "מסך תפריט" spec. Deliberately its own palette
 * rather than lib/theme.ts's COLORS — the spec calls for an Airbnb-style
 * blue accent distinct from the app's usual #0088CC.
 */

export const MENU_COLORS = {
  background: '#FFFFFF',
  accent: '#1A73E8',
  accentDark: '#0B57D0',
  badgeBg: '#EAF1FE',
  rowHover: '#FAFAFA',
  text: '#222222',
  textMuted: '#717171',
  cardBorder: '#EBEBEB',
  divider: '#F0F0F0',
  dangerText: '#E01E3C',
  dangerHoverBg: '#FFF6F7',
  chevron: '#B0B0B0',
  backBtnBg: '#F7F7F7',
  backBtnBorder: 'rgba(0,0,0,0.08)',
} as const;

export const MENU_CARD_SHADOW = {
  shadowColor: '#000000',
  shadowOpacity: 0.04,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

export const MENU_FONT = {
  extraBold: 'Heebo_800ExtraBold',
  bold: 'Heebo_700Bold',
  medium: 'Heebo_500Medium',
  regular: 'Heebo_400Regular',
} as const;

export const MENU_TYPO = {
  title: { fontFamily: MENU_FONT.extraBold, fontSize: 34, letterSpacing: -0.5, color: MENU_COLORS.text },
  profileName: { fontFamily: MENU_FONT.bold, fontSize: 17, color: MENU_COLORS.text },
  profileSubtitle: { fontFamily: MENU_FONT.regular, fontSize: 13.5, color: MENU_COLORS.textMuted },
  row: { fontFamily: MENU_FONT.medium, fontSize: 16, color: MENU_COLORS.text },
  badge: { fontFamily: MENU_FONT.bold, fontSize: 12, color: MENU_COLORS.accentDark },
  version: { fontFamily: MENU_FONT.medium, fontSize: 13, color: MENU_COLORS.textMuted },
} as const;
