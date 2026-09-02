import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { DE_COLORS, DE_TYPO } from './driverEditTheme';

const VISIBLE_MS = 2200;
const ANIM_MS = 220;

export function EditToast({ message, bottom }: { message: string | null; bottom: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const [shown, setShown] = React.useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    setShown(message);
    opacity.setValue(0);
    translateY.setValue(14);
    scale.setValue(0.96);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: ANIM_MS, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: ANIM_MS, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: ANIM_MS, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: ANIM_MS, useNativeDriver: true }).start(() =>
        setShown(null)
      );
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message, opacity, translateY, scale]);

  if (!shown) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { bottom, opacity, transform: [{ translateY }, { scale }] }]}
    >
      <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
      <Text style={[DE_TYPO.caption, styles.text]}>{shown}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: 18,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 11,
    backgroundColor: DE_COLORS.toastBg,
  },
  text: { color: '#FFFFFF', fontSize: 13.5, writingDirection: 'rtl' },
});
