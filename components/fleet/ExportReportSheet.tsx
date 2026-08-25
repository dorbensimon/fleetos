import React from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../ui';
import { COLORS, RADIUS, SPACING } from '../../lib/theme';
import { REPORT_CATEGORIES, ReportCategory } from '../../lib/driverReport';

export function ExportReportSheet({
  visible,
  exportingCategory,
  onClose,
  onSelect,
}: {
  visible: boolean;
  exportingCategory: ReportCategory | null;
  onClose: () => void;
  onSelect: (category: ReportCategory) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <AppText weight="bold" style={styles.title}>
            ייצוא דוח נהגים
          </AppText>
          <AppText style={styles.subtitle}>בחר את קבוצת הנהגים לדוח</AppText>

          {REPORT_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.value}
              style={styles.row}
              activeOpacity={0.7}
              disabled={!!exportingCategory}
              onPress={() => onSelect(cat.value)}
            >
              <View style={styles.rowIcon}>
                {exportingCategory === cat.value ? (
                  <ActivityIndicator size="small" color={COLORS.accent} />
                ) : (
                  <Ionicons name={cat.icon as any} size={18} color={COLORS.accent} />
                )}
              </View>
              <AppText weight="bold" style={styles.rowLabel}>
                {cat.label}
              </AppText>
              <Ionicons name="chevron-back" size={16} color={COLORS.textFaint} />
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={styles.cancel} onPress={onClose}>
            <AppText weight="bold" style={styles.cancelText}>
              ביטול
            </AppText>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  title: { fontSize: 16, color: COLORS.text, textAlign: 'right' },
  subtitle: { fontSize: 12.5, color: COLORS.textMuted, textAlign: 'right', marginBottom: SPACING.sm },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: 14.5, color: COLORS.text, textAlign: 'right' },
  cancel: {
    marginTop: SPACING.sm,
    height: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 14, color: COLORS.textMuted },
});
