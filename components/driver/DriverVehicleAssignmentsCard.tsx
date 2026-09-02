import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Card, PrimaryButton } from '../ui';
import { Select } from '../ui/Select';
import { COLORS } from '../../lib/theme';
import type { DriverVehicleAssignment, Vehicle } from '../../lib/adminApi';
import { formatPlate } from '../../lib/plate';

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
  return (
    <Card style={styles.card}>
      <AppText style={styles.infoLabel}>רכבים משויכים</AppText>

      {driverVehicles.length === 0 ? (
        <AppText style={styles.noVehicles}>לא משויכים רכבים לנהג זה</AppText>
      ) : (
        driverVehicles.map((assignment) => (
          <View key={assignment.id} style={styles.vehicleRow}>
            <TouchableOpacity
              style={styles.vehicleRowMain}
              activeOpacity={0.7}
              onPress={() => onOpenVehicle(assignment.vehicle_id)}
              accessibilityLabel={`פתח את תיק הרכב ${assignment.vehicle.plate_number}`}
            >
              <AppText weight="bold" style={styles.vehicleValueText}>
                {formatPlate(assignment.vehicle.plate_number)}
              </AppText>
              <View style={[styles.badge, assignment.is_primary ? styles.badgePrimary : styles.badgeSecondary]}>
                <AppText weight="bold" style={[styles.badgeText, assignment.is_primary && styles.badgeTextPrimary]}>
                  {assignment.is_primary ? 'ראשי' : 'משני'}
                </AppText>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onRemoveVehicle(assignment)}
              disabled={busyId === assignment.id}
              hitSlop={8}
              accessibilityLabel="הסר שיוך רכב"
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
            placeholder={availableVehicles.length ? 'הוסף רכב' : 'אין רכבים זמינים להוספה'}
            allowClear
          />
        </View>
        {!!addingVehicleId && (
          <PrimaryButton
            label="אישור"
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
  Alert.alert('הסרת שיוך רכב', `להסיר את הנהג מהרכב ${formatPlate(assignment.vehicle.plate_number)}?`, [
    { text: 'ביטול', style: 'cancel' },
    { text: 'הסר שיוך', style: 'destructive', onPress: onConfirm },
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
