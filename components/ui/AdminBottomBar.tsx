import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './Text';
import { COLORS, RADIUS } from '../../lib/theme';

/**
 * Each admin screen's one primary action, floating bottom-centre like a
 * Dynamic Island — small and out of the way of the list, not a
 * full-width bar. The hamburger/logout menu lives in the header now,
 * not here.
 */
export function AdminBottomBar({
  actionLabel,
  actionIcon,
  onAction,
}: {
  actionLabel: string;
  actionIcon: React.ComponentProps<typeof Ionicons>['name'];
  onAction: () => void;
}) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <TouchableOpacity style={styles.pill} activeOpacity={0.85} onPress={onAction}>
        <Ionicons name={actionIcon} size={16} color={COLORS.textInverse} />
        <AppText weight="bold" style={styles.pillText}>
          {actionLabel}
        </AppText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 26,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.text,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  pillText: { color: COLORS.textInverse, fontSize: 13.5 },
});
