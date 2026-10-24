// היסטוריית הרכבים של נהג: כל רכב שהיה רשום עליו, ומאיזה תאריך עד איזה
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { listDriverVehicleHistory, type DriverVehicleAssignment } from '../../../lib/adminApi';
import { formatPlate } from '../../../lib/plate';
import { formatDate } from '../../../lib/theme';
import { DText } from '../primitives';
import { pageStyles } from '../record/RecordPage';
import { MiniPlate, vehicleName } from './DriverVehiclesCard';
import { t } from '../../../lib/i18n';

export function DriverVehicleHistory({ driverId, refreshKey }: { driverId: string; refreshKey?: unknown }) {
  const [rows, setRows] = useState<DriverVehicleAssignment[] | null>(null);

  useEffect(() => {
    let active = true;
    listDriverVehicleHistory(driverId)
      .then((list) => { if (active) setRows(list); })
      .catch(() => { if (active) setRows((current) => current ?? []); });
    return () => { active = false; };
  }, [driverId, refreshKey]);

  return (
    <View style={pageStyles.card}>
      {rows === null ? null : rows.length === 0 ? (
        <View style={styles.empty}>
          <DText style={pageStyles.mutedText}>{t('driver.vehicleHistoryEmpty')}</DText>
        </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { padding: 16 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 8 },
  text: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 14.5 },
});
