import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { DE_COLORS, DE_RADIUS, DE_TYPO } from './driverEditTheme';

export function EditBottomBar({
  label,
  loading,
  onPress,
  bottomInset,
}: {
  label: string;
  loading?: boolean;
  onPress: () => void;
  bottomInset: number;
}) {
  return (
    <LinearGradient
      colors={['rgba(244,244,246,0)', DE_COLORS.screenMid, DE_COLORS.screenMid]}
      locations={[0, 0.45, 1]}
      pointerEvents="box-none"
      style={[styles.fade, { paddingBottom: bottomInset + 14 }]}
    >
      <Pressable
        onPress={onPress}
        disabled={loading}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <View style={styles.topHighlight} pointerEvents="none" />
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={[DE_TYPO.button, styles.label]}>{label}</Text>
        )}
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 40,
  },
  button: {
    height: 56,
    borderRadius: DE_RADIUS.button,
    backgroundColor: DE_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: DE_COLORS.accent,
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 6,
  },
  buttonPressed: { opacity: 0.85 },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  label: { color: '#FFFFFF', writingDirection: 'rtl' },
});
