import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { AppText } from '../ui';
import { COLORS, RADIUS, SPACING } from '../../lib/theme';
import { TONE_BAD } from '../../lib/fleetCardHelpers';

/**
 * One column of the insurance/test/service stats row: a coloured dot +
 * label, the value, a fill bar that animates in from empty on mount, and
 * a note line.
 */
export function StatCell({
  label,
  value,
  note,
  tone,
  ratio,
  showDivider,
}: {
  label: string;
  value: string;
  note: string;
  tone: string;
  ratio: number;
  showDivider?: boolean;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const targetPercent = Math.max(6, Math.min(100, ratio * 100));

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `anim` is a stable ref
  }, [targetPercent]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${targetPercent}%`] });
  const isBad = tone === TONE_BAD;

  return (
    <View style={[styles.statCell, showDivider && styles.statCellDivider]}>
      <View style={styles.statHeader}>
        <View style={[styles.statDot, { backgroundColor: tone }]} />
        <AppText style={styles.statLabel} numberOfLines={1}>
          {label}
        </AppText>
      </View>
      <AppText weight="bold" style={[styles.statValue, isBad && styles.statValueBad]} numberOfLines={1}>
        {value}
      </AppText>
      <View style={styles.statTrack}>
        <Animated.View style={[styles.statBar, { width, backgroundColor: tone }]} />
      </View>
      <AppText style={[styles.statNote, isBad && styles.statNoteBad]} numberOfLines={1}>
        {note}
      </AppText>
    </View>
  );
}

export const statsRowStyles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row-reverse',
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: '#EFEFEF',
  },
});

const styles = StyleSheet.create({
  statCell: { flex: 1, gap: 5, padding: SPACING.sm },
  statCellDivider: { borderLeftWidth: 1, borderLeftColor: '#EFEFEF' },
  statHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  statDot: { width: 6, height: 6, borderRadius: 3 },
  statLabel: { fontSize: 10.5, fontWeight: '600', color: '#8A8A8A' },
  statValue: { fontSize: 12.5, color: COLORS.text, textAlign: 'right' },
  statValueBad: { color: TONE_BAD },
  statTrack: {
    height: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: '#ECECEC',
    overflow: 'hidden',
    marginTop: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  statBar: { height: '100%', borderRadius: RADIUS.pill },
  statNote: { fontSize: 10, color: '#8A8A8A' },
  statNoteBad: { fontWeight: '700', color: TONE_BAD },
});
