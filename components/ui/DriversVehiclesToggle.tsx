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
 * Styled after a glossy metal pill (ref: Uiverse.io by FColombati),
 * adapted for what React Native can actually do — no stacked inset
 * shadows, no clip-path, no mix-blend-mode. The "pressed into the
 * page" read comes from flipping where light and shadow sit:
 *
 *   raised (inactive): light gradient, outer drop shadow, bright edge
 *                       top-left, dark edge bottom-right — a bump
 *                       catching light from the top-left.
 *   sunken (active):   darker gradient, no outer shadow, dark edge
 *                       top-left, bright edge bottom-right (reversed —
 *                       the rim blocks light from the near wall, the
 *                       far wall catches the bounce), plus two thin
 *                       edge gradients (dark top strip, light bottom
 *                       strip) to sell the pit.
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
      style={[styles.btn, active ? styles.btnSunken : styles.btnRaised]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={active ? ['#AFAFAF', '#8C8C8C'] : ['#F5F5F5', '#DADADA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {active ? (
        <>
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']}
            style={styles.edgeTop}
          />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0)', 'rgba(255,255,255,0.55)']}
            style={styles.edgeBottom}
          />
          <View style={styles.borderSunken} pointerEvents="none" />
        </>
      ) : (
        <View style={styles.borderRaised} pointerEvents="none" />
      )}

      {icon(active ? '#2A2A2A' : '#6B6B6B')}
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
  btnRaised: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowOffset: { width: 2, height: 3 },
        shadowRadius: 5,
      },
      android: { elevation: 4 },
    }),
  },
  btnSunken: {
    // no outer shadow at all — that absence is what reads as "flush / pushed in"
  },
  borderRaised: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: PILL,
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.9)',
    borderLeftColor: 'rgba(255,255,255,0.9)',
    borderRightColor: 'rgba(0,0,0,0.12)',
    borderBottomColor: 'rgba(0,0,0,0.12)',
  },
  borderSunken: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: PILL,
    borderWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.3)',
    borderLeftColor: 'rgba(0,0,0,0.3)',
    borderRightColor: 'rgba(255,255,255,0.5)',
    borderBottomColor: 'rgba(255,255,255,0.5)',
  },
  edgeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 14 },
  edgeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 14 },
  label: {
    fontFamily: FONT.regular,
    fontSize: 14,
    color: '#6B6B6B',
    writingDirection: 'rtl',
  },
  labelActive: {
    fontFamily: FONT.bold,
    fontSize: 14,
    color: '#2A2A2A',
    writingDirection: 'rtl',
  },
});
