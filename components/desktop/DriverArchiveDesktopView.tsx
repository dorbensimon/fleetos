import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DriverRow } from '../../lib/adminApi';
import { formatDate } from '../../lib/theme';
import { DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS, DESKTOP_TONES } from './desktopTheme';

/**
 * Desktop body of the driver archive: a dense table (name, archived-at,
 * restore/delete) instead of a scrolling card stack. Purely presentational
 * — DriverArchiveScreen owns data and the delete confirmation modal.
 */
export function DriverArchiveDesktopView({
  drivers,
  restoringId,
  onOpenDriver,
  onRestore,
  onDelete,
}: {
  drivers: DriverRow[];
  restoringId: string | null;
  onOpenDriver: (id: string) => void;
  onRestore: (driver: DriverRow) => void;
  onDelete: (driver: DriverRow) => void;
}) {
  if (drivers.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="archive-outline" size={22} color={DESKTOP_COLORS.inkFaint} />
        <DText style={styles.emptyText}>הארכיון ריק</DText>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.table}>
        {drivers.map((item, index) => (
          <View key={item.id} style={[styles.row, index === drivers.length - 1 && styles.rowLast]}>
            <HoverPressable style={styles.rowMain} hoverStyle={styles.rowMainHover} onPress={() => onOpenDriver(item.id)}>
              <View style={styles.avatar}>
                <DText weight="bold" style={styles.avatarText}>{(item.full_name ?? '?').trim().charAt(0)}</DText>
              </View>
              <View style={styles.nameBlock}>
                <DText weight="semiBold" style={styles.name} numberOfLines={1}>{item.full_name ?? 'ללא שם'}</DText>
                <DText style={styles.meta} numberOfLines={1}>
                  {item.archived_at ? `הועבר לארכיון ב-${formatDate(item.archived_at)}` : 'הועבר לארכיון'}
                  {item.archived_by_name ? ` · על ידי ${item.archived_by_name}` : ''}
                </DText>
              </View>
            </HoverPressable>

            <View style={styles.actions}>
              <HoverPressable
                style={styles.actionButton}
                hoverStyle={[styles.actionButtonHover, { backgroundColor: DESKTOP_TONES.ok.bg }]}
                onPress={() => onRestore(item)}
                disabled={restoringId === item.id}
              >
                <Ionicons name="arrow-undo-outline" size={14} color={DESKTOP_TONES.ok.fg} />
                <DText weight="semiBold" style={[styles.actionText, { color: DESKTOP_TONES.ok.fg }]}>
                  {restoringId === item.id ? 'משחזר…' : 'שחזור'}
                </DText>
              </HoverPressable>
              <HoverPressable
                style={styles.actionButton}
                hoverStyle={[styles.actionButtonHover, { backgroundColor: DESKTOP_TONES.bad.bg }]}
                onPress={() => onDelete(item)}
              >
                <Ionicons name="trash-outline" size={14} color={DESKTOP_TONES.bad.fg} />
                <DText weight="semiBold" style={[styles.actionText, { color: DESKTOP_TONES.bad.fg }]}>מחיקת נהג</DText>
              </HoverPressable>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24, maxWidth: 920 },
  table: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.borderSoft,
  },
  rowLast: { borderBottomWidth: 0 },
  rowMain: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderRadius: 6 },
  rowMainHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 7,
    backgroundColor: DESKTOP_COLORS.brandFocusRing,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 12.5, color: DESKTOP_COLORS.brand },
  nameBlock: { gap: 1 },
  name: { fontSize: 13 },
  meta: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint },

  actions: { flexDirection: 'row-reverse', gap: 6 },
  actionButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 6,
  },
  actionButtonHover: {},
  actionText: { fontSize: 12 },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 48 },
  emptyText: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint },
});
