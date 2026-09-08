import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';

/** Round frosted-glass button used for back/action icons floating directly over a gradient background. */
export function GlassPill({
  size,
  blur,
  bg,
  children,
}: {
  size: number;
  blur: number;
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
      <BlurView intensity={blur} tint="light" style={StyleSheet.absoluteFill} />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: bg, borderRadius: size / 2, borderWidth: 0.5, borderColor: 'rgba(255,255,255,.6)' },
        ]}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#505a82',
        shadowOpacity: 0.18,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  content: { alignItems: 'center', justifyContent: 'center' },
});
