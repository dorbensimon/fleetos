import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '../ui';
import { RADIUS } from '../../lib/theme';
import { FLEET_COLORS, FLEET_FONT, FLEET_SHADOWS } from '../../lib/colors';

const FADE_IN_MS = 160;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * "+ new driver" / "+ new vehicle" row — last item in each fleet list
 * (used to float in `FleetDock` instead). It fades in quickly on mount so
 * it doesn't just pop in as the list settles, and presses with the same
 * spring scale used by every other button on this screen.
 */
export function FleetAddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [label, opacity]);

  const pressIn = () => Animated.spring(press, { toValue: 0.96, useNativeDriver: true, stiffness: 400, damping: 24 }).start();
  const pressOut = () => Animated.spring(press, { toValue: 1, useNativeDriver: true, stiffness: 400, damping: 24 }).start();

  return (
    <Animated.View style={[styles.row, { opacity }]}>
      <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} accessibilityRole="button" accessibilityLabel={label}>
        <Animated.View style={{ transform: [{ scale: press }] }}>
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
        </Animated.View>
      </Pressable>
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
