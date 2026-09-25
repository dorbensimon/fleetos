import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DKText, useReducedMotion } from '../driverKit';

/** A real checkbox: its whole row is the target, and it says checked/unchecked to screen readers. */
export function ConsentCheck({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const reduce = useReducedMotion();
  const fill = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: value ? 1 : 0, duration: reduce ? 0 : 160, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [value, reduce, fill]);
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      // react-native-web reads the aria-* props, not accessibilityState.
      aria-checked={value}
      accessibilityLabel={label}
      style={(state) => [styles.check, (state as { focused?: boolean }).focused && styles.focusRing]}
    >
      <View style={[styles.box, value && styles.boxOn]}>
        <Animated.View style={{ opacity: fill, transform: [{ scale: fill.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
          <Ionicons name="checkmark" size={18} color="#FFFFFF" />
        </Animated.View>
      </View>
      <DKText variant="label" color={DK.ink} style={styles.flex}>
        {label}
      </DKText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  check: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, minHeight: 64, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16 },
  focusRing: Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 2, outlineColor: DK.accent, outlineOffset: -2 } as object, default: {} }) as object,
  box: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: DK.muted,
    backgroundColor: DK.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: DK.accent, borderColor: DK.accent },
});
