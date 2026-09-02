import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { DE_COLORS } from './driverEditTheme';

/** Small gradient-avatar header, visually bridging this screen with "כרטיס נהג". */
export function EditHero({ name }: { name: string }) {
  const letter = (name || '?').trim().charAt(0);
  return (
    <View style={styles.row}>
      <View style={styles.shadowWrap}>
        <LinearGradient colors={[DE_COLORS.avatarBlueLight, DE_COLORS.avatarBlueDeep]} style={styles.avatar}>
          <View style={styles.highlight} />
          <Text style={styles.letter}>{letter}</Text>
        </LinearGradient>
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {name || 'ללא שם'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', gap: 8, paddingTop: 4, paddingBottom: 2 },
  shadowWrap: {
    shadowColor: DE_COLORS.avatarBlueLight,
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 4,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  letter: { fontFamily: 'Heebo_600SemiBold', fontSize: 24, color: '#FFFFFF', letterSpacing: -0.4 },
  name: {
    fontFamily: 'Heebo_700Bold',
    fontSize: 16,
    color: DE_COLORS.ink,
    writingDirection: 'rtl',
    textAlign: 'center',
  },
});
