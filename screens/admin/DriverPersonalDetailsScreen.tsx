import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Screen,
  ScreenHeader,
  AppText,
  Card,
  InfoRow,
  LoadingState,
  ErrorState,
  SecondaryButton,
  useToast,
} from '../../components/ui';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { COLORS, SPACING, formatDate } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import {
  getDriver,
  listVehicles,
  listDepartments,
  listActiveDriverVehicles,
  listActiveVehicleDrivers,
  assignDriverToVehicle,
  unassignVehicleDriver,
  getUserEmail,
  DriverRow,
  Vehicle,
  Department,
  DriverVehicleAssignment,
} from '../../lib/adminApi';
import { formatPhone } from '../../lib/phone';
import { RootStackParamList } from '../../navigation/types';
import { DriverVehicleAssignmentsCard, confirmVehicleRemoval } from '../../components/driver/DriverVehicleAssignmentsCard';
import { departmentNameById } from '../../lib/driverFields';

/**
 * Read-only view of exactly the fields DriverFormScreen collects -
 * reached by tapping the driver's name on their card, for a quick
 * "what's actually on file" check without opening the edit form.
 *
 * The assigned-vehicles row is the one exception that's actually
 * editable here: that relationship lives in `vehicle_drivers`, not on
 * the driver row, so DriverFormScreen has no way to touch it - this
 * screen is where it gets managed instead. A driver can be actively
 * assigned to more than one vehicle (e.g. primary on one, secondary on
 * another), so this is a list, not a single field — and adding a
 * vehicle here never removes any vehicle already assigned to the
 * driver (same "never overwrite" rule as VehicleFormScreen/
 * VehicleDetailScreen, just from the other direction).
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverPersonalDetails'>;

export default function DriverPersonalDetailsScreen({ route, navigation }: Props) {
  const { driverId } = route.params;
  const { companyId, company } = useCompany();
  const { showToast } = useToast();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [driverVehicles, setDriverVehicles] = useState<DriverVehicleAssignment[]>([]);
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addingVehicleId, setAddingVehicleId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [d, dv, v, deps, mail] = await Promise.all([
      getDriver(driverId),
      listActiveDriverVehicles(driverId),
      companyId ? listVehicles(companyId) : [],
      companyId ? listDepartments(companyId) : [],
      companyId ? getUserEmail(driverId, companyId) : null,
    ]);
    setDriver(d);
    setDriverVehicles(dv);
    setAllVehicles(v);
    setDepartments(deps);
    setEmail(mail);
  }, [driverId, companyId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        setLoadError(null);
        try {
          await load();
        } catch (err: any) {
          if (active) setLoadError(err?.message ?? 'טעינת פרטי הנהג נכשלה');
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [load])
  );

  const departmentName = departmentNameById(departments, driver?.department_id);

  const assignedVehicleIds = new Set(driverVehicles.map((dv) => dv.vehicle_id));
  const availableVehicles = allVehicles.filter((v) => !assignedVehicleIds.has(v.id));

  const addVehicle = async () => {
    if (!addingVehicleId) return;
    // Belt-and-suspenders against an unintended duplicate: the API/DB also
    // reject this, but checking here first avoids even issuing the request.
    if (assignedVehicleIds.has(addingVehicleId)) {
      showToast('הנהג כבר משויך לרכב זה');
      setAddingVehicleId(null);
      return;
    }
    setBusyId('__new__');
    try {
      // Mirror the vehicle-side flow: the first active driver on a vehicle
      // becomes primary automatically, later additions stay secondary.
      const targetVehicleAssignments = await listActiveVehicleDrivers(addingVehicleId);
      await assignDriverToVehicle(addingVehicleId, driverId, targetVehicleAssignments.length === 0);
      setAddingVehicleId(null);
      await load();
      showToast('הרכב שויך לנהג');
    } catch (err: any) {
      Alert.alert('שיוך הרכב נכשל', String(err?.message ?? 'נסה שוב'));
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemoveVehicle = (assignment: DriverVehicleAssignment) => {
    confirmVehicleRemoval(assignment, async () => {
      setBusyId(assignment.id);
      try {
        await unassignVehicleDriver(assignment.id);
        await load();
        showToast('השיוך הוסר');
      } catch (err: any) {
        Alert.alert('הסרת השיוך נכשלה', String(err?.message ?? 'נסה שוב'));
      } finally {
        setBusyId(null);
      }
    });
  };

  return (
    <Screen>
      <AdminGradientBackground />
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
      ) : loadError ? (
        <ErrorState
          message={loadError}
          onRetry={() => {
            setLoading(true);
            setLoadError(null);
            load()
              .catch((err: any) => setLoadError(err?.message ?? 'טעינת פרטי הנהג נכשלה'))
              .finally(() => setLoading(false));
          }}
        />
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

            <DriverVehicleAssignmentsCard
              driverVehicles={driverVehicles}
              availableVehicles={availableVehicles}
              addingVehicleId={addingVehicleId}
              busyId={busyId}
              onSelectVehicle={setAddingVehicleId}
              onAddVehicle={addVehicle}
              onOpenVehicle={(vehicleId) => navigation.navigate('VehicleDetail', { vehicleId })}
              onRemoveVehicle={confirmRemoveVehicle}
            />

            <InfoRow label="תאריך הצטרפות לאפליקציה" value={driver?.created_at ? formatDate(driver.created_at) : null} />
          </Card>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  card: { margin: SPACING.lg, gap: 4 },
});
