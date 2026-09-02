import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../ui';
import type { DocumentRow } from '../../lib/adminApi';
import { CARD_SHADOW, COLORS, RADIUS, SPACING, formatDate } from '../../lib/theme';
import { documentDisplayName, documentIconName } from '../../lib/documentActions';

type Props = {
  doc: DocumentRow;
  variant?: 'card' | 'compact';
  showDate?: boolean;
  onOpen: (doc: DocumentRow) => void;
  onDownload: (doc: DocumentRow) => void;
  onDelete: (doc: DocumentRow) => void;
};

export function DocumentFileRow({
  doc,
  variant = 'compact',
  showDate = false,
  onOpen,
  onDownload,
  onDelete,
}: Props) {
  const isCard = variant === 'card';

  return (
    <View style={[styles.base, isCard ? styles.card : styles.compact]}>
      <TouchableOpacity
        style={styles.info}
        onPress={() => onOpen(doc)}
        activeOpacity={0.7}
      >
        <View style={isCard ? styles.cardIcon : styles.compactIcon}>
          <Ionicons
            name={documentIconName(doc)}
            size={isCard ? 18 : 16}
            color={isCard ? COLORS.accent : COLORS.textFaint}
          />
        </View>
        <View style={styles.textWrap}>
          <AppText
            weight={isCard ? 'bold' : 'regular'}
            style={isCard ? styles.cardName : styles.compactName}
            numberOfLines={1}
          >
            {documentDisplayName(doc)}
          </AppText>
          {showDate && <AppText style={styles.date}>{formatDate(doc.created_at)}</AppText>}
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onDownload(doc)} hitSlop={8}>
        <Ionicons name="download-outline" size={isCard ? 17 : 16} color={COLORS.accent} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onDelete(doc)} hitSlop={8}>
        <Ionicons name="trash-outline" size={isCard ? 17 : 16} color={COLORS.dangerText} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
  },
  card: {
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.card,
    ...CARD_SHADOW,
  },
  compact: {
    backgroundColor: COLORS.field,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  info: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactIcon: {
    width: 18,
    alignItems: 'center',
  },
  textWrap: { flex: 1, gap: 1 },
  cardName: { fontSize: 14 },
  compactName: { flex: 1, fontSize: 12.5, color: COLORS.textMuted },
  date: { fontSize: 11.5, color: COLORS.textFaint },
});
