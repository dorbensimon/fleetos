import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * iOS "Liquid Glass" toggle. One translucent material only — the track —
 * per the rule that a light glass surface must never sit on another glass
 * surface (stacking blur-on-blur is what read as muddy/flat before). The
 * thumb is a solid glossy disc, exactly like the real iOS switch knob, so
 * it stays crisp against the frosted track. Color lives on the track's
 * solid fill (not the translucent foreground), and motion is a critically
 * damped spring — no bounce, this isn't a gesture the user threw.
 */

const TRACK_WIDTH = 51;
const TRACK_HEIGHT = 31;
const TRACK_RADIUS = TRACK_HEIGHT / 2;
const THUMB_SIZE = 27;
const PAD = 2;
const TRAVEL = TRACK_WIDTH - THUMB_SIZE - PAD * 2;

export function LiquidGlassSwitch({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
  tint = '#30D158',
  reduceMotion = false,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
  /** On-state tint, as a 6-digit hex. */
  tint?: string;
  /** Keeps the state legible without spring motion when requested. */
  reduceMotion?: boolean;
}) {
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.stopAnimation();
      progress.setValue(value ? 1 : 0);
      press.stopAnimation();
      press.setValue(1);
      return;
    }
    Animated.spring(progress, { toValue: value ? 1 : 0, useNativeDriver: false, stiffness: 300, damping: 32, mass: 1 }).start();
  }, [value, progress, press, reduceMotion]);

  const pressIn = () => {
    if (disabled || reduceMotion) return;
    Animated.spring(press, { toValue: 0.92, useNativeDriver: true, stiffness: 420, damping: 20 }).start();
  };
  const pressOut = () => {
    if (reduceMotion) return;
    Animated.spring(press, { toValue: 1, useNativeDriver: true, stiffness: 420, damping: 20 }).start();
  };

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] });
  const tintOpacity = progress;

  return (
    <Pressable
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      onPressIn={pressIn}
      onPressOut={pressOut}
      accessibilityRole="switch"
      accessibilityState={{ disabled: !!disabled, checked: value }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={disabled ? styles.disabled : undefined}
    >
      <Animated.View style={[styles.track, { transform: [{ scale: press }] }]}>
        {/* Single glass layer: blur + a faint base tint, so it always reads as material even before color loads in. */}
        <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={[StyleSheet.absoluteFill, styles.trackBase]} pointerEvents="none" />
        {/* Color lives on this solid fill, not on another translucent layer stacked over the blur. */}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: tintOpacity }]} pointerEvents="none" />
        <LinearGradient
          colors={['rgba(255,255,255,.35)', 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.6 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.trackHairline} pointerEvents="none" />

        <Animated.View style={[styles.thumbPositioner, { transform: [{ translateX }] }]} pointerEvents="none">
          <View style={styles.thumb}>
            <LinearGradient
              colors={['#FFFFFF', '#F1F1F3']}
              start={{ x: 0.3, y: 0 }}
              end={{ x: 0.7, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.thumbTopLight} pointerEvents="none" />
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.45 },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_RADIUS,
    padding: PAD,
    overflow: 'hidden',
  },
  trackBase: { backgroundColor: 'rgba(120,120,128,.24)' },
  trackHairline: {
    ...StyleSheet.absoluteFill,
    borderRadius: TRACK_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,.04)',
  },

  thumbPositioner: { width: THUMB_SIZE, height: THUMB_SIZE },
  thumb: {
    flex: 1,
    borderRadius: THUMB_SIZE / 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3.5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  thumbTopLight: {
    position: 'absolute',
    top: 0.5,
    left: 2,
    right: 2,
    height: THUMB_SIZE * 0.4,
    borderRadius: THUMB_SIZE * 0.4,
    backgroundColor: 'rgba(255,255,255,.55)',
  },
});
