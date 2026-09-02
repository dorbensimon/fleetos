import React from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '../ui';
import { RADIUS, SPACING } from '../../lib/theme';
import { FLEET_COLORS, FLEET_FONT } from './fleetTheme';

/**
 * Same layout as the shared `FilterChips` (ui/index.tsx), but recolored
 * to the fleet-home palette — kept as its own component rather than
 * restyling the shared one, so other admin screens that still use the
 * original chip look aren't affected.
 */
export function FleetFilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number; icon?: React.ComponentProps<typeof Ionicons>['name'] }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scrollFlip}
    >
      <View style={styles.rowFlip}>
        {options.map((opt) => {
          const active = opt.value === value;
          const empty = opt.count === 0 && !active;

          const content = (
            <View style={styles.chip}>
              {opt.icon && (
                <Ionicons name={opt.icon} size={15} color={active ? '#fff' : empty ? FLEET_COLORS.textDisabled : FLEET_COLORS.textSecondary} />
              )}
              <AppText weight="bold" numberOfLines={1} style={[styles.text, active && styles.textActive, empty && styles.textEmpty]}>
                {opt.label}
              </AppText>
              {opt.count !== undefined && (
                <View style={[styles.badge, active && styles.badgeActive]}>
                  <AppText weight="bold" style={[styles.badgeText, active && styles.badgeTextActive, empty && styles.textEmpty]}>
                    {opt.count}
                  </AppText>
                </View>
              )}
            </View>
          );

          return (
            <TouchableOpacity key={opt.value} activeOpacity={0.8} disabled={empty} onPress={() => onChange(opt.value)}>
              {active ? (
                <LinearGradient colors={[FLEET_COLORS.primary, FLEET_COLORS.primaryDeep]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.pill}>
                  {content}
                </LinearGradient>
              ) : (
                <View style={[styles.pill, empty ? styles.pillDisabled : styles.pillInactive]}>{content}</View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollFlip: { transform: [{ scaleX: -1 }] },
  rowFlip: { transform: [{ scaleX: -1 }], flexDirection: 'row-reverse', gap: 11 },
  // Matches the cards' own `marginHorizontal: SPACING.lg` (DriverCard/VehicleCard)
  // so the first chip lines up with the card edge instead of sitting flush
  // against the screen edge.
  row: { paddingVertical: 2, paddingHorizontal: SPACING.lg },

  pill: { borderRadius: RADIUS.pill },
  pillInactive: { backgroundColor: 'rgba(255,255,255,.6)' },
  pillDisabled: { backgroundColor: 'rgba(255,255,255,.5)' },

  chip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
    height: 40,
    paddingRight: 14,
    paddingLeft: 11,
  },

  text: { fontSize: 13.5, color: FLEET_COLORS.textSecondary, fontFamily: FLEET_FONT.bold },
  textActive: { color: '#fff' },
  textEmpty: { color: FLEET_COLORS.textDisabled },

  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(11,12,16,.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeActive: { backgroundColor: 'rgba(255,255,255,.25)' },
  badgeText: { fontSize: 11, color: FLEET_COLORS.textSecondary, fontFamily: FLEET_FONT.bold },
  badgeTextActive: { color: '#fff' },
});
