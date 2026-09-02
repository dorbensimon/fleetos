/**
 * Fleet Home color system — scoped to the admin fleet screen (hero, dock,
 * cards, chips) per `FleetOS Admin Home.dc.html` and its bell/colors spec.
 * Deliberately NOT merged into `lib/theme.ts`: the rest of the admin app
 * (detail screens, forms, menu) keeps its existing muted Tolvex palette,
 * same split as `components/owner/ownerTheme.ts` for the owner persona.
 */

export const FLEET_COLORS = {
  // brand blue — the hero gradient
  primary: '#0a84ff',
  primaryDeep: '#0a3fa8',
  primaryInk: '#08245e',
  primaryLight: '#37a1ff', // bell circle gradient start

  // neutrals — the white sheet
  screenBg: '#eef2f7',
  sheetFrom: '#f2f5f9',
  sheetTo: '#e7ecf3',
  chipsBarBg: '#f2f5f9',
  card: '#fff',
  textPrimary: '#0b0c10',
  textSecondary: 'rgba(11,12,16,.5)',
  textSecondarySmall: 'rgba(11,12,16,.58)', // for text under 12px, per contrast note
  textDisabled: 'rgba(11,12,16,.4)',
  divider: 'rgba(11,12,16,.07)',
  trackBg: 'rgba(11,12,16,.09)',

  // severity — fill (progress) / text (numbers, badges) / tint (badge bg)
  success: { fill: '#34c759', text: '#1e8e3e', tint: 'rgba(52,199,89,.14)' },
  warning: { fill: '#ff9f0a', text: '#b26200', tint: 'rgba(255,159,10,.16)' },
  danger: { fill: '#ff3b30', text: '#d70015', tint: 'rgba(255,59,48,.14)' },
  none: { fill: 'rgba(11,12,16,.25)', text: 'rgba(11,12,16,.6)', tint: 'rgba(11,12,16,.08)' },
  info: { text: '#0060df', tint: 'rgba(10,132,255,.14)' },

  statusActiveDot: '#5ef08a',
  statusDisabledDot: '#ff6b61',

  // glass levels
  heroGlassBg: 'rgba(255,255,255,.20)',
  heroGlassBorder: 'rgba(255,255,255,.38)',
  dockGlassBg: 'rgba(255,255,255,.62)',
  dockGlassBorder: 'rgba(255,255,255,.88)',

  // license plate
  plateBlue: '#1a4fd6',
  plateYellow: '#f7d117',
} as const;

export const FLEET_SHADOWS = {
  card: {
    shadowColor: '#08245e',
    shadowOpacity: 0.3,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  dock: {
    shadowColor: '#08245e',
    shadowOpacity: 0.32,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  bell: {
    shadowColor: '#08245e',
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  fab: {
    shadowColor: '#0a3fa8',
    shadowOpacity: 0.65,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  sheet: {
    shadowColor: '#08245e',
    shadowOpacity: 0.32,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: -12 },
    elevation: 6,
  },
} as const;

// Heebo (400–800) is already loaded app-wide in App.tsx, alongside the
// Assistant weights the rest of the admin app uses via `AppText`'s
// default. Applied here as a style override on individual `AppText`
// elements — not by changing `AppText` itself — so this stays scoped to
// the fleet-home screen instead of re-fonting the whole app.
export const FLEET_FONT = {
  regular: 'Heebo_500Medium',
  bold: 'Heebo_700Bold',
  black: 'Heebo_800ExtraBold',
} as const;

export function severityFor(state: 'ok' | 'soon' | 'expired' | 'missing' | 'optional') {
  if (state === 'expired') return FLEET_COLORS.danger;
  if (state === 'soon') return FLEET_COLORS.warning;
  if (state === 'ok' || state === 'optional') return FLEET_COLORS.success;
  return FLEET_COLORS.none;
}
