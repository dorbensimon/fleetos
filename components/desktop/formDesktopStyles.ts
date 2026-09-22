import { StyleSheet } from 'react-native';
import { DESKTOP_COLORS } from './desktopTheme';

/**
 * Layout shared by the desktop driver and vehicle forms
 * (DriverFormDesktopView, VehicleFormDesktopView). Each view spreads this
 * into its own StyleSheet and adds only what differs.
 */
export const formDesktopStyles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 24, paddingBottom: 48, maxWidth: 640, width: '100%', alignSelf: 'center' },
  heroRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, marginBottom: 22 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: DESKTOP_COLORS.brandFocusRing,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { gap: 2 },
  heroName: { fontSize: 17 },
  heroSub: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint },
  section: { marginBottom: 18, gap: 8 },
  sectionTitle: { fontSize: 12, letterSpacing: 0.4, color: DESKTOP_COLORS.inkMuted },
  card: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  footer: { alignItems: 'center', gap: 8, marginTop: 8 },
  cta: {
    height: 38,
    minWidth: 200,
    borderRadius: 7,
    backgroundColor: DESKTOP_COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  ctaDisabled: { backgroundColor: DESKTOP_COLORS.surfaceMuted, borderWidth: 1, borderColor: DESKTOP_COLORS.border },
  ctaText: { fontSize: 13, color: '#FFFFFF' },
  ctaTextDisabled: { color: DESKTOP_COLORS.inkFaint },
  remainingText: { fontSize: 12, color: DESKTOP_COLORS.inkFaint },
});
