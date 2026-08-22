import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from './Text';
import { COLORS, RADIUS, SPACING } from '../../lib/theme';

/**
 * The drivers/vehicles switch under each admin header. React Native has
 * no inset box-shadow, so the "pressed into the page" look is faked
 * with two thin gradients along the track's top and bottom edges —
 * dark-to-transparent up top, light-to-transparent along the bottom —
 * while the active pill gets a small raised shadow of its own, like a
 * toggle knob sitting inside a groove.
 */
export function AdminSegmentSwitch({
  items,
}: {
  items: {
    key: string;
    label: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    active: boolean;
    onPress: () => void;
  }[];
}) {
  return (
    <View style={styles.track}>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.10)', 'rgba(0,0,0,0)']}
        style={styles.grooveTop}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0)', 'rgba(255,255,255,0.65)']}
        style={styles.grooveBottom}
      />

      {items.map((item) =>
        item.active ? (
          <View key={item.key} style={[styles.btn, styles.btnActive]}>
            <Ionicons name={item.icon} size={15} color={COLORS.text} />
            <AppText weight="bold" style={styles.textActive}>
              {item.label}
            </AppText>
          </View>
        ) : (
          <TouchableOpacity
            key={item.key}
            style={styles.btn}
            activeOpacity={0.7}
            onPress={item.onPress}
          >
            <Ionicons name={item.icon} size={15} color={COLORS.textMuted} />
            <AppText weight="bold" style={styles.text}>
              {item.label}
            </AppText>
          </TouchableOpacity>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'relative',
    flexDirection: 'row-reverse',
    borderRadius: RADIUS.md,
    padding: 4,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    backgroundColor: COLORS.screen,
    overflow: 'hidden',
  },
  grooveTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 10 },
  grooveBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 10 },

  btn: {
    flex: 1,
    height: 38,
    borderRadius: RADIUS.sm,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnActive: {
    backgroundColor: COLORS.card,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  text: { fontSize: 13, color: COLORS.textMuted },
  textActive: { fontSize: 13, color: COLORS.text },
});
