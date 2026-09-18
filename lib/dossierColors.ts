/**
 * The "driver dossier" world's own blue/ink pair — used on the back/edit
 * buttons and hero icon of every screen opened from a driver's dossier
 * (VehicleDetailScreen, DriverDetailScreen, DriverDocumentsScreen,
 * DriverDossierHero, NavBarCollapsing, ui/index.tsx's appBackButton).
 * Distinct from `DC_COLORS.blue` in `driverCardTheme.ts` (deliberately
 * separate, off-limits) — these were raw hex repeated across every one of
 * those files with no shared source, so this is the source now.
 */
export const DOSSIER_BLUE = '#0A7FD0';
export const DOSSIER_BLUE_LIGHT = '#3FA9E8';
export const DOSSIER_INK = '#0E1E2B';
