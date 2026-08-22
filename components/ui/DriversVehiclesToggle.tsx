import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FONT } from '../../lib/theme';

/**
 * The drivers/vehicles switch under each admin header. Each option is a
 * separate stack screen, not tab content, so this is used "controlled"
 * — `value` reflects whichever screen mounted it, and `onChange` fires
 * navigation rather than local state.
 *
 * Neumorphic soft-UI buttons (ref: Uiverse.io by ke1221): the selected
 * one stays permanently in the "pressed in" state rather than only on
 * touch — that's how it shows which one is active. React Native can't
 * do a real inset box-shadow, so the pressed look is faked with a
 * diagonal gradient overlay (dark corner where the shadow would sit,
 * light corner opposite) instead of an outward shadow.
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
      style={[styles.btn, active ? styles.btnActive : styles.btnRaised]}
    >
      {active && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.14)', 'rgba(255,255,255,0.55)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.pressedOverlay}
        />
      )}
      {icon(active ? '#090909' : '#666666')}
      <Text style={active ? styles.labelActive : styles.label}>{label}</Text>
    </Pressable>
  );
}

const RADIUS = 12;

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
    borderRadius: RADIUS,
    backgroundColor: '#E8E8E8',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    overflow: 'hidden',
  },
  btnRaised: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.16,
        shadowOffset: { width: 4, height: 4 },
        shadowRadius: 7,
      },
      android: { elevation: 5 },
    }),
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.85)',
    borderLeftColor: 'rgba(255,255,255,0.85)',
    borderRightColor: 'rgba(0,0,0,0.04)',
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  btnActive: {
    // no outward shadow — this is what reads as "pressed in"
  },
  pressedOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: RADIUS },
  label: {
    fontFamily: FONT.regular,
    fontSize: 14.5,
    color: '#666666',
    writingDirection: 'rtl',
  },
  labelActive: {
    fontFamily: FONT.bold,
    fontSize: 14.5,
    color: '#090909',
    writingDirection: 'rtl',
  },
});
