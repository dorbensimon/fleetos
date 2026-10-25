// היסטוריית הרכבים של נהג: כפתור קטן שפותח רשימה נגללת של כל רכב שהיה רשום עליו, ומאיזה תאריך עד איזה
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listDriverVehicleHistory, type DriverVehicleAssignment } from '../../../lib/adminApi';
import { formatPlate } from '../../../lib/plate';
import { formatDate } from '../../../lib/theme';
import { DText, HoverPressable, popoverEnterStyle } from '../primitives';
import { DESKTOP_COLORS, webOnly } from '../desktopTheme';
import { pageStyles } from '../record/RecordPage';
import { MiniPlate, vehicleName } from './DriverVehiclesCard';
import { t } from '../../../lib/i18n';

const MENU_WIDTH = 320;

export function DriverVehicleHistoryButton({ driverId, refreshKey }: { driverId: string; refreshKey?: unknown }) {
  const triggerRef = useRef<View>(null);
  const [rows, setRows] = useState<DriverVehicleAssignment[] | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    let active = true;
    listDriverVehicleHistory(driverId)
      .then((list) => { if (active) setRows(list); })
      .catch(() => { if (active) setRows((current) => current ?? []); });
    return () => { active = false; };
  }, [driverId, refreshKey]);

  const open = () => {
    triggerRef.current?.measureInWindow((x, y, _width, height) => {
      const maxLeft = Dimensions.get('window').width - MENU_WIDTH - 8;
      setAnchor({ top: y + height + 4, left: Math.max(8, Math.min(x, maxLeft)) });
    });
  };

  return (
    <View ref={triggerRef}>
      <HoverPressable
        style={styles.trigger}
        hoverStyle={styles.hover}
        onPress={() => (anchor ? setAnchor(null) : open())}
        accessibilityLabel={t('driver.vehicleHistory')}
      >
        <Ionicons name="time-outline" size={14} color={DESKTOP_COLORS.inkMuted} />
        <DText weight="semiBold" style={styles.triggerText}>
          {t('driver.vehicleHistory')}{rows?.length ? ` (${rows.length})` : ''}
        </DText>
      </HoverPressable>
      {anchor && (
        <Modal transparent visible animationType="none" onRequestClose={() => setAnchor(null)}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAnchor(null)} />
          <View style={[styles.menu, { top: anchor.top, left: anchor.left }, popoverEnterStyle()]}>
            <View style={styles.head}>
              <DText weight="bold" style={styles.title}>{t('driver.vehicleHistory')}</DText>
              <DText style={pageStyles.mutedText}>{t('driver.vehicleHistoryHint')}</DText>
            </View>
            <ScrollView style={styles.list}>
              {!rows?.length ? (
                <DText style={[pageStyles.mutedText, styles.empty]}>{t('driver.vehicleHistoryEmpty')}</DText>
              ) : (
                rows.map((row, index) => (
                  <View key={row.id} style={[styles.row, index > 0 && pageStyles.rowDivider]}>
                    <MiniPlate plate={formatPlate(row.vehicle.plate_number)} />
                    <View style={styles.text}>
                      {!!vehicleName(row.vehicle) && <DText weight="semiBold" style={styles.name} numberOfLines={1}>{vehicleName(row.vehicle)}</DText>}
                      <DText style={pageStyles.mutedText}>
                        {t('driver.vehicleHistoryRange', {
                          from: formatDate(row.assigned_at),
                          to: row.unassigned_at ? formatDate(row.unassigned_at) : t('driver.vehicleHistoryNow'),
                        })}
                      </DText>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, height: 24, paddingHorizontal: 10, borderWidth: 1, borderColor: DESKTOP_COLORS.borderInput, borderRadius: 12, backgroundColor: DESKTOP_COLORS.surface, ...webOnly({ transition: 'background-color 150ms ease' }) },
  hover: { backgroundColor: DESKTOP_COLORS.rowHover },
  triggerText: { fontSize: 12.5, color: DESKTOP_COLORS.ink },
  menu: { position: 'absolute', width: MENU_WIDTH, backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 12, overflow: 'hidden', ...webOnly({ boxShadow: '0 8px 24px -6px rgba(22,34,46,0.18)' }) },
  head: { paddingHorizontal: 14, paddingVertical: 10, gap: 2, borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.border },
  title: { fontSize: 14.5 },
  list: { maxHeight: 300 },
  empty: { padding: 14 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, paddingVertical: 6 },
  text: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 13.5 },
});
