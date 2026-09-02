import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { RADIUS, SPACING } from '../../lib/theme';
import { FLEET_COLORS, FLEET_SHADOWS } from './fleetTheme';

const BONE_COLOR = FLEET_COLORS.divider;

function Bone({ style }: { style: any }) {
  return <View style={[styles.bone, style]} />;
}

/** Pulses every bone in the tree together, so a whole skeleton list breathes as one. */
function usePulse() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.4, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return opacity;
}

function DriverCardSkeleton() {
  return (
    <View style={styles.driverCard}>
      <Bone style={styles.driverAvatar} />
      <View style={styles.driverTextWrap}>
        <Bone style={{ width: '55%', height: 14 }} />
        <Bone style={{ width: '35%', height: 11, marginTop: 6 }} />
        <Bone style={{ width: '45%', height: 11, marginTop: 5 }} />
        <Bone style={{ width: '60%', height: 11, marginTop: 5 }} />
      </View>
      <Bone style={styles.driverCallBtn} />
    </View>
  );
}

function VehicleCardSkeleton() {
  return (
    <View style={styles.vehicleCard}>
      <View style={styles.vehicleTop}>
        <Bone style={styles.vehiclePlate} />
        <View style={styles.driverTextWrap}>
          <Bone style={{ width: '50%', height: 14 }} />
          <Bone style={{ width: '70%', height: 11, marginTop: 6 }} />
        </View>
      </View>
      <View style={styles.vehicleStatsRow}>
        <Bone style={styles.vehicleStatCell} />
        <Bone style={styles.vehicleStatCell} />
        <Bone style={styles.vehicleStatCell} />
      </View>
    </View>
  );
}

export function DriverListSkeleton({ count = 5 }: { count?: number }) {
  const opacity = usePulse();
  return (
    <Animated.View style={[styles.list, { opacity }]}>
      {Array.from({ length: count }).map((_, i) => (
        <DriverCardSkeleton key={i} />
      ))}
    </Animated.View>
  );
}

export function VehicleListSkeleton({ count = 5 }: { count?: number }) {
  const opacity = usePulse();
  return (
    <Animated.View style={[styles.list, { opacity }]}>
      {Array.from({ length: count }).map((_, i) => (
        <VehicleCardSkeleton key={i} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: SPACING.md, gap: SPACING.md },

  bone: { backgroundColor: BONE_COLOR, borderRadius: 5 },

  driverCard: {
    backgroundColor: FLEET_COLORS.card,
    borderRadius: 30,
    padding: SPACING.md,
    marginHorizontal: SPACING.lg,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
    ...FLEET_SHADOWS.card,
  },
  driverAvatar: { width: 42, height: 42, borderRadius: 12 },
  driverTextWrap: { flex: 1 },
  driverCallBtn: { width: 44, height: 44, borderRadius: 22 },

  vehicleCard: {
    backgroundColor: FLEET_COLORS.card,
    borderRadius: 30,
    marginHorizontal: SPACING.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
    ...FLEET_SHADOWS.card,
  },
  vehicleTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.md },
  vehiclePlate: { width: 74, height: 26, borderRadius: 6 },
  vehicleStatsRow: { flexDirection: 'row-reverse', gap: SPACING.sm },
  vehicleStatCell: { flex: 1, height: 46, borderRadius: RADIUS.sm },
});
