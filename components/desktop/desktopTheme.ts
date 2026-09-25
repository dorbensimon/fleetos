import { Platform, TextStyle, ViewStyle } from 'react-native';

/**
 * Desktop web design language ("Fleet Desktop" handoff): a dark sidebar,
 * a white top bar and dense, bordered tables on a light grey canvas. Only
 * used above DESKTOP_MIN_WIDTH on web — the phone layout keeps its own
 * fleet/driverCard themes untouched.
 */

export const DESKTOP_COLORS = {
  canvas: '#F4F6F8',
  surface: '#FFFFFF',
  surfaceMuted: '#F7F9FA',
  border: '#E1E6EA',
  borderSoft: '#EDF0F2',
  borderInput: '#D8DEE3',
  ink: '#16222E',
  inkMuted: '#5C6773',
  inkFaint: '#65717D', // 4.6:1 on the canvas; was #8B98A4 (2.7:1)
  brand: '#0075B3', // 5.0:1 on white (WCAG AA); was #0088CC (3.9:1)
  brandHover: '#00649A',
  brandFocusRing: 'rgba(0,136,204,0.14)',
  rowHover: '#F7F9FA',
  overlay: 'rgba(16,34,50,0.32)',

  sidebarBg: '#191F28',
  sidebarDivider: 'rgba(255,255,255,0.08)',
  sidebarTitle: '#FFFFFF',
  sidebarText: '#9AA5B0',
  sidebarTextStrong: '#EDF1F4',
  sidebarSection: '#7C8896',
  sidebarMeta: '#7C8896',
  sidebarActiveBg: 'rgba(0,136,204,0.18)',
  sidebarActiveText: '#5FC1F0',
  sidebarHoverBg: 'rgba(255,255,255,0.05)',

  danger: '#D92D20', // error text and badges: 4.8:1; was #FF453A (3.4:1)
} as const;

export type DesktopTone = 'ok' | 'warn' | 'bad' | 'neutral';

export const DESKTOP_TONES: Record<DesktopTone, { bg: string; fg: string }> = {
  ok: { bg: 'rgba(52,199,89,0.13)', fg: '#187F3E' },
  warn: { bg: 'rgba(255,149,0,0.14)', fg: '#985700' },
  bad: { bg: 'rgba(255,69,58,0.13)', fg: '#C4201A' },
  neutral: { bg: 'rgba(142,142,147,0.16)', fg: '#5C6773' },
};

export const DESKTOP_AVATAR_COLORS = ['#0088CC', '#5856D6', '#FF9500', '#34C759', '#FF453A', '#5AC8FA'];

export const DESKTOP_FONT = {
  regular: 'Heebo_400Regular',
  medium: 'Heebo_500Medium',
  semiBold: 'Heebo_600SemiBold',
  bold: 'Heebo_700Bold',
  extraBold: 'Heebo_800ExtraBold',
} as const;

export const DESKTOP_SIDEBAR_WIDTH = 232;
export const DESKTOP_HEADER_HEIGHT = 48;

/** Web-only style keys (cursor, outline) that React Native's types don't know about. */
export const webOnly = (style: Record<string, unknown>): ViewStyle & TextStyle =>
  (Platform.OS === 'web' ? style : {}) as ViewStyle & TextStyle;
