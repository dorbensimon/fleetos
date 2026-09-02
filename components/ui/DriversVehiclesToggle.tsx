import React, { useRef, useState } from 'react';
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
 * Liquid Glass segmented control: a milky glass rail (matches the dock's
 * glass level — this floats over scrolling list content, not the blue
 * hero) holds a lit glass pill that slides between the two tabs. The
 * tabs themselves stay fully transparent; only the pill underneath them
 * carries background, so the crossfade is just a text-color change.
 */

export type ToggleValue = 'drivers' | 'vehicles';

type Props = {
  value?: ToggleValue;
  onChange?: (v: ToggleValue) => void;
};

const TRACK_HEIGHT = 54;
const TRACK_RADIUS = 26;
const TRACK_PAD = 5;
const PILL_RADIUS = 21;

export default function DriversVehiclesToggle({ value = 'drivers', onChange }: Props) {
  const [segmentWidth, setSegmentWidth] = useState(0);

  // 0 = drivers (right, since row-reverse puts the first child there), 1 = vehicles.
  const slide = useRef(new Animated.Value(value === 'drivers' ? 0 : 1)).current;
  const press = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    Animated.timing(slide, {
      toValue: value === 'drivers' ? 0 : 1,
      duration: 380,
      useNativeDriver: true,
    }).start();
  }, [value, slide]);

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

  return (
    <View style={styles.track}>
      <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['rgba(255,255,255,.5)', 'rgba(255,255,255,.32)']}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.75, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.trackHairline} pointerEvents="none" />

      {segmentWidth > 0 && (
        <Animated.View
          style={[
            styles.pillPositioner,
            { width: segmentWidth, transform: [{ translateX }, { scale: press }] },
          ]}
          pointerEvents="none"
        >
          <View style={styles.pillClip}>
            <BlurView intensity={14} tint="light" style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={['rgba(255,255,255,.92)', 'rgba(255,255,255,.66)']}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.75, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.pillTopLight} pointerEvents="none" />
          </View>
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
      {icon(active ? '#0b0c10' : 'rgba(11,12,16,.5)')}
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
  trackHairline: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: TRACK_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.7)',
  },

  segmentsRow: { flex: 1, flexDirection: 'row-reverse' },
  segment: { flex: 1, zIndex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7 },

  label: {
    fontFamily: FONT.regular,
    fontSize: 14,
    color: 'rgba(11,12,16,.5)',
    writingDirection: 'rtl',
  },
  labelActive: {
    fontFamily: FONT.bold,
    fontSize: 15,
    color: '#0b0c10',
    writingDirection: 'rtl',
    textShadowColor: 'rgba(255,255,255,.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },

  pillPositioner: {
    position: 'absolute',
    top: TRACK_PAD,
    bottom: TRACK_PAD,
    right: TRACK_PAD,
  },
  pillClip: {
    flex: 1,
    borderRadius: PILL_RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.9)',
    shadowColor: '#08245e',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  pillTopLight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,1)',
  },
});
