import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../ui';
import DriversVehiclesToggle, { ToggleValue } from '../ui/DriversVehiclesToggle';
import { RADIUS } from '../../lib/theme';
import { FLEET_COLORS, FLEET_FONT, FLEET_SHADOWS } from './fleetTheme';

/**
 * Floating glass dock — always on screen (unlike `AdminBottomBar`, which
 * only appears once you've scrolled to the end of a list). Holds the
 * drivers/vehicles switch plus a contextual "+ new" FAB, per the mockup's
 * dock placement for the mode toggle.
 */
export function FleetDock({
  mode,
  onModeChange,
  actionLabel,
  onAction,
}: {
  mode: ToggleValue;
  onModeChange: (v: ToggleValue) => void;
  actionLabel: string;
  onAction: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 14 }]} pointerEvents="box-none">
      {/* FAB gets its own centered row above the toggle — it used to sit
          beside the toggle in a shared row, which squeezed it off to one
          side instead of floating centered at the bottom. */}
      <View style={styles.fabRow} pointerEvents="box-none">
        <TouchableOpacity activeOpacity={0.85} onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <LinearGradient
            colors={[FLEET_COLORS.primary, FLEET_COLORS.primaryDeep]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.fab}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <AppText weight="bold" style={styles.fabText}>
              {actionLabel}
            </AppText>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* DriversVehiclesToggle is already a fully-styled glass pill (its own
          blur, shadow, radius) with a 14px marginTop baked in for its usual
          spot under a search field — cancel that here since it's the first
          thing in this stack. */}
      <View style={styles.toggleWrap}>
        <DriversVehiclesToggle value={mode} onChange={onModeChange} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'column',
    gap: 12,
  },
  fabRow: { flexDirection: 'row', justifyContent: 'center' },
  toggleWrap: { marginTop: -14 },

  fab: {
    height: 54,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    ...FLEET_SHADOWS.fab,
  },
  fabText: { color: '#fff', fontSize: 12.5, fontFamily: FLEET_FONT.bold },
});
