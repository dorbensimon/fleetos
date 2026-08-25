import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, TouchableOpacity, Linking, Alert, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Screen,
  AppText,
  FilterChips,
  LoadingState,
  EmptyState,
  AdminBottomBar,
  AdminGlassHeader,
} from '../../components/ui';
import { ToggleValue } from '../../components/ui/DriversVehiclesToggle';
import { DriverCard } from '../../components/fleet/DriverCard';
import { VehicleCard } from '../../components/fleet/VehicleCard';
import { ExportReportSheet } from '../../components/fleet/ExportReportSheet';
import { COLORS, RADIUS, SPACING, SUBTLE_SHADOW, expiryState } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import {
  listDrivers,
  DriverRow,
  listVehicles,
  listComplianceForOwners,
  listActiveVehicleDriversForVehicles,
  listDepartments,
  updateVehicle,
  Vehicle,
  VehicleDriverWithProfile,
  ComplianceItem,
} from '../../lib/adminApi';
import { exportDriversReport, ReportCategory } from '../../lib/driverReport';
import { RootStackParamList } from '../../navigation/types';

/**
 * A2/A4 — the fleet screen. "Drivers" and "Vehicles" are the same screen:
 * one shared glass header (search + the segmented toggle) with two list
 * bodies stacked underneath it. Switching modes never pushes a new
 * screen — there both lists stay mounted and simply crossfade, so there's
 * no back button, no swipe-back gesture, and no left/right slide; the old
 * list fades out just as the new one fades in, fast enough to read as one
 * screen whose content changed rather than a navigation.
 *
 * The per-row cards (DriverCard/VehicleCard), their shared stat-bar cell
 * (StatCell) and tone/formatting math (lib/fleetCardHelpers) live in their
 * own files — this screen only owns data loading, filtering, and the
 * crossfade between the two lists.
 */

type LicenseFilter = 'all' | 'valid' | 'soon' | 'expired' | 'no_vehicle';
type StatusFilter = 'all' | 'active' | 'maintenance' | 'disabled' | 'archived';

const CROSSFADE_MS = 140;

export default function FleetScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { companyId, company } = useCompany();

  const [mode, setMode] = useState<ToggleValue>('drivers');

  /* ---------------------------------------------------------------- */
  /* Drivers                                                           */
  /* ---------------------------------------------------------------- */

  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [driversRefreshing, setDriversRefreshing] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>('all');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingCategory, setExportingCategory] = useState<ReportCategory | null>(null);

  const loadDrivers = useCallback(async () => {
    if (!companyId) return;
    setDrivers(await listDrivers(companyId));
  }, [companyId]);

  const filteredDrivers = useMemo(() => {
    const q = driverSearch.trim().toLowerCase();
    return drivers.filter((d) => {
      const state = expiryState(d.license_expiry);

      const matchesFilter =
        licenseFilter === 'all' ||
        (licenseFilter === 'valid' && state === 'ok') ||
        (licenseFilter === 'soon' && state === 'soon') ||
        (licenseFilter === 'expired' && state === 'expired') ||
        (licenseFilter === 'no_vehicle' && !d.vehicle_plate);

      if (!matchesFilter) return false;
      if (!q) return true;

      return (
        (d.full_name ?? '').toLowerCase().includes(q) ||
        (d.national_id ?? '').includes(q) ||
        (d.employee_number ?? '').toLowerCase().includes(q) ||
        (d.phone ?? '').includes(q)
      );
    });
  }, [drivers, driverSearch, licenseFilter]);

  const driverCounts = useMemo(() => {
    const byState = (s: string) => drivers.filter((d) => expiryState(d.license_expiry) === s).length;
    return {
      all: drivers.length,
      soon: byState('soon'),
      expired: byState('expired'),
      noVehicle: drivers.filter((d) => !d.vehicle_plate).length,
    };
  }, [drivers]);

  const call = (phone: string | null) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
  };

  const runExport = async (category: ReportCategory) => {
    if (!company) return;
    setExportingCategory(category);
    try {
      await exportDriversReport(company, drivers, category);
      setExportMenuOpen(false);
    } catch (err: any) {
      Alert.alert('ייצוא הדוח נכשל', String(err?.message ?? 'נסה שוב'));
    } finally {
      setExportingCategory(null);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Vehicles                                                          */
  /* ---------------------------------------------------------------- */

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [compliance, setCompliance] = useState<Map<string, ComplianceItem[]>>(new Map());
  const [vehicleDrivers, setVehicleDrivers] = useState<Map<string, VehicleDriverWithProfile[]>>(new Map());
  const [departmentNames, setDepartmentNames] = useState<Map<string, string>>(new Map());
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [vehiclesRefreshing, setVehiclesRefreshing] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const loadVehicles = useCallback(async () => {
    if (!companyId) return;
    const rows = await listVehicles(companyId, true);
    setVehicles(rows);
    setCompliance(await listComplianceForOwners('vehicle', rows.map((v) => v.id)));
    setVehicleDrivers(await listActiveVehicleDriversForVehicles(rows.map((v) => v.id)));

    const departments = await listDepartments(companyId);
    setDepartmentNames(new Map(departments.map((d) => [d.id, d.name])));
  }, [companyId]);

  const filteredVehicles = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase();
    return vehicles.filter((v) => {
      const matchesStatus = status === 'all' ? v.status !== 'archived' : v.status === status;
      if (!matchesStatus) return false;
      if (!q) return true;
      const driverNamesForVehicle = (vehicleDrivers.get(v.id) ?? [])
        .map((d) => (d.full_name ?? '').toLowerCase())
        .join(' ');
      return (
        v.plate_number.toLowerCase().includes(q) ||
        (v.model ?? '').toLowerCase().includes(q) ||
        (v.manufacturer ?? '').toLowerCase().includes(q) ||
        (v.internal_code ?? '').toLowerCase().includes(q) ||
        driverNamesForVehicle.includes(q)
      );
    });
  }, [vehicles, vehicleSearch, status, vehicleDrivers]);

  const vehicleCounts = useMemo(
    () => ({
      all: vehicles.filter((v) => v.status !== 'archived').length,
      active: vehicles.filter((v) => v.status === 'active').length,
      maintenance: vehicles.filter((v) => v.status === 'maintenance').length,
      disabled: vehicles.filter((v) => v.status === 'disabled').length,
      archived: vehicles.filter((v) => v.status === 'archived').length,
    }),
    [vehicles]
  );

  const restoreVehicle = async (vehicleId: string) => {
    await updateVehicle(vehicleId, { status: 'active' });
    await loadVehicles();
  };

  /* ---------------------------------------------------------------- */
  /* Shared load + crossfade                                          */
  /* ---------------------------------------------------------------- */

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Every time this screen regains focus (including returning from a
      // pushed detail screen) the toggle resets to "drivers" — it never
      // remembers whatever mode was left active before navigating away.
      setMode('drivers');
      (async () => {
        setDriversLoading(true);
        setVehiclesLoading(true);
        try {
          await Promise.all([loadDrivers(), loadVehicles()]);
        } finally {
          if (active) {
            setDriversLoading(false);
            setVehiclesLoading(false);
          }
        }
      })();
      return () => {
        active = false;
      };
    }, [loadDrivers, loadVehicles])
  );

  const onRefreshDrivers = async () => {
    setDriversRefreshing(true);
    await loadDrivers();
    setDriversRefreshing(false);
  };

  const onRefreshVehicles = async () => {
    setVehiclesRefreshing(true);
    await loadVehicles();
    setVehiclesRefreshing(false);
  };

  const driversOpacity = useRef(new Animated.Value(1)).current;
  const vehiclesOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(driversOpacity, {
        toValue: mode === 'drivers' ? 1 : 0,
        duration: CROSSFADE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(vehiclesOpacity, {
        toValue: mode === 'vehicles' ? 1 : 0,
        duration: CROSSFADE_MS,
        useNativeDriver: true,
      }),
    ]).start();
  }, [mode, driversOpacity, vehiclesOpacity]);

  return (
    <Screen>
      <AdminGlassHeader
        query={mode === 'drivers' ? driverSearch : vehicleSearch}
        onChangeQuery={mode === 'drivers' ? setDriverSearch : setVehicleSearch}
        searchPlaceholder={mode === 'drivers' ? 'חפש לפי שם, ת.ז או מספר עובד' : 'חיפוש לפי מספר רישוי'}
        toggleValue={mode}
        onToggleChange={setMode}
      />

      <View style={styles.body}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: driversOpacity }]}
          pointerEvents={mode === 'drivers' ? 'auto' : 'none'}
        >
          {driversLoading ? (
            <LoadingState />
          ) : (
            <FlatList
              data={filteredDrivers}
              keyExtractor={(d) => d.id}
              contentContainerStyle={driverStyles.list}
              refreshControl={<RefreshControl refreshing={driversRefreshing} onRefresh={onRefreshDrivers} />}
              ListHeaderComponent={
                <>
                  <View style={driverStyles.kpiRow}>
                    <TouchableOpacity
                      style={driverStyles.kpiCard}
                      activeOpacity={0.8}
                      onPress={() => setExportMenuOpen(true)}
                    >
                      <Ionicons name="document-text-outline" size={17} color={COLORS.textMuted} />
                      <AppText weight="bold" style={driverStyles.kpiLabel}>
                        ייצוא דוח
                      </AppText>
                    </TouchableOpacity>
                  </View>

                  <View style={driverStyles.chipsWrap}>
                    <FilterChips<LicenseFilter>
                      value={licenseFilter}
                      onChange={setLicenseFilter}
                      options={[
                        {
                          value: 'all',
                          label: 'הכל',
                          count: driverCounts.all,
                          badgeColor: COLORS.accent,
                          icon: 'people-outline',
                        },
                        {
                          value: 'soon',
                          label: 'רישיון קרוב לפוג',
                          count: driverCounts.soon,
                          badgeColor: COLORS.warnText,
                          icon: 'hourglass-outline',
                        },
                        {
                          value: 'expired',
                          label: 'רישיון פג',
                          count: driverCounts.expired,
                          badgeColor: COLORS.dangerText,
                          icon: 'warning',
                        },
                        {
                          value: 'no_vehicle',
                          label: 'ללא רכב',
                          count: driverCounts.noVehicle,
                          badgeColor: COLORS.neutralText,
                          icon: 'ban-outline',
                        },
                      ]}
                    />
                  </View>
                </>
              }
              ListEmptyComponent={
                <EmptyState
                  icon="people-outline"
                  title={drivers.length === 0 ? 'עדיין אין נהגים' : 'לא נמצאו נהגים'}
                  hint={drivers.length === 0 ? 'הוסף את הנהג הראשון של החברה' : undefined}
                />
              }
              ListFooterComponent={
                <AdminBottomBar
                  actionLabel="נהג חדש"
                  actionIcon="add"
                  onAction={() => navigation.navigate('DriverForm', {})}
                />
              }
              renderItem={({ item }) => (
                <DriverCard
                  item={item}
                  onPress={() => navigation.navigate('DriverDetail', { driverId: item.id })}
                  onPressVehicle={() => navigation.navigate('VehicleDetail', { vehicleId: item.vehicle_id! })}
                  onCall={() => call(item.phone)}
                />
              )}
            />
          )}
        </Animated.View>

        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: vehiclesOpacity }]}
          pointerEvents={mode === 'vehicles' ? 'auto' : 'none'}
        >
          {vehiclesLoading ? (
            <LoadingState />
          ) : (
            <FlatList
              data={filteredVehicles}
              keyExtractor={(v) => v.id}
              contentContainerStyle={vehicleStyles.list}
              refreshControl={<RefreshControl refreshing={vehiclesRefreshing} onRefresh={onRefreshVehicles} />}
              ListHeaderComponent={
                <View style={vehicleStyles.controls}>
                  <FilterChips<StatusFilter>
                    value={status}
                    onChange={setStatus}
                    options={[
                      { value: 'all', label: 'הכל', count: vehicleCounts.all, badgeColor: COLORS.accent },
                      { value: 'active', label: 'פעיל', count: vehicleCounts.active, badgeColor: COLORS.okText },
                      {
                        value: 'maintenance',
                        label: 'בטיפול',
                        count: vehicleCounts.maintenance,
                        badgeColor: COLORS.warnText,
                      },
                      {
                        value: 'disabled',
                        label: 'מושבת',
                        count: vehicleCounts.disabled,
                        badgeColor: COLORS.dangerText,
                      },
                      {
                        value: 'archived',
                        label: 'בארכיון',
                        count: vehicleCounts.archived,
                        badgeColor: COLORS.textFaint,
                      },
                    ]}
                  />
                </View>
              }
              ListEmptyComponent={
                <EmptyState
                  icon="car-outline"
                  title={vehicles.length === 0 ? 'עדיין אין רכבים' : 'לא נמצאו רכבים'}
                  hint={vehicles.length === 0 ? 'הוסף את הרכב הראשון של החברה' : undefined}
                />
              }
              ListFooterComponent={
                <AdminBottomBar
                  actionLabel="רכב חדש"
                  actionIcon="add"
                  onAction={() => navigation.navigate('VehicleForm', {})}
                />
              }
              renderItem={({ item }) => (
                <VehicleCard
                  item={item}
                  compliance={compliance}
                  vehicleDrivers={vehicleDrivers}
                  departmentNames={departmentNames}
                  onPress={() => navigation.navigate('VehicleDetail', { vehicleId: item.id })}
                  onRestore={() => restoreVehicle(item.id)}
                />
              )}
            />
          )}
        </Animated.View>
      </View>

      <ExportReportSheet
        visible={exportMenuOpen}
        exportingCategory={exportingCategory}
        onClose={() => setExportMenuOpen(false)}
        onSelect={runExport}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, position: 'relative' },
});

const driverStyles = StyleSheet.create({
  kpiRow: {
    flexDirection: 'row-reverse',
    gap: SPACING.sm,
    paddingTop: SPACING.md,
  },
  kpiCard: {
    flex: 1,
    position: 'relative',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    paddingVertical: 12,
    paddingHorizontal: 9,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
    ...SUBTLE_SHADOW,
  },
  kpiLabel: { fontSize: 11, lineHeight: 13, flexShrink: 1 },

  chipsWrap: { paddingTop: SPACING.md },

  list: { paddingTop: SPACING.md, gap: SPACING.md, paddingBottom: 28 },
});

const vehicleStyles = StyleSheet.create({
  controls: { paddingTop: SPACING.md, gap: SPACING.md },

  list: { paddingTop: SPACING.md, gap: SPACING.md, paddingBottom: 28 },
});
