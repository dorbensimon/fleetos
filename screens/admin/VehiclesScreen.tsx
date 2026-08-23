import React, { useCallback, useMemo, useState } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Screen,
  AppText,
  FilterChips,
  LoadingState,
  EmptyState,
  ExpiryBadge,
  Badge,
  AdminBottomBar,
  AdminGlassHeader,
} from '../../components/ui';
import {
  COLORS,
  RADIUS,
  SPACING,
  CARD_SHADOW,
  SUBTLE_SHADOW,
  expiryState,
  formatDate,
  ExpiryState,
} from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import {
  listVehicles,
  listComplianceForOwners,
  listDriverNames,
  Vehicle,
  ComplianceItem,
  DriverInfo,
} from '../../lib/adminApi';
import { VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '../../lib/compliance';
import { formatPlate, plateMatches } from '../../lib/plate';
import { RootStackParamList } from '../../navigation/types';

/**
 * A2 — the fleet list.
 *
 * With hundreds of vehicles nobody remembers the state of each one, so
 * the row leads with the two dates that actually matter operationally
 * (insurance and annual test) as colour-coded badges.
 */

type StatusFilter = 'all' | 'active' | 'maintenance' | 'disabled';

export default function VehiclesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { companyId } = useCompany();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [compliance, setCompliance] = useState<Map<string, ComplianceItem[]>>(new Map());
  const [driverNames, setDriverNames] = useState<Map<string, DriverInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    if (!companyId) return;
    const rows = await listVehicles(companyId);

    // Both lookups are driven by the rows we just fetched, so a vehicle
    // assigned a driver (or given a new expiry date) a second ago shows
    // the change on the very next refresh instead of a stale card.
    const [items, names] = await Promise.all([
      listComplianceForOwners('vehicle', rows.map((v) => v.id)),
      listDriverNames(rows.map((v) => v.primary_driver_id).filter(Boolean) as string[]),
    ]);

    setVehicles(rows);
    setCompliance(items);
    setDriverNames(names);
  }, [companyId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        try {
          await load();
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      const matchesStatus = status === 'all' || v.status === status;
      if (!matchesStatus) return false;
      if (!q) return true;
      return (
        // Digits-only match, so "1234567" finds "12-345-67" and vice versa.
        plateMatches(v.plate_number, q) ||
        v.plate_number.toLowerCase().includes(q) ||
        (v.model ?? '').toLowerCase().includes(q) ||
        (v.manufacturer ?? '').toLowerCase().includes(q) ||
        (v.internal_code ?? '').toLowerCase().includes(q)
      );
    });
  }, [vehicles, search, status]);

  const counts = useMemo(
    () => ({
      all: vehicles.length,
      active: vehicles.filter((v) => v.status === 'active').length,
      maintenance: vehicles.filter((v) => v.status === 'maintenance').length,
      disabled: vehicles.filter((v) => v.status === 'disabled').length,
    }),
    [vehicles]
  );

  /**
   * The first of `itemTypes` that actually carries a date.
   *
   * Insurance is the reason for the list: a fleet that only registered
   * ביטוח מקיף used to read "חסר" on every card, because the badge looked
   * at ביטוח חובה alone and stopped there.
   */
  const itemOf = (vehicleId: string, ...itemTypes: string[]): ComplianceItem | null => {
    const items = compliance.get(vehicleId) ?? [];
    const matches = itemTypes
      .map((type) => items.find((c) => c.item_type === type))
      .filter(Boolean) as ComplianceItem[];

    return (
      matches.find((c) => c.expiry_date) ?? matches.find((c) => c.last_date) ?? matches[0] ?? null
    );
  };

  return (
    <Screen>
      <AdminGlassHeader
        query={search}
        onChangeQuery={setSearch}
        searchPlaceholder="חיפוש לפי מספר רישוי"
        toggleValue="vehicles"
        onToggleChange={(v) => v === 'drivers' && navigation.navigate('AdminHome')}
      />

      {loading ? (
        <LoadingState />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(v) => v.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View style={styles.controls}>
              <FilterChips<StatusFilter>
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'all', label: 'הכל', count: counts.all, badgeColor: COLORS.accent },
                  { value: 'active', label: 'פעיל', count: counts.active, badgeColor: COLORS.okText },
                  {
                    value: 'maintenance',
                    label: 'בטיפול',
                    count: counts.maintenance,
                    badgeColor: COLORS.warnText,
                  },
                  {
                    value: 'disabled',
                    label: 'מושבת',
                    count: counts.disabled,
                    badgeColor: COLORS.dangerText,
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
            const mandatory = itemOf(item.id, 'insurance_mandatory');
            const comprehensive = itemOf(item.id, 'insurance_comprehensive');
            const test = itemOf(item.id, 'annual_test');
            const driver = item.primary_driver_id ? driverNames.get(item.primary_driver_id) : null;

            return (
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.card}
                onPress={() => navigation.navigate('VehicleDetail', { vehicleId: item.id })}
              >
                <View style={styles.cardTop}>
                  <View style={styles.plate}>
                    <View style={styles.plateFlag}>
                      <AppText weight="bold" style={styles.plateFlagText}>
                        IL
                      </AppText>
                    </View>
                    <AppText weight="bold" style={styles.plateText}>
                      {formatPlate(item.plate_number)}
                    </AppText>
                  </View>

                  <View style={styles.cardTitleWrap}>
                    <AppText weight="bold" style={styles.cardTitle} numberOfLines={1}>
                      {[item.manufacturer, item.model].filter(Boolean).join(' ') || 'ללא דגם'}
                    </AppText>
                    <AppText style={styles.cardSubtitle} numberOfLines={1}>
                      {VEHICLE_TYPE_LABELS[item.vehicle_type] ?? item.vehicle_type}
                      {driver
                        ? ` · נהג: ${driver.full_name}${
                            driver.license_classes ? ` (${driver.license_classes})` : ''
                          }`
                        : ' · ללא נהג'}
                    </AppText>
                  </View>

                  {item.status !== 'active' && (
                    <Badge
                      label={VEHICLE_STATUS_LABELS[item.status] ?? item.status}
                      bg={COLORS.neutralBg}
                      fg={COLORS.neutralText}
                    />
                  )}
                </View>

                <View style={styles.cardMeta}>
                  <InsuranceBadge
                    mandatory={mandatory}
                    comprehensive={comprehensive}
                    onPress={() =>
                      navigation.navigate('VehicleDetail', { vehicleId: item.id, tab: 'documents' })
                    }
                  />
                  <MetaBadge label="טסט" item={test} />
                  <ServiceBadge vehicle={item} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </Screen>
  );
}

/**
 * Items like the annual test are often filled in as "when it was done"
 * rather than "when it expires". Showing "חסר" in that case is simply
 * wrong — the date IS on file — so the last-inspection date is shown
 * instead, in neutral grey to keep it distinct from a valid expiry.
 */
function MetaBadge({ label, item }: { label: string; item: ComplianceItem | null }) {
  const expiry = item?.expiry_date ?? null;
  const lastDate = item?.last_date ?? null;

  const badge = expiry
    ? { state: expiryState(expiry), text: formatDate(expiry) }
    : lastDate
    ? { state: 'missing' as const, text: `בוצע ${formatDate(lastDate)}` }
    : { state: 'missing' as const, text: 'חסר' };

  return (
    <View style={styles.metaItem}>
      <AppText style={styles.metaLabel}>{label}</AppText>
      <ExpiryBadge
        state={badge.state}
        label={badge.text}
        style={styles.metaBadge}
        textStyle={styles.metaBadgeText}
        numberOfLines={2}
      />
    </View>
  );
}

/**
 * Insurance needs both the mandatory and comprehensive policies covered
 * before it counts as "fine" — a vehicle can carry ביטוח חובה and still
 * be uninsured for damage, so the badge collapses both dates into one
 * status: red the moment either is missing or already expired, amber
 * the moment either has under a month left, and a green checkmark only
 * once both are comfortably valid. Tapping it jumps straight to the
 * vehicle's documents tab, where the two dates are actually edited.
 */
function InsuranceBadge({
  mandatory,
  comprehensive,
  onPress,
}: {
  mandatory: ComplianceItem | null;
  comprehensive: ComplianceItem | null;
  onPress: () => void;
}) {
  const states: ExpiryState[] = [
    expiryState(mandatory?.expiry_date ?? null),
    expiryState(comprehensive?.expiry_date ?? null),
  ];

  const badge = states.includes('expired') || states.includes('missing')
    ? { state: 'expired' as const, text: 'פג תוקף' }
    : states.includes('soon')
    ? { state: 'soon' as const, text: 'נדרש בקרוב' }
    : { state: 'ok' as const, text: 'תקין ✓' };

  return (
    <TouchableOpacity style={styles.metaItem} activeOpacity={0.7} onPress={onPress} hitSlop={6}>
      <AppText style={styles.metaLabel}>ביטוח</AppText>
      <ExpiryBadge
        state={badge.state}
        label={badge.text}
        style={styles.metaBadge}
        textStyle={styles.metaBadgeText}
        numberOfLines={2}
      />
    </TouchableOpacity>
  );
}

/**
 * Distance to the next service, straight from the odometer.
 *
 * Mirrors the insurance badge's three states so all three meta badges
 * read at a glance: a green checkmark while there's plenty of distance
 * left, amber once the vehicle is within the service interval's last
 * stretch (or the last 1,000 km, whichever is smaller), and red — with
 * the overshoot spelled out — the moment it's past due.
 */
function ServiceBadge({ vehicle }: { vehicle: Vehicle }) {
  const target = vehicle.next_service_km;

  if (target == null) {
    return (
      <View style={styles.metaItem}>
        <AppText style={styles.metaLabel}>טיפול</AppText>
        <ExpiryBadge
          state="missing"
          label="לא הוגדר"
          style={styles.metaBadge}
          textStyle={styles.metaBadgeText}
          numberOfLines={2}
        />
      </View>
    );
  }

  const remaining = target - vehicle.odometer;
  const soonThreshold = vehicle.service_interval_km
    ? Math.min(1000, Math.round(vehicle.service_interval_km * 0.1))
    : 1000;

  const badge =
    remaining <= 0
      ? { state: 'expired' as const, text: `בחריגה ${Math.abs(remaining).toLocaleString()} ק״מ` }
      : remaining <= soonThreshold
      ? { state: 'soon' as const, text: 'יפוג בקרוב' }
      : { state: 'ok' as const, text: 'תקין ✓' };

  return (
    <View style={styles.metaItem}>
      <AppText style={styles.metaLabel}>טיפול</AppText>
      <ExpiryBadge
        state={badge.state}
        label={badge.text}
        style={styles.metaBadge}
        textStyle={styles.metaBadgeText}
        numberOfLines={2}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, gap: SPACING.md },

  list: { paddingTop: SPACING.md, gap: SPACING.md, paddingBottom: 28 },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginHorizontal: SPACING.lg,
    gap: SPACING.md,
    ...CARD_SHADOW,
  },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.md },
  cardTitleWrap: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 15 },
  cardSubtitle: { fontSize: 12.5, color: COLORS.textMuted },

  plate: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#F5C518',
    borderRadius: 6,
    overflow: 'hidden',
  },
  plateFlag: {
    backgroundColor: '#1B4CA1',
    paddingHorizontal: 5,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateFlagText: { color: '#FFFFFF', fontSize: 9 },
  plateText: { fontSize: 13, color: '#1A1A1A', paddingHorizontal: 8, paddingVertical: 5 },

  cardMeta: {
    flexDirection: 'row-reverse',
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
  // Fixed thirds rather than a wrapping row — a badge's text can still
  // grow (e.g. "בחריגה 3,300 ק״מ") without ever pushing the next badge
  // to a second line, since it wraps inside its own column instead.
  metaItem: { flex: 1, alignItems: 'center', gap: 4 },
  metaLabel: { fontSize: 12, color: COLORS.textMuted },
  metaBadge: { alignSelf: 'stretch', alignItems: 'center' },
  metaBadgeText: { fontSize: 10.5, textAlign: 'center' },
});
