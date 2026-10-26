// היסטוריית שיוכים: כפתור קטן שפותח רשימה נגללת של כל הרכבים של נהג (או כל הנהגים של רכב), ומאיזה תאריך עד איזה
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listDriverVehicleHistory, listVehicleDriverHistory } from '../../../lib/adminApi';
import { formatPlate } from '../../../lib/plate';
import { formatDate } from '../../../lib/theme';
import { DText, HoverPressable, popoverEnterStyle } from '../primitives';
import { DESKTOP_COLORS, webOnly } from '../desktopTheme';
import { pageStyles } from '../record/RecordPage';
import { MiniPlate, vehicleName } from './DriverVehiclesCard';
import { t } from '../../../lib/i18n';

const MENU_WIDTH = 320;
// Up to 5 rows show in full; from the 6th the list scrolls.
const ROW_HEIGHT = 56;
const VISIBLE_ROWS = 5;

interface HistoryRow {
  id: string;
  assigned_at: string;
  unassigned_at: string | null;
  lead: React.ReactNode;
  name: string;
}

// כל הרכבים שהנהג היה רשום עליהם
export function DriverVehicleHistoryButton({ driverId, refreshKey }: { driverId: string; refreshKey?: unknown }) {
  return (
    <HistoryButton
      title={t('driver.vehicleHistory')}
      hint={t('driver.vehicleHistoryHint')}
      empty={t('driver.vehicleHistoryEmpty')}
      refreshKey={`${driverId}|${refreshKey}`}
      load={async () => (await listDriverVehicleHistory(driverId)).map((row) => ({
        id: row.id, assigned_at: row.assigned_at, unassigned_at: row.unassigned_at,
        lead: <MiniPlate plate={formatPlate(row.vehicle.plate_number)} />,
        name: vehicleName(row.vehicle),
      }))}
    />
  );
}

// כל הנהגים שהיו רשומים על הרכב
export function VehicleDriverHistoryButton({ vehicleId, refreshKey }: { vehicleId: string; refreshKey?: unknown }) {
  return (
    <HistoryButton
      title={t('vehicle.driverHistory')}
      hint={t('vehicle.driverHistoryHint')}
      empty={t('vehicle.driverHistoryEmpty')}
      refreshKey={`${vehicleId}|${refreshKey}`}
      load={async () => (await listVehicleDriverHistory(vehicleId)).map((row) => {
        const name = row.full_name?.trim() || t('common.unnamed');
        return {
          id: row.id, assigned_at: row.assigned_at, unassigned_at: row.unassigned_at,
          lead: <View style={styles.avatar}><DText weight="bold" style={styles.avatarText}>{name.charAt(0)}</DText></View>,
          name,
        };
      })}
    />
  );
}

function HistoryButton({ title, hint, empty, refreshKey, load }: { title: string; hint: string; empty: string; refreshKey: string; load: () => Promise<HistoryRow[]> }) {
  const triggerRef = useRef<View>(null);
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    let active = true;
    load()
      .then((list) => { if (active) setRows(list); })
      .catch(() => { if (active) setRows((current) => current ?? []); });
    return () => { active = false; };
    // `load` is a fresh closure each render; refreshKey says when the data changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

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
        accessibilityLabel={title}
      >
        <Ionicons name="time-outline" size={14} color={DESKTOP_COLORS.inkMuted} />
        <DText weight="semiBold" style={styles.triggerText}>
          {title}{rows?.length ? ` (${rows.length})` : ''}
        </DText>
      </HoverPressable>
      {anchor && (
        <Modal transparent visible animationType="none" onRequestClose={() => setAnchor(null)}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAnchor(null)} />
          <View style={[styles.menu, { top: anchor.top, left: anchor.left }, popoverEnterStyle()]}>
            <View style={styles.head}>
              <DText weight="bold" style={styles.title}>{title}</DText>
              <DText style={pageStyles.mutedText}>{hint}</DText>
            </View>
            <ScrollView style={styles.list}>
              {!rows?.length ? (
                <DText style={[pageStyles.mutedText, styles.empty]}>{empty}</DText>
              ) : (
                rows.map((row, index) => (
                  <View key={row.id} style={[styles.row, index > 0 && pageStyles.rowDivider]}>
                    {row.lead}
                    <View style={styles.text}>
                      {!!row.name && <DText weight="semiBold" style={styles.name} numberOfLines={1}>{row.name}</DText>}
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
  // Rows are a fixed height (border-box, so the divider sits inside it).
  list: { maxHeight: VISIBLE_ROWS * ROW_HEIGHT },
  empty: { padding: 14 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, height: ROW_HEIGHT, paddingHorizontal: 14 },
  text: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 13.5 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: DESKTOP_COLORS.brandFocusRing },
  avatarText: { fontSize: 13.5, color: DESKTOP_COLORS.brand },
});
