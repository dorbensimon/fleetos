import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  assignDriverToVehicle,
  isPendingAssignmentSyncError,
  listActiveDriverVehicles,
  listActiveVehicleDrivers,
  listVehicles,
  unassignVehicleDriver,
  type DriverRowVehicle,
  type DriverVehicleAssignment,
  type Vehicle,
} from '../../../lib/adminApi';
import { formatPlate } from '../../../lib/plate';
import { showAlert } from '../../../lib/platformAlert';
import { useToast } from '../../ui';
import { DesktopSelect, DLtrText, DText, HoverPressable } from '../primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from '../desktopTheme';
import { pageStyles } from '../record/RecordPage';
import { t, dirIcon, fixedLayoutProps, FIXED_LAYOUT_STYLE } from '../../../lib/i18n';
import { errorMessage } from '../../../lib/requestError';

type Row = { assignmentId: string | null; vehicleId: string; plate: string; name: string; isPrimary: boolean };

const vehicleName = (v: Pick<Vehicle, 'manufacturer' | 'model'> | null | undefined) =>
  [v?.manufacturer, v?.model].filter(Boolean).join(' ');

/**
 * The vehicles a driver drives, managed from the driver's own page — the
 * mirror of the drivers list on a vehicle page. Rows open the vehicle; the
 * "×" removes the link; the bottom row links another company vehicle.
 */
export function DriverVehiclesCard({
  companyId,
  driverId,
  initialVehicles,
  canEdit,
  onOpenVehicle,
  onChanged,
}: {
  companyId: string;
  driverId: string;
  /** What the driver row already knows, shown until the assignments load. */
  initialVehicles: DriverRowVehicle[];
  /** Archived drivers cannot be linked to a vehicle. */
  canEdit: boolean;
  onOpenVehicle: (vehicleId: string) => void;
  onChanged?: () => void;
}) {
  const { showToast } = useToast();
  const [assignments, setAssignments] = useState<DriverVehicleAssignment[] | null>(null);
  const [companyVehicles, setCompanyVehicles] = useState<Vehicle[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setAssignments(await listActiveDriverVehicles(driverId));
    } catch {
      // Keep showing the driver row's vehicles; removal waits for ids.
    }
  }, [driverId]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!canEdit || !companyId) return;
    let active = true;
    listVehicles(companyId)
      .then((list) => { if (active) setCompanyVehicles(list); })
      .catch(() => {});
    return () => { active = false; };
  }, [canEdit, companyId]);

  const rows: Row[] = assignments
    ? assignments.map((a) => ({
        assignmentId: a.id,
        vehicleId: a.vehicle.id,
        plate: formatPlate(a.vehicle.plate_number),
        name: vehicleName(a.vehicle),
        isPrimary: a.is_primary,
      }))
    : initialVehicles.map((v) => ({ assignmentId: null, vehicleId: v.id, plate: formatPlate(v.plate_number), name: '', isPrimary: v.is_primary }));

  const options = useMemo(() => {
    const linked = new Set(rows.map((r) => r.vehicleId));
    return companyVehicles
      .filter((v) => !linked.has(v.id))
      .map((v) => ({ value: v.id, label: [formatPlate(v.plate_number), vehicleName(v)].filter(Boolean).join('  ·  ') }));
  }, [companyVehicles, rows]);

  const afterChange = async (message: string) => {
    await reload();
    onChanged?.();
    showToast(message);
  };

  const add = async () => {
    if (!adding) return;
    setBusy('__add__');
    try {
      // Same rule as on the vehicle page: the first driver of a vehicle
      // becomes its primary driver, anyone after that joins as an extra.
      const current = await listActiveVehicleDrivers(adding);
      await assignDriverToVehicle(adding, driverId, current.length === 0);
      setAdding(null);
      await afterChange(t('driver.vehicleAssigned'));
    } catch (err: any) {
      if (isPendingAssignmentSyncError(err)) { showToast(err.message); return; }
      showAlert(t('driver.assignFailed'), String(errorMessage(err, t('common.tryAgain'))));
    } finally {
      setBusy(null);
    }
  };

  const remove = (row: Row) => {
    if (!row.assignmentId) return;
    const assignmentId = row.assignmentId;
    showAlert(t('driver.removeVehicleTitle'), t('driver.removeVehicleConfirm', { plate: row.plate }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: async () => {
          setBusy(assignmentId);
          try {
            await unassignVehicleDriver(assignmentId);
            await afterChange(t('driver.vehicleRemoved'));
          } catch (err: any) {
            if (isPendingAssignmentSyncError(err)) { showToast(err.message); return; }
            showAlert(t('driver.removeVehicleFailed'), String(errorMessage(err, t('common.tryAgain'))));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  return (
    <View style={pageStyles.card}>
      {rows.length === 0 ? (
        <View style={styles.empty}>
          <DText style={pageStyles.mutedText}>{t('driver.noAssignedVehicle')}</DText>
        </View>
      ) : (
        rows.map((row, index) => (
          <View key={row.vehicleId} style={[styles.row, index > 0 && pageStyles.rowDivider]}>
            <HoverPressable
              style={styles.rowMain}
              hoverStyle={pageStyles.rowHover}
              onPress={() => onOpenVehicle(row.vehicleId)}
              accessibilityLabel={t('vehicle.openFile', { plate: row.plate })}
            >
              <MiniPlate plate={row.plate} />
              <View style={styles.rowText}>
                {!!row.name && <DText weight="semiBold" style={styles.name} numberOfLines={1}>{row.name}</DText>}
                <DText style={pageStyles.mutedText}>{row.isPrimary ? t('driver.primaryInVehicle') : t('driver.secondaryInVehicle')}</DText>
              </View>
              <Ionicons name={dirIcon('chevron-back')} size={15} color={DESKTOP_COLORS.inkFaint} />
            </HoverPressable>
            {canEdit && (
              <HoverPressable
                style={[styles.remove, (!row.assignmentId || busy === row.assignmentId) && styles.disabled]}
                hoverStyle={styles.removeHover}
                pressStyle={pageStyles.pressDown}
                disabled={!row.assignmentId || busy === row.assignmentId}
                onPress={() => remove(row)}
                accessibilityLabel={t('driver.removeVehicleLabel', { plate: row.plate })}
              >
                <Ionicons name="close" size={18} color={DESKTOP_TONES.bad.fg} />
              </HoverPressable>
            )}
          </View>
        ))
      )}

      {canEdit && (
        <View style={[styles.addRow, pageStyles.rowDivider]}>
          <View style={styles.addSelect}>
            <DesktopSelect
              value={adding}
              onChange={setAdding}
              options={options}
              placeholder={options.length ? t('driver.addVehicle') : t('driver.noFreeVehicles')}
              allowClear
            />
          </View>
          {!!adding && (
            <HoverPressable
              style={[pageStyles.primaryBtn, busy === '__add__' && styles.disabled]}
              hoverStyle={pageStyles.primaryBtnHover}
              pressStyle={pageStyles.pressDown}
              disabled={busy === '__add__'}
              onPress={() => void add()}
              accessibilityLabel={t('driver.assignSelectedVehicle')}
            >
              <DText weight="semiBold" style={pageStyles.primaryBtnText}>{busy === '__add__' ? t('common.assigning') : t('common.add')}</DText>
            </HoverPressable>
          )}
        </View>
      )}
    </View>
  );
}

function MiniPlate({ plate }: { plate: string }) {
  return (
    <View {...fixedLayoutProps} style={[styles.miniPlate, FIXED_LAYOUT_STYLE]} accessibilityRole="image" accessibilityLabel={t('vehicle.numberLabel', { plate })}>
      <View style={styles.miniPlateBand}>
        <DText weight="extraBold" style={styles.miniPlateBandText}>IL</DText>
      </View>
      <DLtrText weight="extraBold" style={styles.miniPlateText} numberOfLines={1}>{plate}</DLtrText>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { padding: 16 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', paddingStart: 10 },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, ...webOnly({ transition: 'background-color 150ms ease' }) },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 14.5, color: DESKTOP_COLORS.ink },
  remove: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  removeHover: { backgroundColor: DESKTOP_TONES.bad.bg },
  disabled: { opacity: 0.45 },
  addRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 12 },
  addSelect: { flex: 1, minWidth: 0 },
  miniPlate: { flexDirection: 'row', alignItems: 'stretch', height: 28, borderRadius: 5, borderWidth: 1.5, borderColor: '#16222E', overflow: 'hidden', backgroundColor: '#F7C600', ...webOnly({ backgroundImage: 'linear-gradient(180deg, #FFD83A, #F2C200)' }) },
  miniPlateBand: { width: 14, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 3, backgroundColor: '#1A55A6' },
  miniPlateBandText: { fontSize: 6.5, color: '#FFFFFF' },
  miniPlateText: { fontSize: 14.5, lineHeight: 25, color: '#111111', paddingHorizontal: 7, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
});
