import React, { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Screen,
  ScreenHeader,
  AppText,
  Card,
  InfoRow,
  LoadingState,
  SecondaryButton,
  PrimaryButton,
  useToast,
} from '../../components/ui';
import { Select } from '../../components/ui/Select';
import { COLORS, SPACING } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import {
  getDriver,
  listVehicles,
  updateVehicle,
  listDepartments,
  getUserEmail,
  DriverRow,
  Vehicle,
  Department,
} from '../../lib/adminApi';
import { formatPlate } from '../../lib/plate';
import { formatPhone } from '../../lib/phone';
import { RootStackParamList } from '../../navigation/types';

/**
 * Read-only view of exactly the fields DriverFormScreen collects -
 * reached by tapping the driver's name on their card, for a quick
 * "what's actually on file" check without opening the edit form.
 *
 * The assigned-vehicle row is the one exception that's actually
 * editable here: that relationship lives on the vehicle row
 * (primary_driver_id), not on the driver, so DriverFormScreen has no
 * way to touch it - this screen is where it gets reassigned instead.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverPersonalDetails'>;

export default function DriverPersonalDetailsScreen({ route, navigation }: Props) {
  const { driverId } = route.params;
  const { companyId, company } = useCompany();
  const { showToast } = useToast();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingVehicle, setEditingVehicle] = useState(false);
  const [pendingVehicleId, setPendingVehicleId] = useState<string | null>(null);
  const [savingVehicle, setSavingVehicle] = useState(false);

  const load = useCallback(async () => {
    const [d, v, deps, mail] = await Promise.all([
      getDriver(driverId),
      companyId ? listVehicles(companyId) : [],
      companyId ? listDepartments(companyId) : [],
      companyId ? getUserEmail(driverId, companyId) : null,
    ]);
    setDriver(d);
    setVehicles(v);
    setDepartments(deps);
    setEmail(mail);
  }, [driverId, companyId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        await load();
        if (active) setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [load])
  );

  const currentVehicle = vehicles.find((v) => v.primary_driver_id === driverId) ?? null;
  const departmentName = departments.find((d) => d.id === driver?.department_id)?.name ?? null;

  const confirmVehicleChange = async () => {
    setSavingVehicle(true);
    try {
      if (currentVehicle && currentVehicle.id !== pendingVehicleId) {
        await updateVehicle(currentVehicle.id, { primary_driver_id: null });
      }
      if (pendingVehicleId) {
        await updateVehicle(pendingVehicleId, { primary_driver_id: driverId });
      }
      await load();
      setEditingVehicle(false);
      setPendingVehicleId(null);
      showToast('נשמר בהצלחה');
    } catch (err: any) {
      Alert.alert('שינוי הרכב נכשל', String(err?.message ?? 'נסה שוב'));
    } finally {
      setSavingVehicle(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="פרטי נהג"
        subtitle={driver?.full_name ?? undefined}
        onBack={() => navigation.goBack()}
        right={
          <SecondaryButton
            label="עריכה"
            icon="pencil-outline"
            onPress={() => navigation.navigate('DriverForm', { driverId })}
          />
        }
      />

      {loading ? (
        <LoadingState />
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            <InfoRow label="שם מלא" value={driver?.full_name} />
            <InfoRow label="חברה" value={company?.name} />
            <InfoRow label="מייל להתחברות" value={email} />
            <InfoRow label="טלפון" value={driver?.phone ? formatPhone(driver.phone) : null} />
            <InfoRow label="תעודת זהות" value={driver?.national_id} />
            <InfoRow label="מספר עובד" value={driver?.employee_number} />
            <InfoRow label="מחלקה" value={departmentName} />
            <InfoRow label="דרגת רישיון" value={driver?.license_classes} />
            <InfoRow label="תוקף רישיון" value={driver?.license_expiry} />

            {editingVehicle ? (
              <View style={styles.vehicleEditRow}>
                <AppText style={styles.infoLabel}>רכב משויך</AppText>
                <View style={styles.vehicleSelectWrap}>
                  <Select
                    value={pendingVehicleId}
                    onChange={setPendingVehicleId}
                    options={vehicles.map((v) => ({ value: v.id, label: formatPlate(v.plate_number) }))}
                    placeholder="ללא רכב"
                    allowClear
                  />
                </View>
                {pendingVehicleId !== (currentVehicle?.id ?? null) && (
                  <PrimaryButton
                    label="אישור"
                    icon="checkmark-outline"
                    style={styles.confirmBtn}
                    loading={savingVehicle}
                    onPress={confirmVehicleChange}
                  />
                )}
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  setPendingVehicleId(currentVehicle?.id ?? null);
                  setEditingVehicle(true);
                }}
                activeOpacity={0.6}
              >
                <InfoRow
                  label="רכב משויך"
                  value={driver?.vehicle_plate}
                  right={
                    <View style={styles.vehicleValueRow}>
                      <AppText weight="bold" style={styles.vehicleValueText}>
                        {driver?.vehicle_plate ? formatPlate(driver.vehicle_plate) : 'ללא רכב'}
                      </AppText>
                      <AppText style={styles.changeText}>שנה</AppText>
                    </View>
                  }
                />
              </TouchableOpacity>
            )}
          </Card>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  card: { margin: SPACING.lg, gap: 4 },
  infoLabel: { fontSize: 13, color: COLORS.textMuted },
  vehicleEditRow: { paddingVertical: 8, gap: 6 },
  vehicleSelectWrap: { minHeight: 48, justifyContent: 'center' },
  vehicleValueRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  vehicleValueText: { fontSize: 14 },
  changeText: { fontSize: 12, color: COLORS.accent },
  confirmBtn: { marginTop: 2 },
});
