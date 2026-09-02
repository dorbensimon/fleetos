import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DriversVehiclesToggle, { ToggleValue } from '../ui/DriversVehiclesToggle';
import { FLEET_COLORS } from './fleetTheme';

// Dock content height, used both to size the fog behind it and to tell
// the scrollable lists how much bottom padding they need to clear it.
const TOGGLE_HEIGHT = 54;
const DOCK_BOTTOM_GAP = 14; // matches the `bottom: insets.bottom + 14` offset below
// Fade zone above the toggle — without it the gradient is too compressed and
// reads as a hard edge instead of a fog the cards sink into.
const FOG_ABOVE = 76;

/** Space a scrolling list must reserve (on top of its own safe-area inset) so its last card clears the fog + dock instead of being cut off behind it. */
export const FLEET_DOCK_CLEARANCE = FOG_ABOVE + TOGGLE_HEIGHT + DOCK_BOTTOM_GAP;

// Single source of truth for the color the fog must fade into — it has to
// match the sheet's own bottom color (`FLEET_COLORS.sheetTo`), not the
// screen background behind it, or a visible seam appears at dock height
// once the sheet has scrolled up past this point.
const SHEET_BOTTOM = FLEET_COLORS.sheetTo;
const SHEET_BOTTOM_RGB = '231,236,243'; // rgb() of SHEET_BOTTOM, for the fade-in stops below

/**
 * Floating glass dock — always on screen (unlike `AdminBottomBar`, which
 * only appears once you've scrolled to the end of a list). Holds the
 * drivers/vehicles switch. The "+ new" action used to float here too, but
 * now lives as the last row of each list instead (see `FleetAddButton`),
 * so this dock is just the toggle.
 *
 * A soft fog sits behind it, fading from transparent into `SHEET_BOTTOM`
 * (not the plain screen background) — that's what the sheet reveals once
 * it's scrolled up past dock height, so matching it here is what keeps a
 * gray seam from appearing behind the toggle, and lets the last list card
 * sink into the fog instead of getting cut off behind the dock.
 */
export function FleetDock({ mode, onModeChange }: { mode: ToggleValue; onModeChange: (v: ToggleValue) => void }) {
  const insets = useSafeAreaInsets();
  const fogHeight = FOG_ABOVE + TOGGLE_HEIGHT + insets.bottom + DOCK_BOTTOM_GAP;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <LinearGradient
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        colors={[
          `rgba(${SHEET_BOTTOM_RGB},0)`,
          `rgba(${SHEET_BOTTOM_RGB},.35)`,
          `rgba(${SHEET_BOTTOM_RGB},.78)`,
          SHEET_BOTTOM,
          SHEET_BOTTOM,
        ]}
        locations={[0, 0.22, 0.42, 0.62, 1]}
        style={[styles.fog, { height: fogHeight }]}
      />

      <View style={[styles.wrap, { bottom: insets.bottom + DOCK_BOTTOM_GAP }]}>
        {/* DriversVehiclesToggle has its own 14px marginTop baked in for its
            usual spot under a search field — cancel that here since it's
            the only thing in this stack. */}
        <View style={styles.toggleWrap}>
          <DriversVehiclesToggle value={mode} onChange={onModeChange} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  fog: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  wrap: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  toggleWrap: { marginTop: -14 },
});
