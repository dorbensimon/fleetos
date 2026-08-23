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
  EXPIRY_STYLE,
} from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import {
  listVehicles,
  listComplianceForOwners,
  listDrivers,
  updateVehicle,
  Vehicle,
  ComplianceItem,
} from '../../lib/adminApi';
import { VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '../../lib/compliance';
import { formatPlate } from '../../lib/plate';
import { RootStackParamList } from '../../navigation/types';

/**
 * A2 — the fleet list.
 *
 * With hundreds of vehicles nobody remembers the state of each one, so
 * the row leads with the two dates that actually matter operationally
 * (insurance and annual test) as colour-coded badges.
 */

type StatusFilter = 'all' | 'active' | 'maintenance' | 'disabled' | 'archived';

export default function VehiclesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { companyId } = useCompany();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [compliance, setCompliance] = useState<Map<string, ComplianceItem[]>>(new Map());
  const [driverNames, setDriverNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    if (!companyId) return;
    const rows = await listVehicles(companyId, true);
    setVehicles(rows);
    setCompliance(await listComplianceForOwners('vehicle', rows.map((v) => v.id)));

    const drivers = await listDrivers(companyId);
    setDriverNames(new Map(drivers.map((d) => [d.id, d.full_name ?? 'ללא שם'])));
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
      const matchesStatus = status === 'all' ? v.status !== 'archived' : v.status === status;
      if (!matchesStatus) return false;
      if (!q) return true;
      return (
        v.plate_number.toLowerCase().includes(q) ||
        (v.model ?? '').toLowerCase().includes(q) ||
        (v.manufacturer ?? '').toLowerCase().includes(q) ||
        (v.internal_code ?? '').toLowerCase().includes(q)
      );
    });
  }, [vehicles, search, status]);

  const counts = useMemo(
    () => ({
      all: vehicles.filter((v) => v.status !== 'archived').length,
      active: vehicles.filter((v) => v.status === 'active').length,
      maintenance: vehicles.filter((v) => v.status === 'maintenance').length,
      disabled: vehicles.filter((v) => v.status === 'disabled').length,
      archived: vehicles.filter((v) => v.status === 'archived').length,
    }),
    [vehicles]
  );

  const restore = async (vehicleId: string) => {
    await updateVehicle(vehicleId, { status: 'active' });
    await load();
  };

  const expiryOf = (vehicleId: string, itemType: string) =>
    compliance.get(vehicleId)?.find((c) => c.item_type === itemType)?.expiry_date ?? null;

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
                  {
                    value: 'archived',
                    label: 'בארכיון',
                    count: counts.archived,
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
            const driverName = item.primary_driver_id
              ? driverNames.get(item.primary_driver_id)
              : null;

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
                      {`סוג: ${VEHICLE_TYPE_LABELS[item.vehicle_type] ?? item.vehicle_type}`}
                      {driverName ? ` · נהג: ${driverName}` : ' · ללא נהג'}
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

                {item.status === 'archived' ? (
                  <TouchableOpacity
                    style={styles.restoreBtn}
                    activeOpacity={0.8}
                    onPress={(e) => {
                      e.stopPropagation();
                      restore(item.id);
                    }}
                  >
                    <AppText weight="bold" style={styles.restoreText}>
                      שחזר מארכיון
                    </AppText>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.cardMeta}>
                    <MetaBadge label="ביטוח" date={insurance} />
                    <MetaBadge label="טסט" date={test} />
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </Screen>
  );
}

function MetaBadge({ label, date }: { label: string; date: string | null }) {
  const state = expiryState(date);
  const style = EXPIRY_STYLE[state];

  const icon: keyof typeof Ionicons.glyphMap =
    state === 'ok'
      ? 'checkmark-circle'
      : state === 'soon'
        ? 'hourglass-outline'
        : state === 'expired'
          ? 'alert-circle'
          : 'help-circle-outline';

  const text =
    state === 'ok'
      ? ''
      : state === 'soon'
        ? formatDate(date!)
        : state === 'expired'
          ? `פג תוקף · ${formatDate(date!)}`
          : 'חסר';

  return (
    <View style={styles.metaItem}>
      <AppText style={styles.metaLabel}>{label}</AppText>
      <View style={[styles.expiryPill, { backgroundColor: style.bg }]}>
        <Ionicons name={icon} size={14} color={style.fg} />
        {!!text && (
          <AppText weight="bold" style={[styles.expiryPillText, { color: style.fg }]}>
            {text}
          </AppText>
        )}
      </View>
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
    gap: SPACING.xl,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    paddingTop: SPACING.md,
  },
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  metaLabel: { fontSize: 12, color: COLORS.textMuted },
  expiryPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  expiryPillText: { fontSize: 12 },

  restoreBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accentSoft,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    marginTop: 2,
  },
  restoreText: { fontSize: 13, color: COLORS.accent },
});
