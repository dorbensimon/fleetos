import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, useToast } from './ui';
import { Select } from './ui/Select';
import { COLORS, RADIUS, SPACING } from '../lib/theme';
import { formatPhone } from '../lib/phone';
import {
  VehicleDriverWithProfile,
  assignDriverToVehicle,
  unassignVehicleDriver,
  setPrimaryVehicleDriver,
} from '../lib/adminApi';

/**
 * Up to 2 active driver assignments for one vehicle (primary + secondary),
 * with add/remove/promote actions — the one place this UI is built, reused
 * by both VehicleFormScreen (editing an existing vehicle) and
 * VehicleDetailScreen's "נהגים" tab, per the product decision that these
 * must be the same experience, not two separate implementations.
 *
 * Only usable once the vehicle actually exists (has an id): `vehicle_drivers`
 * rows require a real `vehicle_id` foreign key, so this has no role in the
 * "create a new vehicle" flow — see VehicleFormScreen for how that's handled.
 */
export function VehicleDriversEditor({
  vehicleId,
  assignments,
  driverOptions,
  onChanged,
  onOpenDriver,
}: {
  vehicleId: string;
  /** Active assignments for this vehicle, primary first. */
  assignments: VehicleDriverWithProfile[];
  /** Every driver in the company, for the "add" picker. */
  driverOptions: { value: string; label: string }[];
  onChanged: () => void | Promise<void>;
  onOpenDriver?: (driverId: string) => void;
}) {
  const { showToast } = useToast();
  const [addingDriverId, setAddingDriverId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const assignedIds = new Set(assignments.map((a) => a.driver_id));
  const availableOptions = driverOptions.filter((d) => !assignedIds.has(d.value));
  const canAddMore = assignments.length < 2;

  const addDriver = async () => {
    if (!addingDriverId) return;
    setBusyId('__new__');
    try {
      // If the vehicle has no active drivers yet, the first one becomes
      // primary automatically; only additional drivers start as secondary.
      await assignDriverToVehicle(vehicleId, addingDriverId, assignments.length === 0);
      setAddingDriverId(null);
      await onChanged();
      showToast('הנהג שויך לרכב');
    } catch (err: any) {
      Alert.alert('שיוך הנהג נכשל', String(err?.message ?? 'נסה שוב'));
    } finally {
      setBusyId(null);
    }
  };

  const makePrimary = async (a: VehicleDriverWithProfile) => {
    setBusyId(a.id);
    try {
      await setPrimaryVehicleDriver(vehicleId, a.id);
      await onChanged();
      showToast('נקבע כנהג ראשי');
    } catch (err: any) {
      Alert.alert('הפעולה נכשלה', String(err?.message ?? 'נסה שוב'));
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemove = (a: VehicleDriverWithProfile) => {
    Alert.alert('הסרת שיוך נהג', `להסיר את ${a.full_name ?? 'הנהג'} מהרכב?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'הסר שיוך',
        style: 'destructive',
        onPress: async () => {
          setBusyId(a.id);
          try {
            await unassignVehicleDriver(a.id);
            await onChanged();
            showToast('השיוך הוסר');
          } catch (err: any) {
            Alert.alert('הסרת השיוך נכשלה', String(err?.message ?? 'נסה שוב'));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.wrap}>
      {assignments.length === 0 ? (
        <AppText style={styles.empty}>לא משויכים נהגים לרכב זה</AppText>
      ) : (
        assignments.map((a) => (
          <View key={a.id} style={styles.row}>
            <TouchableOpacity
              style={styles.rowMain}
              activeOpacity={onOpenDriver ? 0.7 : 1}
              disabled={!onOpenDriver}
              onPress={() => onOpenDriver?.(a.driver_id)}
              accessibilityLabel={`פתח את פרטי הנהג ${a.full_name ?? ''}`}
            >
              <View style={styles.rowText}>
                <View style={styles.nameRow}>
                  <AppText weight="bold" style={styles.name} numberOfLines={1}>
                    {a.full_name ?? 'ללא שם'}
                  </AppText>
                  <View style={[styles.badge, a.is_primary ? styles.badgePrimary : styles.badgeSecondary]}>
                    <AppText weight="bold" style={[styles.badgeText, a.is_primary && styles.badgeTextPrimary]}>
                      {a.is_primary ? 'ראשי' : 'משני'}
                    </AppText>
                  </View>
                </View>
                <AppText style={styles.meta}>{a.phone ? formatPhone(a.phone) : '—'}</AppText>
              </View>
            </TouchableOpacity>

            <View style={styles.rowActions}>
              {!a.is_primary && (
                <TouchableOpacity
                  onPress={() => makePrimary(a)}
                  disabled={busyId === a.id}
                  hitSlop={8}
                  style={styles.actionBtn}
                  accessibilityLabel="קבע כנהג ראשי"
                >
                  <Ionicons name="star-outline" size={18} color={COLORS.accent} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => confirmRemove(a)}
                disabled={busyId === a.id}
                hitSlop={8}
                style={styles.actionBtn}
                accessibilityLabel="הסר שיוך נהג"
              >
                <Ionicons name="trash-outline" size={18} color={COLORS.dangerText} />
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {canAddMore ? (
        <View style={styles.addRow}>
          <View style={styles.addSelect}>
            <Select
              value={addingDriverId}
              onChange={setAddingDriverId}
              options={availableOptions}
              placeholder={availableOptions.length ? 'הוסף נהג' : 'אין נהגים זמינים להוספה'}
              allowClear
            />
          </View>
          {!!addingDriverId && (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={addDriver}
              disabled={busyId === '__new__'}
              accessibilityLabel="אשר הוספת נהג"
            >
              <Ionicons name="checkmark" size={19} color={COLORS.textInverse} />
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <AppText style={styles.maxHint}>הגעת למספר הנהגים המרבי לרכב (2)</AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.sm },
  empty: { fontSize: 13, color: COLORS.textFaint, paddingVertical: SPACING.sm },

  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  rowMain: { flex: 1 },
  rowText: { flex: 1, gap: 3, alignItems: 'flex-end', paddingRight: 12 },
  nameRow: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-start', gap: 8 },
  name: { fontSize: 14.5, flexShrink: 1 },
  meta: { fontSize: 12.5, color: COLORS.textMuted },

  badge: { borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgePrimary: { backgroundColor: COLORS.accentSoft },
  badgeSecondary: { backgroundColor: COLORS.field },
  badgeText: { fontSize: 10.5, color: COLORS.textMuted },
  badgeTextPrimary: { color: COLORS.accent },

  rowActions: { flexDirection: 'row-reverse', gap: SPACING.sm },
  actionBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },

  addRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.sm, paddingTop: SPACING.xs },
  addSelect: { flex: 1 },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  maxHint: { fontSize: 12, color: COLORS.textFaint, paddingTop: SPACING.xs },
});
