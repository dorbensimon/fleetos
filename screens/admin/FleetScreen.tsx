import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, RefreshControl, Linking, Alert, Animated, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen, AppText, EmptyState, ErrorState } from '../../components/ui';
import { ToggleValue } from '../../components/ui/DriversVehiclesToggle';
import { DriverCard } from '../../components/fleet/DriverCard';
import { VehicleCard } from '../../components/fleet/VehicleCard';
import { ExportReportSheet } from '../../components/fleet/ExportReportSheet';
import { DriverListSkeleton, VehicleListSkeleton } from '../../components/fleet/FleetListSkeleton';
import { FleetHero, FleetStat, heroNavHeight, HERO_CONTENT_HEIGHT, HERO_TRAVEL } from '../../components/fleet/FleetHero';
import { FleetDock, FLEET_DOCK_CLEARANCE } from '../../components/fleet/FleetDock';
import { FleetAddButton } from '../../components/fleet/FleetAddButton';
import { FleetFilterChips } from '../../components/fleet/FleetFilterChips';
import { FLEET_COLORS, FLEET_FONT, FLEET_SHADOWS } from '../../components/fleet/fleetTheme';
import { SPACING, expiryState } from '../../lib/theme';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * A2/A4 — the fleet screen. "Drivers" and "Vehicles" are the same screen:
 * a shared blue-gradient hero (glanceable status cubes + search + export)
 * with two list bodies stacked underneath it. Switching modes never
 * pushes a new screen — both lists stay mounted and crossfade, so
 * there's no back button, no swipe-back gesture, and no slide.
 *
 * Each list is its own rounded white "sheet" that rests below the hero
 * and rises to meet it as you scroll (tied 1:1 to that list's own
 * `scrollY`, clamped once it reaches `HERO_TRAVEL`) while the hero's stat
 * cubes fade away over the same range — the search field and export
 * button settle just under the nav row once collapsed. The section
 * title scrolls away normally; the filter chips right below it are
 * pinned via `stickyHeaderIndices` so they stay reachable while cards
 * scroll beneath them.
 *
 * The per-row cards (DriverCard/VehicleCard), their shared stat-bar cell
 * (StatCell) and tone/formatting math (lib/fleetCardHelpers) live in their
 * own files — this screen only owns data loading, filtering, and the
 * crossfade between the two lists.
 */

type LicenseFilter = 'all' | 'valid' | 'soon' | 'expired' | 'no_vehicle';
type StatusFilter = 'all' | 'active' | 'maintenance' | 'disabled' | 'archived';

const CROSSFADE_MS = 140;

type DriverSheetItem =
  | { kind: 'title' }
  | { kind: 'chips' }
  | { kind: 'empty' }
  | { kind: 'card'; item: DriverRow }
  | { kind: 'action' };

type VehicleSheetItem =
  | { kind: 'title' }
  | { kind: 'chips' }
  | { kind: 'empty' }
  | { kind: 'card'; item: Vehicle }
  | { kind: 'action' };

export default function FleetScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { companyId, company } = useCompany();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<ToggleValue>('drivers');

  /* ---------------------------------------------------------------- */
  /* Drivers                                                           */
  /* ---------------------------------------------------------------- */

  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [driversRefreshing, setDriversRefreshing] = useState(false);
  const [driversError, setDriversError] = useState<string | null>(null);
  const [driverSearch, setDriverSearch] = useState('');
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>('all');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingCategory, setExportingCategory] = useState<ReportCategory | null>(null);

  const driverLoadRequest = useRef(0);
  const vehicleLoadRequest = useRef(0);
  const loadedDriversCompanyId = useRef<string | null>(companyId ?? null);
  const loadedVehiclesCompanyId = useRef<string | null>(companyId ?? null);

  const errorMessage = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback;

  const loadDrivers = useCallback(async (): Promise<boolean> => {
    const requestId = ++driverLoadRequest.current;
    if (loadedDriversCompanyId.current !== (companyId ?? null)) {
      loadedDriversCompanyId.current = companyId ?? null;
      setDrivers([]);
      setDriversError(null);
    }
    if (!companyId) {
      if (requestId === driverLoadRequest.current) {
        setDrivers([]);
        setDriversError('לא נמצאה חברה פעילה עבור המשתמש');
      }
      return false;
    }

    try {
      const rows = await listDrivers(companyId);
      if (requestId !== driverLoadRequest.current) return false;
      setDrivers(rows);
      setDriversError(null);
      return true;
    } catch (error) {
      if (requestId === driverLoadRequest.current) {
        setDriversError(errorMessage(error, 'טעינת הנהגים נכשלה'));
      }
      return false;
    }
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

  const call = async (phone: string | null) => {
    const number = phone?.replace(/[^\d+]/g, '') ?? '';
    if (!number || number === '+') {
      Alert.alert('לא ניתן לחייג', 'לנהג לא מוגדר מספר טלפון תקין');
      return;
    }

    const url = `tel:${number}`;
    try {
      if (!(await Linking.canOpenURL(url))) {
        throw new Error('שיחות טלפון אינן נתמכות במכשיר זה');
      }
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('לא ניתן לחייג', errorMessage(error, 'נסה שוב מאוחר יותר'));
    }
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
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);
  const [restoringVehicleId, setRestoringVehicleId] = useState<string | null>(null);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const loadVehicles = useCallback(async (): Promise<boolean> => {
    const requestId = ++vehicleLoadRequest.current;
    if (loadedVehiclesCompanyId.current !== (companyId ?? null)) {
      loadedVehiclesCompanyId.current = companyId ?? null;
      setVehicles([]);
      setCompliance(new Map());
      setVehicleDrivers(new Map());
      setDepartmentNames(new Map());
      setVehiclesError(null);
    }
    if (!companyId) {
      if (requestId === vehicleLoadRequest.current) {
        setVehicles([]);
        setCompliance(new Map());
        setVehicleDrivers(new Map());
        setDepartmentNames(new Map());
        setVehiclesError('לא נמצאה חברה פעילה עבור המשתמש');
      }
      return false;
    }

    try {
      const [rows, departments] = await Promise.all([listVehicles(companyId, true), listDepartments(companyId)]);
      const [nextCompliance, nextVehicleDrivers] = await Promise.all([
        listComplianceForOwners('vehicle', rows.map((vehicle) => vehicle.id)),
        listActiveVehicleDriversForVehicles(rows.map((vehicle) => vehicle.id)),
      ]);
      if (requestId !== vehicleLoadRequest.current) return false;

      setVehicles(rows);
      setCompliance(nextCompliance);
      setVehicleDrivers(nextVehicleDrivers);
      setDepartmentNames(new Map(departments.map((department) => [department.id, department.name])));
      setVehiclesError(null);
      return true;
    } catch (error) {
      if (requestId === vehicleLoadRequest.current) {
        setVehiclesError(errorMessage(error, 'טעינת הרכבים נכשלה'));
      }
      return false;
    }
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
    if (restoringVehicleId) return;
    setRestoringVehicleId(vehicleId);
    try {
      await updateVehicle(vehicleId, { status: 'active' });
      const refreshed = await loadVehicles();
      if (!refreshed) {
        Alert.alert('הרכב שוחזר', 'לא הצלחנו לרענן את הרשימה. אפשר למשוך למטה כדי לנסות שוב.');
      }
    } catch (error) {
      Alert.alert('שחזור הרכב נכשל', errorMessage(error, 'נסה שוב מאוחר יותר'));
    } finally {
      setRestoringVehicleId(null);
    }
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
        // A request started for a previous company/focus cycle is no longer
        // allowed to overwrite the newer screen state when it resolves.
        driverLoadRequest.current += 1;
        vehicleLoadRequest.current += 1;
      };
    }, [loadDrivers, loadVehicles])
  );

  const onRefreshDrivers = async () => {
    setDriversRefreshing(true);
    try {
      const refreshed = await loadDrivers();
      if (!refreshed) Alert.alert('רענון הנהגים נכשל', 'בדוק את החיבור ונסה שוב.');
    } finally {
      setDriversRefreshing(false);
    }
  };

  const onRefreshVehicles = async () => {
    setVehiclesRefreshing(true);
    try {
      const refreshed = await loadVehicles();
      if (!refreshed) Alert.alert('רענון הרכבים נכשל', 'בדוק את החיבור ונסה שוב.');
    } finally {
      setVehiclesRefreshing(false);
    }
  };

  const retryDrivers = async () => {
    setDriversLoading(true);
    try {
      await loadDrivers();
    } finally {
      setDriversLoading(false);
    }
  };

  const retryVehicles = async () => {
    setVehiclesLoading(true);
    try {
      await loadVehicles();
    } finally {
      setVehiclesLoading(false);
    }
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

  /* ---------------------------------------------------------------- */
  /* Hero + sheet scroll choreography                                  */
  /* ---------------------------------------------------------------- */

  const navHeight = heroNavHeight(insets.top);
  const sheetRestTop = navHeight + HERO_CONTENT_HEIGHT + SPACING.xl;

  const driversScrollY = useRef(new Animated.Value(0)).current;
  const vehiclesScrollY = useRef(new Animated.Value(0)).current;
  const activeScrollY = mode === 'drivers' ? driversScrollY : vehiclesScrollY;

  const onDriversScroll = Animated.event([{ nativeEvent: { contentOffset: { y: driversScrollY } } }], {
    useNativeDriver: true,
  });
  const onVehiclesScroll = Animated.event([{ nativeEvent: { contentOffset: { y: vehiclesScrollY } } }], {
    useNativeDriver: true,
  });

  const sheetTranslateY = (scrollY: Animated.Value) =>
    scrollY.interpolate({ inputRange: [0, HERO_TRAVEL], outputRange: [0, -HERO_TRAVEL], extrapolate: 'clamp' });

  // On the blue hero glass, cube numbers use the bright "fill" tones (not
  // the muted "text" tones, which are sized for reading on the white
  // sheet) — same idea as the spec's bright status-dot variants reserved
  // for use "on blue background only".
  const driverStats: [FleetStat, FleetStat, FleetStat] = [
    { label: 'סה״כ נהגים', value: driverCounts.all, tint: '#fff' },
    { label: 'רישיון קרוב לפוג', value: driverCounts.soon, tint: FLEET_COLORS.warning.fill },
    { label: 'רישיון פג', value: driverCounts.expired, tint: FLEET_COLORS.statusDisabledDot },
  ];
  const vehicleStats: [FleetStat, FleetStat, FleetStat] = [
    { label: 'סה״כ רכבים', value: vehicleCounts.all, tint: '#fff' },
    { label: 'פעילים', value: vehicleCounts.active, tint: FLEET_COLORS.statusActiveDot },
    { label: 'מושבתים', value: vehicleCounts.disabled + vehicleCounts.maintenance, tint: FLEET_COLORS.statusDisabledDot },
  ];

  const driverSheetData: DriverSheetItem[] = [
    { kind: 'title' },
    { kind: 'chips' },
    ...(filteredDrivers.length === 0 ? [{ kind: 'empty' as const }] : filteredDrivers.map((item) => ({ kind: 'card' as const, item }))),
    { kind: 'action' },
  ];
  const vehicleSheetData: VehicleSheetItem[] = [
    { kind: 'title' },
    { kind: 'chips' },
    ...(filteredVehicles.length === 0 ? [{ kind: 'empty' as const }] : filteredVehicles.map((item) => ({ kind: 'card' as const, item }))),
    { kind: 'action' },
  ];

  return (
    <Screen>
      <StatusBar barStyle="light-content" />

      <FleetHero
        scrollY={activeScrollY}
        stats={mode === 'drivers' ? driverStats : vehicleStats}
        query={mode === 'drivers' ? driverSearch : vehicleSearch}
        onChangeQuery={mode === 'drivers' ? setDriverSearch : setVehicleSearch}
        searchPlaceholder={mode === 'drivers' ? 'חפש לפי שם, ת.ז או מספר עובד' : 'חיפוש לפי מספר רישוי'}
        onExportPress={mode === 'drivers' ? () => setExportMenuOpen(true) : undefined}
      />

      <Animated.View
        style={[
          styles.sheet,
          { top: sheetRestTop, opacity: driversOpacity, transform: [{ translateY: sheetTranslateY(driversScrollY) }] },
        ]}
        pointerEvents={mode === 'drivers' ? 'auto' : 'none'}
      >
       <View style={sheetStyles.sheetInner}>
        <LinearGradient colors={[FLEET_COLORS.sheetFrom, FLEET_COLORS.sheetTo]} style={StyleSheet.absoluteFill} />
        {driversLoading ? (
          <DriverListSkeleton />
        ) : driversError && drivers.length === 0 ? (
          <ErrorState message="לא ניתן לטעון את הנהגים" hint={driversError} onRetry={() => void retryDrivers()} />
        ) : (
          <Animated.FlatList
            data={driverSheetData}
            keyExtractor={(entry, i) => (entry.kind === 'card' ? entry.item.id : `${entry.kind}-${i}`)}
            stickyHeaderIndices={[1]}
            onScroll={onDriversScroll}
            scrollEventThrottle={16}
            contentContainerStyle={[sheetStyles.list, { paddingBottom: FLEET_DOCK_CLEARANCE + insets.bottom }]}
            refreshControl={<RefreshControl refreshing={driversRefreshing} onRefresh={onRefreshDrivers} />}
            renderItem={({ item: entry }) => {
              if (entry.kind === 'title') {
                return (
                  <View style={sheetStyles.titleRow}>
                    <AppText weight="bold" style={sheetStyles.titleText}>
                      הנהגים שלי
                    </AppText>
                    <AppText style={sheetStyles.titleCount}>{driverCounts.all}</AppText>
                  </View>
                );
              }
              if (entry.kind === 'chips') {
                return (
                  <View style={sheetStyles.chipsBar}>
                    <FleetFilterChips<LicenseFilter>
                      value={licenseFilter}
                      onChange={setLicenseFilter}
                      options={[
                        { value: 'all', label: 'הכל', count: driverCounts.all, icon: 'people-outline' },
                        { value: 'soon', label: 'רישיון קרוב לפוג', count: driverCounts.soon, icon: 'hourglass-outline' },
                        { value: 'expired', label: 'רישיון פג', count: driverCounts.expired, icon: 'warning' },
                        { value: 'no_vehicle', label: 'ללא רכב', count: driverCounts.noVehicle, icon: 'ban-outline' },
                      ]}
                    />
                    <LinearGradient colors={[FLEET_COLORS.chipsBarBg, 'rgba(242,245,249,0)']} style={sheetStyles.chipsBarFade} pointerEvents="none" />
                  </View>
                );
              }
              if (entry.kind === 'empty') {
                return (
                  <EmptyState
                    icon="people-outline"
                    title={drivers.length === 0 ? 'עדיין אין נהגים' : 'לא נמצאו נהגים'}
                    hint={drivers.length === 0 ? 'הוסף את הנהג הראשון של החברה' : undefined}
                  />
                );
              }
              if (entry.kind === 'action') {
                return <FleetAddButton label="נהג חדש" onPress={() => navigation.navigate('DriverForm', {})} />;
              }
              return (
                <DriverCard
                  item={entry.item}
                  onPress={() => navigation.navigate('DriverDetail', { driverId: entry.item.id })}
                  onPressVehicle={() => navigation.navigate('VehicleDetail', { vehicleId: entry.item.vehicle_id! })}
                  onCall={() => void call(entry.item.phone)}
                />
              );
            }}
          />
        )}
       </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          { top: sheetRestTop, opacity: vehiclesOpacity, transform: [{ translateY: sheetTranslateY(vehiclesScrollY) }] },
        ]}
        pointerEvents={mode === 'vehicles' ? 'auto' : 'none'}
      >
       <View style={sheetStyles.sheetInner}>
        <LinearGradient colors={[FLEET_COLORS.sheetFrom, FLEET_COLORS.sheetTo]} style={StyleSheet.absoluteFill} />
        {vehiclesLoading ? (
          <VehicleListSkeleton />
        ) : vehiclesError && vehicles.length === 0 ? (
          <ErrorState message="לא ניתן לטעון את הרכבים" hint={vehiclesError} onRetry={() => void retryVehicles()} />
        ) : (
          <Animated.FlatList
            data={vehicleSheetData}
            keyExtractor={(entry, i) => (entry.kind === 'card' ? entry.item.id : `${entry.kind}-${i}`)}
            stickyHeaderIndices={[1]}
            onScroll={onVehiclesScroll}
            scrollEventThrottle={16}
            contentContainerStyle={[sheetStyles.list, { paddingBottom: FLEET_DOCK_CLEARANCE + insets.bottom }]}
            refreshControl={<RefreshControl refreshing={vehiclesRefreshing} onRefresh={onRefreshVehicles} />}
            renderItem={({ item: entry }) => {
              if (entry.kind === 'title') {
                return (
                  <View style={sheetStyles.titleRow}>
                    <AppText weight="bold" style={sheetStyles.titleText}>
                      הרכבים שלי
                    </AppText>
                    <AppText style={sheetStyles.titleCount}>{vehicleCounts.all}</AppText>
                  </View>
                );
              }
              if (entry.kind === 'chips') {
                return (
                  <View style={sheetStyles.chipsBar}>
                    <FleetFilterChips<StatusFilter>
                      value={status}
                      onChange={setStatus}
                      options={[
                        { value: 'all', label: 'הכל', count: vehicleCounts.all },
                        { value: 'active', label: 'פעיל', count: vehicleCounts.active },
                        { value: 'maintenance', label: 'בטיפול', count: vehicleCounts.maintenance },
                        { value: 'disabled', label: 'מושבת', count: vehicleCounts.disabled },
                        { value: 'archived', label: 'בארכיון', count: vehicleCounts.archived },
                      ]}
                    />
                    <LinearGradient colors={[FLEET_COLORS.chipsBarBg, 'rgba(242,245,249,0)']} style={sheetStyles.chipsBarFade} pointerEvents="none" />
                  </View>
                );
              }
              if (entry.kind === 'empty') {
                return (
                  <EmptyState
                    icon="car-outline"
                    title={vehicles.length === 0 ? 'עדיין אין רכבים' : 'לא נמצאו רכבים'}
                    hint={vehicles.length === 0 ? 'הוסף את הרכב הראשון של החברה' : undefined}
                  />
                );
              }
              if (entry.kind === 'action') {
                return <FleetAddButton label="רכב חדש" onPress={() => navigation.navigate('VehicleForm', {})} />;
              }
              return (
                <VehicleCard
                  item={entry.item}
                  compliance={compliance}
                  vehicleDrivers={vehicleDrivers}
                  departmentNames={departmentNames}
                  onPress={() => navigation.navigate('VehicleDetail', { vehicleId: entry.item.id })}
                  onRestore={() => restoreVehicle(entry.item.id)}
                  restoring={restoringVehicleId === entry.item.id}
                />
              );
            }}
          />
        )}
       </View>
      </Animated.View>

      <FleetDock mode={mode} onModeChange={setMode} />

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
  // Shadow lives on this outer view (no overflow:hidden, or RN clips the
  // shadow along with the corners) — `sheetInner` below does the actual
  // rounded clipping + gradient fill.
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    ...FLEET_SHADOWS.sheet,
  },
});

const sheetStyles = StyleSheet.create({
  sheetInner: {
    flex: 1,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    overflow: 'hidden',
  },
  list: { gap: SPACING.md },

  titleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  titleText: { fontSize: 16, color: FLEET_COLORS.textPrimary, fontFamily: FLEET_FONT.bold },
  titleCount: { fontSize: 13, color: FLEET_COLORS.textSecondary, fontFamily: FLEET_FONT.regular },

  chipsBar: {
    backgroundColor: FLEET_COLORS.chipsBarBg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    // No box-shadow here on purpose — Android's `elevation` shadow ignores
    // the sheet's `overflow:hidden` clip (sheetInner), so it used to bleed
    // past the rounded corners as a square patch. A hairline top highlight
    // plus the fade below is enough separation without it.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,.9)',
  },
  chipsBarFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -20,
    height: 20,
  },
});
