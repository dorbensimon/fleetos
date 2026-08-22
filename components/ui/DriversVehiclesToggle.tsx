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
 * Inactive pill: raised metal look (light diagonal gradient, bright
 * top-left / dark bottom-right border, outer drop shadow) — untouched
 * since it was already right, only the label got darker.
 *
 * Active pill: one flat accent colour, no gradient — "pressed into the
 * page" comes from a shadow ring around the whole pill (shadowOffset
 * 0,0 spreads it evenly) plus a thin dark shade along its own left/
 * right inner edges only, so the centre stays flat and uniform.
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
  if (active) {
    // Outer view carries the glow shadow (must NOT clip, so no overflow:hidden
    // here) — the inner view is the rounded, clipped black pill itself.
    return (
      <Pressable onPress={onPress} style={styles.btnActiveOuter}>
        <View style={styles.btnActiveInner}>
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
          {icon(COLORS.textInverse)}
          <Text style={styles.labelActive}>{label}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} style={[styles.btn, styles.btnRaised]}>
      <LinearGradient
        pointerEvents="none"
        colors={['#F5F5F5', '#DADADA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.borderRaised} pointerEvents="none" />
      {icon('#6B6B6B')}
      <Text style={styles.label}>{label}</Text>
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
        shadowOffset: { width: 1, height: 1 },
        shadowRadius: 5,
      },
      android: { elevation: 4 },
    }),
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
  btnActiveOuter: {
    flex: 1,
    height: 48,
    borderRadius: PILL,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.55,
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 9,
      },
      android: { elevation: 8 },
    }),
  },
  btnActiveInner: {
    flex: 1,
    borderRadius: PILL,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    overflow: 'hidden',
  },
  sideLeft: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 16 },
  sideRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: 16 },
  label: {
    fontFamily: FONT.regular,
    fontSize: 14,
    color: '#3A3A3A',
    writingDirection: 'rtl',
  },
  labelActive: {
    fontFamily: FONT.bold,
    fontSize: 14,
    color: COLORS.textInverse,
    writingDirection: 'rtl',
  },
});
