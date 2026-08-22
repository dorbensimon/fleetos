import React, { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Screen,
  Card,
  AppText,
  LoadingState,
  ExpiryBadge,
} from '../../components/ui';
import { COLORS, RADIUS, SPACING, CARD_SHADOW, expiryState, formatDate } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import {
  listVehicles,
  listDrivers,
  listComplianceForOwners,
  Vehicle,
  DriverRow,
} from '../../lib/adminApi';
import { findComplianceDef } from '../../lib/compliance';
import { RootStackParamList } from '../../navigation/types';

/**
 * A1 — the admin's landing screen.
 *
 * Its job is a single glance: how big is the fleet, and what needs
 * attention today. Anything expired or expiring within 30 days is
 * collected into one list ordered by urgency.
 */

interface UrgentItem {
  key: string;
  ownerType: 'vehicle' | 'driver';
  ownerId: string;
  title: string;
  subtitle: string;
  expiry: string | null;
  daysLeft: number;
}

export default function DashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { companyId, company, loading: companyLoading } = useCompany();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [urgent, setUrgent] = useState<UrgentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;

    const [vehicleRows, driverRows] = await Promise.all([
      listVehicles(companyId),
      listDrivers(companyId),
    ]);

    setVehicles(vehicleRows);
    setDrivers(driverRows);

    const [vehicleCompliance, driverCompliance] = await Promise.all([
      listComplianceForOwners('vehicle', vehicleRows.map((v) => v.id)),
      listComplianceForOwners('driver', driverRows.map((d) => d.id)),
    ]);

    const items: UrgentItem[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pushIfUrgent = (
      ownerType: 'vehicle' | 'driver',
      ownerId: string,
      title: string,
      subtitle: string,
      expiry: string | null,
      key: string
    ) => {
      const state = expiryState(expiry);
      if (state !== 'expired' && state !== 'soon') return;
      const target = new Date(expiry!);
      target.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((target.getTime() - today.getTime()) / 86_400_000);
      items.push({ key, ownerType, ownerId, title, subtitle, expiry, daysLeft });
    };

    for (const v of vehicleRows) {
      for (const c of vehicleCompliance.get(v.id) ?? []) {
        const def = findComplianceDef('vehicle', c.item_type);
        pushIfUrgent(
          'vehicle',
          v.id,
          def?.label ?? c.item_type,
          `${v.plate_number}${v.model ? ` · ${v.model}` : ''}`,
          c.expiry_date,
          `v-${c.id}`
        );
      }
    }

    for (const d of driverRows) {
      pushIfUrgent(
        'driver',
        d.id,
        'רישיון נהיגה',
        d.full_name ?? 'ללא שם',
        d.license_expiry,
        `d-lic-${d.id}`
      );
      for (const c of driverCompliance.get(d.id) ?? []) {
        const def = findComplianceDef('driver', c.item_type);
        pushIfUrgent(
          'driver',
          d.id,
          def?.label ?? c.item_type,
          d.full_name ?? 'ללא שם',
          c.expiry_date,
          `d-${c.id}`
        );
      }
    }

    items.sort((a, b) => a.daysLeft - b.daysLeft);
    setUrgent(items);
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

  if (companyLoading || loading) {
    return (
      <Screen>
        <View style={styles.header}>
          <AppText weight="bold" style={styles.headerTitle}>
            דשבורד
          </AppText>
        </View>
        <LoadingState />
      </Screen>
    );
  }

  const activeVehicles = vehicles.filter((v) => v.status === 'active').length;
  const inMaintenance = vehicles.filter((v) => v.status === 'maintenance').length;

  return (
    <Screen>
      <View style={styles.header}>
        <AppText weight="bold" style={styles.headerTitle}>
          דשבורד
        </AppText>
        <AppText style={styles.headerSubtitle}>{company?.name ?? ''}</AppText>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.kpiGrid}>
          <Kpi label="רכבים פעילים" value={activeVehicles} icon="car-outline" />
          <Kpi label="נהגים" value={drivers.length} icon="people-outline" />
          <Kpi label="בטיפול" value={inMaintenance} icon="construct-outline" />
          <Kpi
            label="דורש טיפול"
            value={urgent.length}
            icon="alert-circle-outline"
            danger={urgent.length > 0}
          />
        </View>

        <Card style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText weight="bold" style={styles.sectionTitle}>
              דורש טיפול דחוף
            </AppText>
            {urgent.length > 0 && (
              <AppText style={styles.sectionCount}>{urgent.length}</AppText>
            )}
          </View>

          {urgent.length === 0 ? (
            <View style={styles.allClear}>
              <Ionicons name="checkmark-circle-outline" size={30} color={COLORS.okText} />
              <AppText style={styles.allClearText}>הכול בתוקף — אין פריטים שדורשים טיפול</AppText>
            </View>
          ) : (
            urgent.slice(0, 12).map((item) => (
              <TouchableOpacity
                key={item.key}
                activeOpacity={0.7}
                style={styles.urgentRow}
                onPress={() =>
                  item.ownerType === 'vehicle'
                    ? navigation.navigate('VehicleDetail', { vehicleId: item.ownerId })
                    : navigation.navigate('DriverDetail', { driverId: item.ownerId })
                }
              >
                <Ionicons
                  name={item.ownerType === 'vehicle' ? 'car-outline' : 'person-outline'}
                  size={17}
                  color={COLORS.textFaint}
                />
                <View style={styles.urgentText}>
                  <AppText weight="bold" style={styles.urgentTitle} numberOfLines={1}>
                    {item.title}
                  </AppText>
                  <AppText style={styles.urgentSubtitle} numberOfLines={1}>
                    {item.subtitle} · {formatDate(item.expiry)}
                  </AppText>
                </View>
                <ExpiryBadge
                  state={expiryState(item.expiry)}
                  label={
                    item.daysLeft < 0
                      ? `${Math.abs(item.daysLeft)} ימי חריגה`
                      : `${item.daysLeft} ימים`
                  }
                />
              </TouchableOpacity>
            ))
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Kpi({
  label,
  value,
  icon,
  danger,
}: {
  label: string;
  value: number;
  icon: any;
  danger?: boolean;
}) {
  return (
    <View style={styles.kpi}>
      <Ionicons
        name={icon}
        size={18}
        color={danger && value > 0 ? COLORS.dangerText : COLORS.accent}
      />
      <AppText
        weight="bold"
        style={[styles.kpiValue, danger && value > 0 && { color: COLORS.dangerText }]}
      >
        {value}
      </AppText>
      <AppText style={styles.kpiLabel}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 56,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    backgroundColor: COLORS.card,
  },
  headerTitle: { fontSize: 23 },
  headerSubtitle: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },

  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 40 },

  kpiGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: SPACING.md },
  kpi: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: 4,
    alignItems: 'flex-end',
    ...CARD_SHADOW,
  },
  kpiValue: { fontSize: 26, marginTop: 4 },
  kpiLabel: { fontSize: 12.5, color: COLORS.textMuted },

  section: { gap: 2 },
  sectionHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  sectionTitle: { fontSize: 16 },
  sectionCount: { fontSize: 13, color: COLORS.dangerText },

  allClear: { alignItems: 'center', gap: 8, paddingVertical: SPACING.xl },
  allClearText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },

  urgentRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  urgentText: { flex: 1, gap: 2 },
  urgentTitle: { fontSize: 14 },
  urgentSubtitle: { fontSize: 12, color: COLORS.textMuted },
});
