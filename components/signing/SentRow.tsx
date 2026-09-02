import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../ui';
import { SG_COLORS, SG_RADIUS, SG_TYPO } from './signingTheme';

export type SentRowStatus = 'pending' | 'signed';

export function SentRow({
  title,
  recipient,
  timestamp,
  status,
  loading,
  onPress,
  onDelete,
  onDownload,
}: {
  title: string;
  recipient: string;
  timestamp: string;
  status: SentRowStatus;
  loading?: boolean;
  onPress: () => void;
  onDelete: () => void;
  onDownload?: () => void;
}) {
  const dotColor = status === 'signed' ? SG_COLORS.statusSigned : SG_COLORS.statusPending;
  const chipBg = status === 'signed' ? SG_COLORS.statusSignedBg : SG_COLORS.statusPendingBg;

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} disabled={loading} style={styles.row}>
      <View style={styles.dotCol}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
      </View>

      <View style={styles.middle}>
        <AppText numberOfLines={1} style={[SG_TYPO.listTitle, styles.title]}>
          {title}
        </AppText>
        <AppText numberOfLines={1} style={[SG_TYPO.recipients, styles.recipient]}>
          {recipient}
        </AppText>
        <AppText numberOfLines={1} style={[SG_TYPO.sub, styles.timestamp]}>
          {timestamp}
        </AppText>
      </View>

      <View style={styles.rightCol}>
        <View style={[styles.chip, { backgroundColor: chipBg }]}>
          <AppText style={[SG_TYPO.chip, { color: dotColor }]}>{status === 'signed' ? 'נחתם' : 'ממתין'}</AppText>
        </View>
        <View style={styles.actions}>
          {!!onDownload && (
            <TouchableOpacity hitSlop={8} onPress={onDownload}>
              <Ionicons name="download-outline" size={17} color={SG_COLORS.textTertiary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity hitSlop={8} onPress={onDelete}>
            <Ionicons name="trash-outline" size={17} color={SG_COLORS.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function ArchiveRow({
  title,
  meta,
  onRestore,
  restoreDisabled,
}: {
  title: string;
  meta: string;
  onRestore: () => void;
  restoreDisabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.dotCol}>
        <Ionicons name="archive-outline" size={16} color={SG_COLORS.textTertiary} />
      </View>
      <View style={styles.middle}>
        <AppText numberOfLines={1} style={[SG_TYPO.listTitle, styles.title]}>
          {title}
        </AppText>
        <AppText numberOfLines={1} style={[SG_TYPO.sub, styles.timestamp]}>
          {meta}
        </AppText>
      </View>
      <TouchableOpacity disabled={restoreDisabled} onPress={onRestore} hitSlop={8} style={styles.restoreBtn}>
        <Ionicons name="refresh-outline" size={16} color={restoreDisabled ? SG_COLORS.textQuaternary : SG_COLORS.brand} />
        <AppText style={[SG_TYPO.chip, { color: restoreDisabled ? SG_COLORS.textQuaternary : SG_COLORS.brand }]}>שחזר</AppText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12 },
  dotCol: { paddingTop: 7, width: 16, alignItems: 'center' },
  dot: { width: 9, height: 9, borderRadius: SG_RADIUS.dot },
  middle: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  title: { color: SG_COLORS.textPrimary, textAlign: 'right', writingDirection: 'rtl', alignSelf: 'stretch' },
  recipient: { color: SG_COLORS.textSecondary, textAlign: 'right', writingDirection: 'rtl', alignSelf: 'stretch', marginTop: 2 },
  timestamp: { color: SG_COLORS.textQuaternary, textAlign: 'right', writingDirection: 'rtl', alignSelf: 'stretch', marginTop: 2 },
  rightCol: { alignItems: 'flex-end', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: SG_RADIUS.chip },
  actions: { flexDirection: 'row-reverse', gap: 10 },
  restoreBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
});
