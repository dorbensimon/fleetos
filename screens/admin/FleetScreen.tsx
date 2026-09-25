import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { showAlert } from '../../lib/platformAlert';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { expiryState } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import {
  countUnreadNotifications,
  getAttentionSummary,
  type AttentionSummary,
  listDrivers,
  listArchivedDrivers,
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
import { listSignatureRequests } from '../../lib/docuseal';
import { healthDeclarationsByDriver, type HealthDeclarationInfo } from '../../lib/healthDeclaration';
import { RootStackParamList } from '../../navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { FleetDesktopView } from '../../components/desktop/FleetDesktopView';
import { AttentionMenu } from '../../components/desktop/FleetOverview';
import { FleetMobile, type DriverFilter, type VehicleFilter } from './mobile/FleetMobile';

/**
 * The fleet workspace: drivers and vehicles, one switch apart. This screen
 * owns loading, search and filters; the phone layout lives in
 * `mobile/FleetMobile`, the desktop one in `FleetDesktopView`.
 */

type LicenseFilter = DriverFilter;
type StatusFilter = VehicleFilter;
type ToggleValue = 'drivers' | 'vehicles';

export default function FleetScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'AdminHome'>>();
  const { companyId, company, profile } = useCompany();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();

  const [mode, setMode] = useState<ToggleValue>(route.params?.mode ?? 'drivers');

  // The desktop breadcrumb can return directly to the relevant fleet tab.
  // React Navigation may keep this screen mounted, so also react to a later
  // navigation request instead of only reading the initial route params.
  useEffect(() => {
    if (route.params?.mode) setMode(route.params.mode);
  }, [route.params?.mode]);

  // The chosen tab also lives in the route, so going back — or a reload,
  // which rebuilds this screen from the saved navigation state — lands on
  // the same tab instead of snapping back to drivers.
  const changeMode = useCallback((next: ToggleValue) => {
    setMode(next);
    navigation.setParams({ mode: next });
  }, [navigation]);

  /* ---------------------------------------------------------------- */
  /* Drivers                                                           */
  /* ---------------------------------------------------------------- */

  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [driversError, setDriversError] = useState<string | null>(null);
  const [driverSearch, setDriverSearch] = useState('');
  const [pendingSigning, setPendingSigning] = useState<Map<string, number>>(new Map());
  const [healthDeclarations, setHealthDeclarations] = useState<Map<string, HealthDeclarationInfo>>(new Map());
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>('all');
  // Archived drivers are never part of `drivers` (they are excluded at the
  // query), so the archive button carries its own count.
  const [archivedCount, setArchivedCount] = useState(0);

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
      setPendingSigning(new Map());
      setHealthDeclarations(new Map());
      setArchivedCount(0);
      setDriversError(null);
    }
    if (!companyId) {
      if (requestId === driverLoadRequest.current) {
        setDrivers([]);
        setArchivedCount(0);
        setDriversError('לא נמצאה חברה פעילה עבור המשתמש');
      }
      return false;
    }

    try {
      const [rows, signatureRequests, archived] = await Promise.all([
        listDrivers(companyId),
        listSignatureRequests(companyId).catch(() => []),
        // A failed archive count must never block the fleet list itself.
        listArchivedDrivers(companyId).catch(() => []),
      ]);
      if (requestId !== driverLoadRequest.current) return false;
      const signingMap = new Map<string, number>();
      for (const request of signatureRequests) {
        if (request.status !== 'pending' || !request.docuseal_submitter_slug) continue;
        signingMap.set(request.driver_id, (signingMap.get(request.driver_id) ?? 0) + 1);
      }
      setDrivers(rows);
      setPendingSigning(signingMap);
      setHealthDeclarations(healthDeclarationsByDriver(signatureRequests));
      setArchivedCount(archived.length);
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

      // Numbers match with or without dashes/spaces (050-123 finds 050123).
      const digits = q.replace(/\D/g, '');
      const hasDigits = (value: string | null | undefined) => !!digits && (value ?? '').replace(/\D/g, '').includes(digits);
      return (
        (d.full_name ?? '').toLowerCase().includes(q) ||
        (d.national_id ?? '').includes(q) ||
        (d.employee_number ?? '').toLowerCase().includes(q) ||
        (d.phone ?? '').includes(q) ||
        (d.license_number ?? '').toLowerCase().includes(q) ||
        hasDigits(d.phone) ||
        hasDigits(d.national_id) ||
        hasDigits(d.license_number) ||
        d.vehicles.some((v) => v.plate_number.toLowerCase().includes(q) || hasDigits(v.plate_number))
      );
    });
  }, [drivers, driverSearch, licenseFilter]);

  const driverCounts = useMemo(() => {
    const byState = (s: string) => drivers.filter((d) => expiryState(d.license_expiry) === s).length;
    return {
      all: drivers.length,
      valid: byState('ok'),
      soon: byState('soon'),
      expired: byState('expired'),
      noVehicle: drivers.filter((d) => !d.vehicle_plate).length,
    };
  }, [drivers]);

  const call = async (phone: string | null) => {
    const number = phone?.replace(/[^\d+]/g, '') ?? '';
    if (!number || number === '+') {
      showAlert('לא ניתן לחייג', 'לנהג לא מוגדר מספר טלפון תקין');
      return;
    }

    const url = `tel:${number}`;
    try {
      if (!(await Linking.canOpenURL(url))) {
        throw new Error('שיחות טלפון אינן נתמכות במכשיר זה');
      }
      await Linking.openURL(url);
    } catch (error) {
      showAlert('לא ניתן לחייג', errorMessage(error, 'נסה שוב מאוחר יותר'));
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
    const insuranceBad = (v: Vehicle) => {
      const state = expiryState(compliance.get(v.id)?.find((c) => c.item_type === 'insurance_mandatory')?.expiry_date);
      return state === 'missing' || state === 'expired';
    };
    return vehicles.filter((v) => {
      const matchesStatus =
        status === 'all'
          ? v.status !== 'archived'
          : status === 'insurance'
            ? v.status !== 'archived' && insuranceBad(v)
            : status === 'no_driver'
              ? v.status !== 'archived' && !vehicleDrivers.get(v.id)?.length
              : v.status === status;
      if (!matchesStatus) return false;
      if (!q) return true;
      const driverNamesForVehicle = (vehicleDrivers.get(v.id) ?? [])
        .map((d) => (d.full_name ?? '').toLowerCase())
        .join(' ');
      return (
        v.plate_number.toLowerCase().includes(q) ||
        (!!q.replace(/\D/g, '') && v.plate_number.replace(/\D/g, '').includes(q.replace(/\D/g, ''))) ||
        (v.model ?? '').toLowerCase().includes(q) ||
        (v.manufacturer ?? '').toLowerCase().includes(q) ||
        (v.internal_code ?? '').toLowerCase().includes(q) ||
        driverNamesForVehicle.includes(q)
      );
    });
  }, [vehicles, vehicleSearch, status, vehicleDrivers, compliance]);

  const vehicleCounts = useMemo(
    () => ({
      all: vehicles.filter((v) => v.status !== 'archived').length,
      active: vehicles.filter((v) => v.status === 'active').length,
      maintenance: vehicles.filter((v) => v.status === 'maintenance').length,
      disabled: vehicles.filter((v) => v.status === 'disabled').length,
      archived: vehicles.filter((v) => v.status === 'archived').length,
      insurance: vehicles.filter((v) => {
        if (v.status === 'archived') return false;
        const state = expiryState(compliance.get(v.id)?.find((c) => c.item_type === 'insurance_mandatory')?.expiry_date);
        return state === 'missing' || state === 'expired';
      }).length,
      noDriver: vehicles.filter((v) => v.status !== 'archived' && !vehicleDrivers.get(v.id)?.length).length,
    }),
    [vehicles, compliance, vehicleDrivers]
  );

  const restoreVehicle = async (vehicleId: string) => {
    if (restoringVehicleId) return;
    setRestoringVehicleId(vehicleId);
    try {
      await updateVehicle(vehicleId, { status: 'active' });
      const refreshed = await loadVehicles();
      if (!refreshed) {
        showAlert('הרכב שוחזר', 'לא הצלחנו לרענן את הרשימה. אפשר למשוך למטה כדי לנסות שוב.');
      }
    } catch (error) {
      showAlert('שחזור הרכב נכשל', errorMessage(error, 'נסה שוב מאוחר יותר'));
    } finally {
      setRestoringVehicleId(null);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Shared load + crossfade                                          */
  /* ---------------------------------------------------------------- */

  // The phone's hero shows the unread count and what needs attention.
  // Both are extras: the fleet works without them.
  const [unread, setUnread] = useState(0);
  const [attention, setAttention] = useState<AttentionSummary | null>(null);
  const loadExtras = useCallback(async () => {
    if (!companyId || isDesktop) return;
    const [count, summary] = await Promise.all([
      countUnreadNotifications(companyId).catch(() => 0),
      getAttentionSummary(companyId).catch(() => null),
    ]);
    setUnread(count);
    setAttention(summary);
  }, [companyId, isDesktop]);
  useFocusEffect(
    useCallback(() => {
      void loadExtras();
    }, [loadExtras])
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Keep the current mode, filters, search text and list scroll position
      // when returning from a pushed detail screen. The fleet screen stays
      // mounted in the navigation stack, so its existing state is the
      // correct place to return to.
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

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const [driversOk, vehiclesOk] = await Promise.all([loadDrivers(), loadVehicles(), loadExtras()]);
      if (!driversOk || !vehiclesOk) showAlert('הרענון נכשל', 'בדוק את החיבור ונסה שוב.');
    } finally {
      setRefreshing(false);
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

  // Desktop web gets its own layout (sidebar + tables) over the exact same
  // data, filters and navigation; phone and narrow web keep the layout below.
  if (isDesktop) {
    return (
      <DesktopShell
        active="AdminHome"
        breadcrumbs={['דשבורד']}
        headerAccessory={
          <AttentionMenu
            vehicles={vehicles}
            compliance={compliance}
            vehicleDrivers={vehicleDrivers}
            loading={vehiclesLoading}
            onOpenVehicle={(vehicleId) => navigation.navigate('VehicleDetail', { vehicleId })}
          />
        }
      >
        <FleetDesktopView<LicenseFilter, StatusFilter>
          mode={mode}
          onModeChange={changeMode}
          drivers={drivers}
          filteredDrivers={filteredDrivers}
          driversLoading={driversLoading}
          driversError={driversError}
          onRetryDrivers={() => void retryDrivers()}
          driverSearch={driverSearch}
          onDriverSearch={setDriverSearch}
          driverFilter={licenseFilter}
          onDriverFilter={setLicenseFilter}
          driverChips={[
            { value: 'all', label: 'הכל', count: driverCounts.all },
            { value: 'soon', label: 'רישיון קרוב לפוג', count: driverCounts.soon },
            { value: 'expired', label: 'רישיון פג', count: driverCounts.expired },
            { value: 'no_vehicle', label: 'ללא רכב', count: driverCounts.noVehicle },
          ]}
          driverKpis={{ total: driverCounts.all, soon: driverCounts.soon, expired: driverCounts.expired }}
          archivedCount={archivedCount}
          pendingSigning={pendingSigning}
          healthDeclarations={healthDeclarations}
          vehicles={vehicles}
          filteredVehicles={filteredVehicles}
          vehiclesLoading={vehiclesLoading}
          vehiclesError={vehiclesError}
          onRetryVehicles={() => void retryVehicles()}
          vehicleSearch={vehicleSearch}
          onVehicleSearch={setVehicleSearch}
          vehicleFilter={status}
          onVehicleFilter={setStatus}
          vehicleChips={[
            { value: 'all', label: 'הכל', count: vehicleCounts.all },
            { value: 'active', label: 'פעיל', count: vehicleCounts.active },
            { value: 'maintenance', label: 'בטיפול', count: vehicleCounts.maintenance },
            { value: 'disabled', label: 'מושבת', count: vehicleCounts.disabled },
            { value: 'archived', label: 'בארכיון', count: vehicleCounts.archived },
          ]}
          vehicleKpis={{
            total: vehicleCounts.all,
            active: vehicleCounts.active,
            inactive: vehicleCounts.maintenance + vehicleCounts.disabled,
          }}
          compliance={compliance}
          vehicleDrivers={vehicleDrivers}
          departmentNames={departmentNames}
          restoringVehicleId={restoringVehicleId}
          onOpenDriver={(driverId) => navigation.navigate('DriverDetail', { driverId })}
          onOpenVehicle={(vehicleId) => navigation.navigate('VehicleDetail', { vehicleId })}
          onAddDriver={() => navigation.navigate('DriverForm', {})}
          onAddVehicle={() => navigation.navigate('VehicleForm', {})}
          onOpenArchive={() => navigation.navigate('DriverArchive')}
          onCallDriver={(phone) => void call(phone)}
          onRestoreVehicle={(vehicleId) => void restoreVehicle(vehicleId)}
        />
      </DesktopShell>
    );
  }

  return (
    <FleetMobile
      insetTop={insets.top}
      insetBottom={insets.bottom}
      firstName={profile?.full_name?.trim().split(/\s+/)[0] ?? ''}
      companyName={company?.name ?? ''}
      unread={unread}
      attention={attention}
      mode={mode}
      onModeChange={changeMode}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      drivers={filteredDrivers}
      driverTotal={drivers.length}
      driverCounts={driverCounts}
      driverFilter={licenseFilter}
      onDriverFilter={setLicenseFilter}
      driverSearch={driverSearch}
      onDriverSearch={setDriverSearch}
      driversLoading={driversLoading}
      driversError={driversError}
      onRetryDrivers={() => void retryDrivers()}
      archivedCount={archivedCount}
      pendingSigning={pendingSigning}
      vehicles={filteredVehicles}
      vehicleTotal={vehicleCounts.all}
      vehicleCounts={vehicleCounts}
      vehicleFilter={status}
      onVehicleFilter={setStatus}
      vehicleSearch={vehicleSearch}
      onVehicleSearch={setVehicleSearch}
      vehiclesLoading={vehiclesLoading}
      vehiclesError={vehiclesError}
      onRetryVehicles={() => void retryVehicles()}
      compliance={compliance}
      vehicleDrivers={vehicleDrivers}
      departmentNames={departmentNames}
      restoringVehicleId={restoringVehicleId}
      onMenu={() => navigation.navigate('Menu')}
      onNotifications={() => navigation.navigate('Notifications')}
      onAttention={() => navigation.navigate('Attention')}
      onArchive={() => navigation.navigate('DriverArchive')}
      onOpenDriver={(driverId) => navigation.navigate('DriverDetail', { driverId })}
      onOpenVehicle={(vehicleId) => navigation.navigate('VehicleDetail', { vehicleId })}
      onCallDriver={(phone) => void call(phone)}
      onRestoreVehicle={(vehicleId) => void restoreVehicle(vehicleId)}
      onAddDriver={() => navigation.navigate('DriverForm', {})}
      onAddVehicle={() => navigation.navigate('VehicleForm', {})}
    />
  );
}
