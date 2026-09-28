import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { showAlert } from '../../lib/platformAlert';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Card, PrimaryButton } from '../ui';
import { Select } from '../ui/Select';
import { COLORS } from '../../lib/theme';
import type { DriverVehicleAssignment, Vehicle } from '../../lib/adminApi';
import { formatPlate } from '../../lib/plate';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DK, DKText, Plate, Pressy, STATUS } from '../driverKit';
import { t } from '../../lib/i18n';

export function DriverVehicleAssignmentsCard({
  driverVehicles,
  availableVehicles,
  addingVehicleId,
  busyId,
  onSelectVehicle,
  onAddVehicle,
  onOpenVehicle,
  onRemoveVehicle,
}: {
  driverVehicles: DriverVehicleAssignment[];
  availableVehicles: Vehicle[];
  addingVehicleId: string | null;
  busyId: string | null;
  onSelectVehicle: (value: string | null) => void;
  onAddVehicle: () => void;
  onOpenVehicle: (vehicleId: string) => void;
  onRemoveVehicle: (assignment: DriverVehicleAssignment) => void;
}) {
  const desktop = useIsDesktop();
  if (!desktop) {
    return (
      <View style={kit.wrap}>
        {driverVehicles.length === 0 ? (
          <DKText variant="body" color={DK.muted} style={kit.empty}>
            {t('driver.noVehiclesAssigned')}
          </DKText>
        ) : (
          driverVehicles.map((assignment) => (
            <View key={assignment.id} style={kit.row}>
              <Pressy onPress={() => onOpenVehicle(assignment.vehicle_id)} accessibilityLabel={t('vehicle.toFile', { v1: formatPlate(assignment.vehicle.plate_number) })} style={kit.main} pressScale={0.97}>
                <View style={kit.mainRow}>
                  <Plate number={formatPlate(assignment.vehicle.plate_number)} size="sm" />
                  <View style={[kit.badge, { backgroundColor: assignment.is_primary ? DK.accentSoft : DK.surfaceSunk }]}>
                    <DKText variant="micro" color={assignment.is_primary ? DK.accent : DK.muted}>
                      {assignment.is_primary ? t('vehicle.primaryDriver') : t('driver.secondary')}
                    </DKText>
                  </View>
                </View>
              </Pressy>
              <Pressy onPress={() => onRemoveVehicle(assignment)} disabled={busyId === assignment.id} accessibilityLabel={t('driver.removeAssignmentLabel')} style={kit.remove} pressScale={0.9}>
                <Ionicons name="trash-outline" size={18} color={STATUS.expired.fg} />
              </Pressy>
            </View>
          ))
        )}
        <View style={kit.addRow}>
          <View style={kit.select}>
            <Select
              value={addingVehicleId}
              onChange={onSelectVehicle}
              options={availableVehicles.map((vehicle) => ({ value: vehicle.id, label: formatPlate(vehicle.plate_number) }))}
              placeholder={availableVehicles.length ? t('driver.assignAnother') : t('driver.noFreeToAssign')}
              allowClear
            />
          </View>
          {!!addingVehicleId && (
            <Pressy onPress={onAddVehicle} disabled={busyId === '__new__'} haptic accessibilityLabel={t('driver.confirmAssign')} style={kit.confirm} pressScale={0.92}>
              <Ionicons name="checkmark" size={22} color="#FFFFFF" />
            </Pressy>
          )}
        </View>
      </View>
    );
  }
  return (
    <Card style={styles.card}>
      <AppText style={styles.infoLabel}>{t('driver.assignedVehicles')}</AppText>

      {driverVehicles.length === 0 ? (
        <AppText style={styles.noVehicles}>{t('driver.noVehiclesAssignedAlt')}</AppText>
      ) : (
        driverVehicles.map((assignment) => (
          <View key={assignment.id} style={styles.vehicleRow}>
            <TouchableOpacity
              style={styles.vehicleRowMain}
              activeOpacity={0.7}
              onPress={() => onOpenVehicle(assignment.vehicle_id)}
              accessibilityLabel={t('vehicle.openFilePlate', { plate_number: assignment.vehicle.plate_number })}
            >
              <AppText weight="bold" style={styles.vehicleValueText}>
                {formatPlate(assignment.vehicle.plate_number)}
              </AppText>
              <View style={[styles.badge, assignment.is_primary ? styles.badgePrimary : styles.badgeSecondary]}>
                <AppText weight="bold" style={[styles.badgeText, assignment.is_primary && styles.badgeTextPrimary]}>
                  {assignment.is_primary ? t('common.primary') : t('common.secondary')}
                </AppText>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onRemoveVehicle(assignment)}
              disabled={busyId === assignment.id}
              hitSlop={8}
              accessibilityLabel={t('driver.removeAssignment')}
            >
              <Ionicons name="trash-outline" size={17} color={COLORS.dangerText} />
            </TouchableOpacity>
          </View>
        ))
      )}

      <View style={styles.vehicleAddRow}>
        <View style={styles.vehicleSelectWrap}>
          <Select
            value={addingVehicleId}
            onChange={onSelectVehicle}
            options={availableVehicles.map((vehicle) => ({ value: vehicle.id, label: formatPlate(vehicle.plate_number) }))}
            placeholder={availableVehicles.length ? t('driver.addVehicleShort') : t('driver.noAvailableVehicles')}
            allowClear
          />
        </View>
        {!!addingVehicleId && (
          <PrimaryButton
            label={t('common.ok')}
            icon="checkmark-outline"
            style={styles.confirmBtn}
            loading={busyId === '__new__'}
            onPress={onAddVehicle}
          />
        )}
      </View>
    </Card>
  );
}

export function confirmVehicleRemoval(
  assignment: DriverVehicleAssignment,
  onConfirm: () => void,
) {
  showAlert(t('driver.removeAssignmentTitle'), t('driver.removeFromVehicleConfirm', { v1: formatPlate(assignment.vehicle.plate_number) }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('driver.removeAssignmentAction'), style: 'destructive', onPress: onConfirm },
  ]);
}

const styles = StyleSheet.create({
  card: { gap: 6 },
  infoLabel: { fontSize: 13, color: COLORS.textMuted },
  noVehicles: { fontSize: 13, color: COLORS.textFaint },
  vehicleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  vehicleRowMain: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flex: 1 },
  vehicleValueText: { fontSize: 14 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgePrimary: { backgroundColor: COLORS.accentSoft },
  badgeSecondary: { backgroundColor: COLORS.field },
  badgeText: { fontSize: 10.5, color: COLORS.textMuted },
  badgeTextPrimary: { color: COLORS.accent },
  vehicleAddRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 4 },
  vehicleSelectWrap: { flex: 1, minHeight: 48, justifyContent: 'center' },
  confirmBtn: { marginTop: 0 },
});

const kit = StyleSheet.create({
  wrap: { gap: 10 },
  empty: { paddingVertical: 4 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, minHeight: 56 },
  main: { flex: 1 },
  mainRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  remove: { width: 44, height: 44, borderRadius: 14, backgroundColor: STATUS.expired.soft, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  select: { flex: 1 },
  confirm: { width: 52, height: 52, borderRadius: 16, backgroundColor: DK.accent, alignItems: 'center', justifyContent: 'center' },
});
