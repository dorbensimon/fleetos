import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Linking,
  Alert,
  Modal,
  Pressable,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Screen,
  AppText,
  FilterChips,
  LoadingState,
  EmptyState,
  Badge,
  AdminBottomBar,
  AdminGlassHeader,
} from '../../components/ui';
import { ToggleValue } from '../../components/ui/DriversVehiclesToggle';
import {
  COLORS,
  RADIUS,
  SPACING,
  CARD_SHADOW,
  SUBTLE_SHADOW,
  expiryState,
  daysUntilExpiry,
  formatDate,
} from '../../lib/theme';
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
import { exportDriversReport, REPORT_CATEGORIES, ReportCategory } from '../../lib/driverReport';
import { VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '../../lib/compliance';
import { formatPlate } from '../../lib/plate';
import { RootStackParamList } from '../../navigation/types';

/**
 * A2/A4 — the fleet screen. "Drivers" and "Vehicles" are the same screen:
 * one shared glass header (search + the segmented toggle) with two list
 * bodies stacked underneath it. Switching modes never pushes a new
 * screen — there both lists stay mounted and simply crossfade, so there's
 * no back button, no swipe-back gesture, and no left/right slide; the old
 * list fades out just as the new one fades in, fast enough to read as one
 * screen whose content changed rather than a navigation.
 */

type LicenseFilter = 'all' | 'valid' | 'soon' | 'expired' | 'no_vehicle';
type StatusFilter = 'all' | 'active' | 'maintenance' | 'disabled' | 'archived';

const TONE_OK = '#1DBF73';
const TONE_WARN = '#F5A623';
const TONE_BAD = '#E5484D';
const TONE_NEUTRAL = '#979797';

const YEAR_DAYS = 365;
const SERVICE_WARN_KM = 1000;

const CROSSFADE_MS = 140;

/** Same rule for every stat: green with runway left, yellow inside the warning window, red once overdue. */
function remainingTone(remaining: number | null, warnAt: number): string {
  if (remaining == null) return TONE_NEUTRAL;
  if (remaining < 0) return TONE_BAD;
  return remaining <= warnAt ? TONE_WARN : TONE_OK;
}

/**
 * The line grows from empty toward full as the deadline approaches — green
 * while there's runway left, still growing (now yellow) once inside the
 * warning window, and a full red line once the deadline has passed.
 */
function remainingRatio(remaining: number | null, total: number): number {
  if (remaining == null) return 0.06;
  return Math.max(0, Math.min(1, 1 - remaining / total));
}

function worstTone(tones: string[]): string {
  if (tones.includes(TONE_BAD)) return TONE_BAD;
  if (tones.includes(TONE_WARN)) return TONE_WARN;
  if (tones.every((t) => t === TONE_NEUTRAL)) return TONE_NEUTRAL;
  return TONE_OK;
}

function chipFor(tone: string, badItems: string[] = []): { label: string; bg: string; fg: string } {
  if (tone === TONE_BAD) {
    return { label: badItems.length ? badItems.join(' · ') : 'דורש טיפול', bg: '#FDECEC', fg: TONE_BAD };
  }
  if (tone === TONE_WARN) return { label: 'מתקרב מועד', bg: '#FFF6E5', fg: '#B9720A' };
  if (tone === TONE_NEUTRAL) return { label: 'חסר נתונים', bg: '#F2F2F2', fg: TONE_NEUTRAL };
  return { label: 'תקין', bg: '#EAF8F1', fg: '#118653' };
}

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

  const expiryOf = (vehicleId: string, itemType: string) =>
    compliance.get(vehicleId)?.find((c) => c.item_type === itemType)?.expiry_date ?? null;

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
              renderItem={({ item }) => {
                const state = expiryState(item.license_expiry);
                const warn = state === 'soon' || state === 'expired';
                const days = daysUntilExpiry(item.license_expiry);
                const licenseText = !item.license_expiry
                  ? 'ללא תוקף רישיון'
                  : state === 'expired'
                  ? 'רישיון פג תוקף'
                  : state === 'soon'
                  ? `רישיון יפוג בעוד ${days} ${days === 1 ? 'יום' : 'ימים'}`
                  : `רישיון בתוקף עד ${formatDate(item.license_expiry)}`;
                const licenseColor =
                  state === 'expired' ? COLORS.dangerText : state === 'soon' ? COLORS.warnText : COLORS.okText;

                return (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={driverStyles.card}
                    onPress={() => navigation.navigate('DriverDetail', { driverId: item.id })}
                  >
                    <View style={driverStyles.avatarWrap}>
                      <View style={driverStyles.avatar}>
                        <AppText weight="bold" style={driverStyles.avatarText}>
                          {(item.full_name ?? '?').trim().charAt(0)}
                        </AppText>
                      </View>
                      {!!item.license_classes && (
                        <View style={[driverStyles.gradeBadge, warn && driverStyles.gradeBadgeWarn]}>
                          <AppText
                            weight="bold"
                            style={[driverStyles.gradeText, warn && driverStyles.gradeTextWarn]}
                          >
                            {item.license_classes}
                          </AppText>
                        </View>
                      )}
                    </View>

                    <View style={driverStyles.cardTitleWrap}>
                      <AppText weight="bold" style={driverStyles.cardTitle} numberOfLines={1}>
                        {item.full_name ?? 'ללא שם'}
                      </AppText>
                      <AppText style={driverStyles.cardSubtitle} numberOfLines={1}>
                        {item.national_id ? `ת.ז ${item.national_id}` : 'ללא ת.ז'}
                      </AppText>
                      <View style={driverStyles.licenseRow}>
                        <View style={[driverStyles.dot, { backgroundColor: licenseColor }]} />
                        <AppText style={[driverStyles.licenseText, { color: licenseColor }]} numberOfLines={1}>
                          {licenseText}
                        </AppText>
                      </View>
                      {item.vehicle_id && item.vehicle_plate && (
                        <TouchableOpacity
                          hitSlop={4}
                          onPress={(e) => {
                            e.stopPropagation();
                            navigation.navigate('VehicleDetail', { vehicleId: item.vehicle_id! });
                          }}
                        >
                          <AppText style={driverStyles.vehicleLink} numberOfLines={1}>
                            רכב: {formatPlate(item.vehicle_plate)}
                          </AppText>
                        </TouchableOpacity>
                      )}
                    </View>

                    {!!item.phone && (
                      <TouchableOpacity style={driverStyles.callBtn} onPress={() => call(item.phone)} hitSlop={8}>
                        <Ionicons name="call-outline" size={17} color={COLORS.okText} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              }}
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
              renderItem={({ item }) => {
                const insurance = expiryOf(item.id, 'insurance_mandatory');
                const test = expiryOf(item.id, 'annual_test');
                const assignedDrivers = vehicleDrivers.get(item.id) ?? [];
                const driverName =
                  assignedDrivers.find((d) => d.is_primary)?.full_name ?? assignedDrivers[0]?.full_name ?? null;
                const extraDriverCount = Math.max(0, assignedDrivers.length - (driverName ? 1 : 0));
                const departmentName = item.department_id ? departmentNames.get(item.department_id) : null;
                const isArchived = item.status === 'archived';

                const insDays = daysUntilExpiry(insurance);
                const testDays = daysUntilExpiry(test);
                const kmToService = item.next_service_km != null ? item.next_service_km - item.odometer : null;
                const svcTotalKm =
                  item.service_interval_km ??
                  (item.next_service_km != null ? item.next_service_km - item.last_service_km : null) ??
                  10000;

                const insTone = remainingTone(insDays, 30);
                const testTone = remainingTone(testDays, 30);
                const svcOverdue = kmToService != null && kmToService <= 0;
                const svcTone = remainingTone(kmToService, SERVICE_WARN_KM);
                const worst = worstTone([insTone, testTone, svcTone]);
                const badItems: string[] = [];
                if (insTone === TONE_BAD) badItems.push('ביטוח');
                if (testTone === TONE_BAD) badItems.push('טסט');
                if (svcTone === TONE_BAD) badItems.push('טיפול');
                const chip = chipFor(worst, badItems);

                return (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[vehicleStyles.card, worst === TONE_BAD && !isArchived && vehicleStyles.cardAlert]}
                    onPress={() => navigation.navigate('VehicleDetail', { vehicleId: item.id })}
                  >
                    <View style={vehicleStyles.cardTop}>
                      <View style={vehicleStyles.plate}>
                        <View style={vehicleStyles.plateFlag}>
                          <AppText weight="bold" style={vehicleStyles.plateFlagText}>
                            IL
                          </AppText>
                        </View>
                        <AppText weight="bold" style={vehicleStyles.plateText}>
                          {formatPlate(item.plate_number)}
                        </AppText>
                      </View>

                      <View style={vehicleStyles.cardTitleWrap}>
                        <View style={vehicleStyles.titleRow}>
                          <AppText weight="bold" style={vehicleStyles.cardTitle} numberOfLines={1}>
                            {[item.manufacturer, item.model].filter(Boolean).join(' ') || 'ללא דגם'}
                          </AppText>
                          {!isArchived && (
                            <View style={[vehicleStyles.chip, { backgroundColor: chip.bg }]}>
                              <AppText
                                weight="bold"
                                style={[vehicleStyles.chipText, { color: chip.fg }]}
                                numberOfLines={1}
                              >
                                {chip.label}
                              </AppText>
                            </View>
                          )}
                        </View>
                        <AppText style={vehicleStyles.cardSubtitle} numberOfLines={1}>
                          {driverName ? `נהג: ${driverName}` : 'ללא נהג'}
                          {extraDriverCount > 0 ? ` (+${extraDriverCount})` : ''}
                          {departmentName ? ` · מח': ${departmentName}` : ''}
                          {` · סוג: ${VEHICLE_TYPE_LABELS[item.vehicle_type] ?? item.vehicle_type}`}
                        </AppText>
                      </View>

                      {item.status !== 'active' && (
                        <Badge
                          label={VEHICLE_STATUS_LABELS[item.status] ?? item.status}
                          bg={item.status === 'maintenance' || item.status === 'disabled' ? COLORS.dangerBg : COLORS.neutralBg}
                          fg={item.status === 'maintenance' || item.status === 'disabled' ? COLORS.dangerText : COLORS.neutralText}
                        />
                      )}
                    </View>

                    {isArchived ? (
                      <TouchableOpacity
                        style={vehicleStyles.restoreBtn}
                        activeOpacity={0.8}
                        onPress={(e) => {
                          e.stopPropagation();
                          restoreVehicle(item.id);
                        }}
                      >
                        <AppText weight="bold" style={vehicleStyles.restoreText}>
                          שחזר מארכיון
                        </AppText>
                      </TouchableOpacity>
                    ) : (
                      <View style={vehicleStyles.statsRow}>
                        <StatCell
                          label="ביטוח"
                          value={insurance ? formatDate(insurance) : 'חסר'}
                          note={insDays == null ? 'חסר' : insDays < 0 ? 'פג תוקף' : `${insDays} ימים`}
                          tone={insTone}
                          ratio={remainingRatio(insDays, YEAR_DAYS)}
                          showDivider
                        />
                        <StatCell
                          label="טסט"
                          value={test ? formatDate(test) : 'חסר'}
                          note={testDays == null ? 'חסר' : testDays < 0 ? 'פג תוקף' : `${testDays} ימים`}
                          tone={testTone}
                          ratio={remainingRatio(testDays, YEAR_DAYS)}
                          showDivider
                        />
                        <StatCell
                          label="טיפול"
                          value={
                            item.next_service_km != null ? `${item.next_service_km.toLocaleString()} ק״מ` : 'חסר'
                          }
                          note={
                            kmToService == null
                              ? 'חסר'
                              : svcOverdue
                                ? 'פג תוקף'
                                : `בעוד ${kmToService.toLocaleString()} ק״מ`
                          }
                          tone={svcTone}
                          ratio={remainingRatio(kmToService, svcTotalKm)}
                        />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </Animated.View>
      </View>

      <Modal
        visible={exportMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setExportMenuOpen(false)}
      >
        <Pressable style={driverStyles.exportOverlay} onPress={() => setExportMenuOpen(false)}>
          <Pressable style={driverStyles.exportSheet} onPress={(e) => e.stopPropagation()}>
            <AppText weight="bold" style={driverStyles.exportTitle}>
              ייצוא דוח נהגים
            </AppText>
            <AppText style={driverStyles.exportSubtitle}>בחר את קבוצת הנהגים לדוח</AppText>

            {REPORT_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.value}
                style={driverStyles.exportRow}
                activeOpacity={0.7}
                disabled={!!exportingCategory}
                onPress={() => runExport(cat.value)}
              >
                <View style={driverStyles.exportRowIcon}>
                  {exportingCategory === cat.value ? (
                    <ActivityIndicator size="small" color={COLORS.accent} />
                  ) : (
                    <Ionicons name={cat.icon as any} size={18} color={COLORS.accent} />
                  )}
                </View>
                <AppText weight="bold" style={driverStyles.exportRowLabel}>
                  {cat.label}
                </AppText>
                <Ionicons name="chevron-back" size={16} color={COLORS.textFaint} />
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={driverStyles.exportCancel} onPress={() => setExportMenuOpen(false)}>
              <AppText weight="bold" style={driverStyles.exportCancelText}>
                ביטול
              </AppText>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

/**
 * One column of the insurance/test/service stats row: a coloured dot +
 * label, the value, a fill bar that animates in from empty on mount, and
 * a note line.
 */
function StatCell({
  label,
  value,
  note,
  tone,
  ratio,
  showDivider,
}: {
  label: string;
  value: string;
  note: string;
  tone: string;
  ratio: number;
  showDivider?: boolean;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const targetPercent = Math.max(6, Math.min(100, ratio * 100));

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [targetPercent]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${targetPercent}%`] });
  const isBad = tone === TONE_BAD;

  return (
    <View style={[vehicleStyles.statCell, showDivider && vehicleStyles.statCellDivider]}>
      <View style={vehicleStyles.statHeader}>
        <View style={[vehicleStyles.statDot, { backgroundColor: tone }]} />
        <AppText style={vehicleStyles.statLabel} numberOfLines={1}>
          {label}
        </AppText>
      </View>
      <AppText weight="bold" style={[vehicleStyles.statValue, isBad && vehicleStyles.statValueBad]} numberOfLines={1}>
        {value}
      </AppText>
      <View style={vehicleStyles.statTrack}>
        <Animated.View style={[vehicleStyles.statBar, { width, backgroundColor: tone }]} />
      </View>
      <AppText style={[vehicleStyles.statNote, isBad && vehicleStyles.statNoteBad]} numberOfLines={1}>
        {note}
      </AppText>
    </View>
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

  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginHorizontal: SPACING.lg,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
    ...CARD_SHADOW,
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 17, color: COLORS.accent },
  gradeBadge: {
    position: 'absolute',
    bottom: -4,
    left: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: COLORS.card,
    ...SUBTLE_SHADOW,
  },
  gradeBadgeWarn: { backgroundColor: COLORS.warnBg },
  gradeText: { fontSize: 10, color: COLORS.textMuted },
  gradeTextWarn: { color: COLORS.warnText },

  cardTitleWrap: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 15 },
  cardSubtitle: { fontSize: 12, color: COLORS.textFaint },
  licenseRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginTop: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  licenseText: { fontSize: 11 },
  vehicleLink: { fontSize: 11.5, color: COLORS.accent, marginTop: 3 },

  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.okBg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  exportOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  exportSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  exportTitle: { fontSize: 16, color: COLORS.text, textAlign: 'right' },
  exportSubtitle: { fontSize: 12.5, color: COLORS.textMuted, textAlign: 'right', marginBottom: SPACING.sm },
  exportRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  exportRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportRowLabel: { flex: 1, fontSize: 14.5, color: COLORS.text, textAlign: 'right' },
  exportCancel: {
    marginTop: SPACING.sm,
    height: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportCancelText: { fontSize: 14, color: COLORS.textMuted },
});

const vehicleStyles = StyleSheet.create({
  controls: { paddingTop: SPACING.md, gap: SPACING.md },

  list: { paddingTop: SPACING.md, gap: SPACING.md, paddingBottom: 28 },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    overflow: 'hidden',
    ...CARD_SHADOW,
  },
  cardAlert: { shadowColor: TONE_BAD, shadowOpacity: 0.18 },

  cardTop: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: SPACING.md,
    padding: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  cardTitleWrap: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  cardTitle: { fontSize: 15.5, flexShrink: 1 },
  cardSubtitle: { fontSize: 11.5, color: COLORS.textFaint },
  chip: { flexShrink: 0, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 10.5 },

  plate: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    backgroundColor: '#F5C518',
    borderRadius: 6,
    overflow: 'hidden',
  },
  plateFlag: {
    backgroundColor: '#1B4CA1',
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateFlagText: { color: '#FFFFFF', fontSize: 9 },
  plateText: { fontSize: 13, color: '#1A1A1A', paddingHorizontal: 8, paddingVertical: 5 },

  statsRow: {
    flexDirection: 'row-reverse',
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: '#EFEFEF',
  },
  statCell: { flex: 1, gap: 5, padding: SPACING.sm },
  statCellDivider: { borderLeftWidth: 1, borderLeftColor: '#EFEFEF' },
  statHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  statDot: { width: 6, height: 6, borderRadius: 3 },
  statLabel: { fontSize: 10.5, fontWeight: '600', color: '#8A8A8A' },
  statValue: { fontSize: 12.5, color: COLORS.text, textAlign: 'right' },
  statValueBad: { color: TONE_BAD },
  statTrack: {
    height: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: '#ECECEC',
    overflow: 'hidden',
    marginTop: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  statBar: { height: '100%', borderRadius: RADIUS.pill },
  statNote: { fontSize: 10, color: '#8A8A8A' },
  statNoteBad: { fontWeight: '700', color: TONE_BAD },

  restoreBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accentSoft,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  restoreText: { fontSize: 13, color: COLORS.accent },
});
