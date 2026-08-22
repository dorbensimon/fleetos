import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './Text';
import { COLORS, RADIUS } from '../../lib/theme';

/**
 * Each admin screen's one primary action. Lives at the very end of the
 * list (as a ListFooterComponent), not floating over it — so it's only
 * visible once you've scrolled all the way down, not blocking rows
 * while you browse the top or middle of a long list.
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
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.pill} activeOpacity={0.85} onPress={onAction}>
        <Ionicons name={actionIcon} size={14} color={COLORS.textInverse} />
        <AppText weight="bold" style={styles.pillText}>
          {actionLabel}
        </AppText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginTop: 6,
  },
  pill: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.text,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  pillText: { color: COLORS.textInverse, fontSize: 12.5 },
});
