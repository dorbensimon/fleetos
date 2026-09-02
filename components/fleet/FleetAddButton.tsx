import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '../ui';
import { RADIUS } from '../../lib/theme';
import { FLEET_COLORS, FLEET_FONT, FLEET_SHADOWS } from './fleetTheme';

const FADE_IN_MS = 160;

/**
 * "+ new driver" / "+ new vehicle" row — last item in each fleet list
 * (used to float in `FleetDock` instead). It fades in quickly on mount so
 * it doesn't just pop in as the list settles.
 */
export function FleetAddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: true }).start();
  }, [label, opacity]);

  return (
    <Animated.View style={[styles.row, { opacity }]}>
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
        <LinearGradient
          colors={[FLEET_COLORS.primary, FLEET_COLORS.primaryDeep]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.btn}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <AppText weight="bold" style={styles.text}>
            {label}
          </AppText>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', paddingTop: 4 },
  btn: {
    height: 54,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    ...FLEET_SHADOWS.fab,
  },
  text: { color: '#fff', fontSize: 12.5, fontFamily: FLEET_FONT.bold },
});
