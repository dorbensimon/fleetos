import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DocumentRow } from '../../lib/adminApi';
import { expiryState, formatDate } from '../../lib/theme';
import { documentDisplayName, documentIconName } from '../../lib/documentActions';
import { DK, DK_SHADOW, DKText, Pressy, STATUS, StatusChip, statusOf } from '../driverKit';

type Props = {
  doc: DocumentRow;
  variant?: 'card' | 'compact';
  showDate?: boolean;
  showExpiry?: boolean;
  onOpen: (doc: DocumentRow) => void;
  onDownload: (doc: DocumentRow) => void;
  onDelete?: (doc: DocumentRow) => void;
};

/** One uploaded file: open it by tapping the row; download and delete sit at its end. */
export function DocumentFileRow({ doc, variant = 'compact', showDate = false, showExpiry = false, onOpen, onDownload, onDelete }: Props) {
  const isCard = variant === 'card';
  const state = doc.expiry_date ? expiryState(doc.expiry_date) : null;
  const flagged = state === 'expired' || state === 'soon';
  const name = documentDisplayName(doc);
  const meta = showDate ? (showExpiry ? (doc.expiry_date ? `תוקף עד ${formatDate(doc.expiry_date)}` : 'לא הוזן תוקף') : `הועלה ${formatDate(doc.created_at)}`) : null;

  return (
    <View style={[styles.base, isCard ? styles.card : styles.compact]}>
      <Pressy onPress={() => onOpen(doc)} accessibilityLabel={`פתיחת ${name}`} style={styles.info} pressScale={0.98}>
        <View style={styles.infoRow}>
          <View style={[styles.icon, !isCard && styles.iconCompact]}>
            <Ionicons name={documentIconName(doc)} size={18} color={DK.accent} />
          </View>
          <View style={styles.text}>
            <DKText variant="label" numberOfLines={1}>
              {name}
            </DKText>
            {(!!meta || flagged) && (
              <View style={styles.meta}>
                {!!meta && (
                  <DKText variant="caption" color={DK.muted}>
                    {meta}
                  </DKText>
                )}
                {flagged && <StatusChip status={statusOf(state!)} />}
              </View>
            )}
          </View>
        </View>
      </Pressy>
      <Pressy onPress={() => onDownload(doc)} accessibilityLabel={`הורדת ${name}`} style={styles.action} pressScale={0.9}>
        <Ionicons name="download-outline" size={18} color={DK.accent} />
      </Pressy>
      {onDelete && (
        <Pressy onPress={() => onDelete(doc)} accessibilityLabel={`מחיקת ${name}`} style={[styles.action, styles.actionDanger]} pressScale={0.9}>
          <Ionicons name="trash-outline" size={18} color={STATUS.expired.fg} />
        </Pressy>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  card: { padding: 12, borderRadius: 20, backgroundColor: DK.surface, ...DK_SHADOW },
  compact: { padding: 8, borderRadius: 16, backgroundColor: DK.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: DK.hairline },
  info: { flex: 1 },
  infoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
  iconCompact: { width: 36, height: 36, borderRadius: 11 },
  text: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  action: { width: 44, height: 44, borderRadius: 14, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
  actionDanger: { backgroundColor: STATUS.expired.soft },
});
