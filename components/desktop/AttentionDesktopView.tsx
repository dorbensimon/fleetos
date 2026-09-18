import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DText } from './primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, DesktopTone } from './desktopTheme';

/**
 * Desktop body of the "attention" screen: same four counters as the phone
 * app, laid out as a control-room summary strip instead of a scrolling
 * card stack. Purely presentational — AttentionScreen owns the data.
 * The cards carry no navigation on the phone app either (the audit that
 * looked at this screen found the destinations aren't decided product
 * territory), so this stays informational here too.
 */

export type AttentionRow = {
  count: number;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  detail: string;
};

export function AttentionDesktopView({ rows, total }: { rows: AttentionRow[]; total: number }) {
  const tone: DesktopTone = total === 0 ? 'ok' : total >= 5 ? 'bad' : 'warn';
  const toneColors = DESKTOP_TONES[tone];

  return (
    <View style={styles.wrap}>
      <View style={[styles.summary, { backgroundColor: toneColors.bg }]}>
        <DText weight="extraBold" style={[styles.summaryNumber, { color: toneColors.fg }]}>{total}</DText>
        <DText weight="semiBold" style={[styles.summaryText, { color: toneColors.fg }]}>
          {total === 0 ? 'אין משימות פתוחות בצי' : 'משימות דורשות את תשומת לבך היום'}
        </DText>
      </View>

      {total === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-circle-outline" size={32} color={DESKTOP_COLORS.inkFaint} />
          <DText weight="semiBold" style={styles.emptyTitle}>הכול מטופל</DText>
        </View>
      ) : (
        <View style={styles.grid}>
          {rows.map((row) => (
            <View key={row.title} style={styles.card}>
              <View style={styles.cardIcon}>
                <Ionicons name={row.icon} size={18} color={DESKTOP_COLORS.brand} />
              </View>
              <View style={styles.cardBody}>
                <DText weight="bold" style={styles.cardTitle}>{row.title}</DText>
                <DText style={styles.cardDetail}>{row.detail}</DText>
              </View>
              <DText weight="extraBold" style={styles.cardCount}>{row.count}</DText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24, gap: 20, maxWidth: 920 },
  summary: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  summaryNumber: { fontSize: 30 },
  summaryText: { fontSize: 13.5 },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 48 },
  emptyTitle: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    flexBasis: 300,
    flexGrow: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    padding: 14,
  },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: 7,
    backgroundColor: DESKTOP_COLORS.brandFocusRing,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 13 },
  cardDetail: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint },
  cardCount: { fontSize: 20, color: DESKTOP_COLORS.ink },
});
