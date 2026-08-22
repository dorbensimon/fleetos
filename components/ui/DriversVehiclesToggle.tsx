import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  LayoutChangeEvent,
  Platform,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { FONT } from '../../lib/theme';

/**
 * The drivers/vehicles switch under each admin header. Each option is a
 * separate stack screen, not tab content, so this is used "controlled"
 * — `value` reflects whichever screen mounted it, and `onChange` fires
 * navigation rather than local state.
 */

export type ToggleValue = 'drivers' | 'vehicles';

type Props = {
  value?: ToggleValue;
  onChange?: (v: ToggleValue) => void;
};

const PAD = 4;

export default function DriversVehiclesToggle({ value, onChange }: Props) {
  const [internal, setInternal] = useState<ToggleValue>('drivers');
  const active = value ?? internal;
  const [trackW, setTrackW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;

  const half = trackW > 0 ? (trackW - PAD * 2) / 2 : 0;

  const select = (v: ToggleValue) => {
    if (value === undefined) setInternal(v);
    onChange?.(v);
    Animated.spring(x, {
      toValue: v === 'drivers' ? 0 : -half, // RTL: נהגים בימין
      useNativeDriver: true,
      speed: 18,
      bounciness: 4,
    }).start();
  };

  const onTrackLayout = (e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width);

  return (
    <View style={styles.track} onLayout={onTrackLayout}>
      {half > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[styles.thumb, { width: half, transform: [{ translateX: x }] }]}
        />
      )}

      <Pressable style={styles.item} onPress={() => select('drivers')}>
        <Feather name="users" size={15} color={active === 'drivers' ? '#000000' : '#7C7C7C'} />
        <Text style={active === 'drivers' ? styles.labelOn : styles.labelOff}>נהגים</Text>
      </Pressable>

      <Pressable style={styles.item} onPress={() => select('vehicles')}>
        <MaterialCommunityIcons
          name="car-outline"
          size={17}
          color={active === 'vehicles' ? '#000000' : '#7C7C7C'}
        />
        <Text style={active === 'vehicles' ? styles.labelOn : styles.labelOff}>רכבים</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row-reverse',
    height: 52,
    padding: PAD,
    borderRadius: 16,
    backgroundColor: '#E6E6E6',
    marginHorizontal: 20,
    marginTop: 12,
  },
  thumb: {
    position: 'absolute',
    top: PAD,
    right: PAD,
    bottom: PAD,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.14,
        shadowOffset: { width: 0, height: 3 },
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  item: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  labelOn: {
    fontFamily: FONT.bold,
    fontSize: 15,
    color: '#000000',
    writingDirection: 'rtl',
  },
  labelOff: {
    fontFamily: FONT.regular,
    fontSize: 15,
    color: '#7C7C7C',
    writingDirection: 'rtl',
  },
});
