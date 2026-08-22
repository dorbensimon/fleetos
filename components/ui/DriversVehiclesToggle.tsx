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
 * Styled after a glossy dark pill button (ref: Uiverse.io by
 * FColombati) — but React Native has no clip-path, no stacked inset
 * shadows, no mix-blend-mode, so this is an achievable approximation:
 * a solid black pill with one soft top highlight gradient and a real
 * drop shadow for the selected option, plain white for the other.
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
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.gloss}
        />
      )}
      {icon(active ? '#FFFFFF' : '#8A8A8A')}
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
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#0D0D0D',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 14,
      },
      android: { elevation: 8 },
    }),
  },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '58%' },
  label: {
    fontFamily: FONT.regular,
    fontSize: 14,
    color: '#8A8A8A',
    writingDirection: 'rtl',
  },
  labelActive: {
    fontFamily: FONT.bold,
    fontSize: 14,
    color: '#FFFFFF',
    writingDirection: 'rtl',
  },
});
