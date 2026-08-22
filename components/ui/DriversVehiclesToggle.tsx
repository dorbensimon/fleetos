import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONT } from '../../lib/theme';

/**
 * The drivers/vehicles switch under each admin header. Each option is a
 * separate stack screen, not tab content, so this is used "controlled"
 * — `value` reflects whichever screen mounted it, and `onChange` fires
 * navigation rather than local state.
 *
 * The selected pill is one flat accent colour — no gradient. The
 * "pressed into the page" read comes from two things only: a soft
 * shadow ring sitting *around* the pill (shadowOffset 0,0 spreads the
 * shadow evenly on iOS instead of favouring one side), and a thin dark
 * shade along its own left/right inner edges — the centre stays flat
 * and uniform.
 */

export type ToggleValue = 'drivers' | 'vehicles';

type Props = {
  value?: ToggleValue;
  onChange?: (v: ToggleValue) => void;
};

export default function DriversVehiclesToggle({ value = 'drivers', onChange }: Props) {
  return (
    <View style={styles.row}>
      <ToggleButton
        label="נהגים"
        active={value === 'drivers'}
        onPress={() => onChange?.('drivers')}
        icon={(color) => <Feather name="users" size={15} color={color} />}
      />
      <ToggleButton
        label="רכבים"
        active={value === 'vehicles'}
        onPress={() => onChange?.('vehicles')}
        icon={(color) => <MaterialCommunityIcons name="car-outline" size={17} color={color} />}
      />
    </View>
  );
}

function ToggleButton({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon: (color: string) => React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.btn, active ? styles.btnActive : styles.btnInactive]}
    >
      {active && (
        <>
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0.22)', 'rgba(0,0,0,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.sideLeft}
          />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.22)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.sideRight}
          />
        </>
      )}

      {icon(active ? COLORS.textInverse : '#4A4A4A')}
      <Text style={active ? styles.labelActive : styles.label}>{label}</Text>
    </Pressable>
  );
}

const PILL = 24;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 12,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: PILL,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    overflow: 'hidden',
  },
  btnInactive: {
    backgroundColor: COLORS.card,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  btnActive: {
    backgroundColor: COLORS.accent,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  sideLeft: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 16 },
  sideRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: 16 },
  label: {
    fontFamily: FONT.regular,
    fontSize: 14,
    color: '#4A4A4A',
    writingDirection: 'rtl',
  },
  labelActive: {
    fontFamily: FONT.bold,
    fontSize: 14,
    color: COLORS.textInverse,
    writingDirection: 'rtl',
  },
});
