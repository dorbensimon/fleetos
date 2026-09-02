import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { FONT } from '../../lib/theme';

/**
 * The drivers/vehicles switch under each admin header. Each option is a
 * separate stack screen, not tab content, so this is used "controlled"
 * — `value` reflects whichever screen mounted it, and `onChange` fires
 * navigation rather than local state.
 *
 * iOS-glass segmented control: a blurred pill track holds two static
 * labels, and a sliding black thumb underneath them carries the depth
 * (three stacked shadow layers, since RN can't put more than one shadow
 * on a single View — each layer is its own nested, unclipped wrapper
 * around the actual clipped, gradient-filled pill).
 */

export type ToggleValue = 'drivers' | 'vehicles';

type Props = {
  value?: ToggleValue;
  onChange?: (v: ToggleValue) => void;
};

const TRACK_HEIGHT = 54;
const TRACK_RADIUS = 27;
const TRACK_PAD = 4;
const THUMB_RADIUS = TRACK_RADIUS - TRACK_PAD;

export default function DriversVehiclesToggle({ value = 'drivers', onChange }: Props) {
  const [segmentWidth, setSegmentWidth] = useState(0);

  // 0 = drivers (right, since row-reverse puts the first child there), 1 = vehicles.
  const slide = useRef(new Animated.Value(value === 'drivers' ? 0 : 1)).current;
  const press = useRef(new Animated.Value(1)).current;
  // 0 = resting, 1 = mid-flight — drives the squash/stretch "liquid glass" wobble,
  // same idea as the elastic pull on the notifications on/off switch.
  const stretch = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: value === 'drivers' ? 0 : 1,
      useNativeDriver: true,
      stiffness: 300,
      damping: 26,
      mass: 0.9,
    }).start();

    stretch.setValue(0);
    Animated.sequence([
      Animated.timing(stretch, { toValue: 1, duration: 110, useNativeDriver: true }),
      Animated.spring(stretch, { toValue: 0, useNativeDriver: true, stiffness: 260, damping: 14, mass: 0.9 }),
    ]).start();
  }, [value, slide, stretch]);

  const select = (v: ToggleValue) => {
    if (v !== value) Haptics.selectionAsync();
    onChange?.(v);
  };

  const pressIn = () => {
    Animated.spring(press, { toValue: 0.97, useNativeDriver: true, stiffness: 400, damping: 24 }).start();
  };
  const pressOut = () => {
    Animated.spring(press, { toValue: 1, useNativeDriver: true, stiffness: 400, damping: 24 }).start();
  };

  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -segmentWidth],
  });

  const stretchX = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const stretchY = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });
  const glassGleam = stretch.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.55] });

  return (
    <View style={styles.track}>
      <BlurView intensity={24} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.trackTint]} pointerEvents="none" />

      {segmentWidth > 0 && (
        <Animated.View
          style={[
            styles.thumbPositioner,
            { width: segmentWidth, transform: [{ translateX }, { scale: press }] },
          ]}
        >
          <Animated.View style={{ flex: 1, transform: [{ scaleX: stretchX }, { scaleY: stretchY }] }}>
            <View style={styles.thumbDrop}>
              <View style={styles.thumbAmbient}>
                <View style={styles.thumbContact}>
                  <View style={styles.thumbClip}>
                    <LinearGradient
                      colors={['#3A3A3C', '#1C1C1E', '#000000']}
                      locations={[0, 0.52, 1]}
                      start={{ x: 0.5, y: 0 }}
                      end={{ x: 0.5, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <LinearGradient
                      colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']}
                      locations={[0, 0.45]}
                      start={{ x: 0.5, y: 0 }}
                      end={{ x: 0.5, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <Animated.View style={[styles.thumbTopLight, { opacity: glassGleam }]} />
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>
        </Animated.View>
      )}

      <View
        style={styles.segmentsRow}
        onLayout={(e) => setSegmentWidth((e.nativeEvent.layout.width - TRACK_PAD * 2) / 2)}
      >
        <ToggleSegment
          label="נהגים"
          active={value === 'drivers'}
          onPress={() => select('drivers')}
          onPressIn={pressIn}
          onPressOut={pressOut}
          icon={(color) => <Feather name="users" size={15} color={color} />}
        />
        <ToggleSegment
          label="רכבים"
          active={value === 'vehicles'}
          onPress={() => select('vehicles')}
          onPressIn={pressIn}
          onPressOut={pressOut}
          icon={(color) => <MaterialCommunityIcons name="car-outline" size={17} color={color} />}
        />
      </View>

      <View style={styles.trackHairline} pointerEvents="none" />
    </View>
  );
}

function ToggleSegment({
  label,
  active,
  onPress,
  onPressIn,
  onPressOut,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onPressIn: () => void;
  onPressOut: () => void;
  icon: (color: string) => React.ReactNode;
}) {
  return (
    <Pressable style={styles.segment} onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      {icon(active ? '#FFFFFF' : 'rgba(60,60,67,0.6)')}
      <Text style={active ? styles.labelActive : styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_RADIUS,
    padding: TRACK_PAD,
    marginTop: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  trackTint: { backgroundColor: 'rgba(120,120,128,0.12)', borderRadius: TRACK_RADIUS },
  trackHairline: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: TRACK_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.5)',
  },

  segmentsRow: { flex: 1, flexDirection: 'row-reverse' },
  segment: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7 },

  label: {
    fontFamily: FONT.regular,
    fontSize: 14,
    color: 'rgba(60,60,67,0.6)',
    writingDirection: 'rtl',
  },
  labelActive: {
    fontFamily: FONT.bold,
    fontSize: 15,
    letterSpacing: -0.2,
    color: '#FFFFFF',
    writingDirection: 'rtl',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 1,
  },

  thumbPositioner: {
    position: 'absolute',
    top: TRACK_PAD,
    bottom: TRACK_PAD,
    right: TRACK_PAD,
  },
  thumbDrop: {
    flex: 1,
    borderRadius: THUMB_RADIUS,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 26,
  },
  thumbAmbient: {
    flex: 1,
    borderRadius: THUMB_RADIUS,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
  },
  thumbContact: {
    flex: 1,
    borderRadius: THUMB_RADIUS,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 1,
  },
  thumbClip: {
    flex: 1,
    borderRadius: THUMB_RADIUS,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.5)',
  },
  thumbTopLight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
});
