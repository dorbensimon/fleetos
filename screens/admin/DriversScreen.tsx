import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Linking,
  Alert,
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
} from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { listDrivers, DriverRow } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';

/**
 * A4 — the driver list. Also the screen an admin lands on after login
 * (route "AdminHome").
 *
 * The one-tap call button matters here: fleet managers are usually
 * chasing a specific driver, and making them copy a number out of the
 * app defeats the purpose.
 */

type LicenseFilter = 'all' | 'valid' | 'soon' | 'expired' | 'no_vehicle';

export default function DriversScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { companyId } = useCompany();

  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<LicenseFilter>('all');

  const load = useCallback(async () => {
    if (!companyId) return;
    setDrivers(await listDrivers(companyId));
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
    return drivers.filter((d) => {
      const state = expiryState(d.license_expiry);

      const matchesFilter =
        filter === 'all' ||
        (filter === 'valid' && state === 'ok') ||
        (filter === 'soon' && state === 'soon') ||
        (filter === 'expired' && state === 'expired') ||
        (filter === 'no_vehicle' && !d.vehicle_plate);

      if (!matchesFilter) return false;
      if (!q) return true;

      return (
        (d.full_name ?? '').toLowerCase().includes(q) ||
        (d.national_id ?? '').includes(q) ||
        (d.employee_number ?? '').toLowerCase().includes(q) ||
        (d.phone ?? '').includes(q)
      );
    });
  }, [drivers, search, filter]);

  const counts = useMemo(() => {
    const byState = (s: string) =>
      drivers.filter((d) => expiryState(d.license_expiry) === s).length;
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

  const exportReport = () => {
    Alert.alert('ייצוא דוח', 'האפשרות תהיה זמינה בקרוב');
  };

  return (
    <Screen>
      <AdminGlassHeader
        title="ניהול צוות נהגים"
        subtitle={`${counts.all} נהגים פעילים`}
        query={search}
        onChangeQuery={setSearch}
        searchPlaceholder="חפש לפי שם, ת.ז או מספר עובד"
      />

      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Ionicons name="people-outline" size={17} color={COLORS.accent} />
          <AppText weight="bold" style={styles.kpiLabel}>
            נהגים פעילים
          </AppText>
          <View style={[styles.kpiBadge, { backgroundColor: COLORS.accent }]}>
            <AppText weight="bold" style={styles.kpiBadgeText}>
              {counts.all}
            </AppText>
          </View>
        </View>

        <View style={styles.kpiCard}>
          <Ionicons name="warning-outline" size={17} color={COLORS.dangerText} />
          <AppText weight="bold" style={styles.kpiLabel}>
            רישיון פג בקרוב
          </AppText>
          <View style={[styles.kpiBadge, { backgroundColor: COLORS.dangerText }]}>
            <AppText weight="bold" style={styles.kpiBadgeText}>
              {counts.soon}
            </AppText>
          </View>
        </View>

        <TouchableOpacity style={styles.kpiCard} activeOpacity={0.8} onPress={exportReport}>
          <Ionicons name="document-text-outline" size={17} color={COLORS.textMuted} />
          <AppText weight="bold" style={styles.kpiLabel}>
            ייצוא דוח
          </AppText>
        </TouchableOpacity>
      </View>

      <View style={styles.segment}>
        <View style={[styles.segmentBtn, styles.segmentBtnActive]}>
          <Ionicons name="people" size={15} color={COLORS.text} />
          <AppText weight="bold" style={styles.segmentTextActive}>
            נהגים
          </AppText>
        </View>
        <TouchableOpacity
          style={styles.segmentBtn}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Vehicles')}
        >
          <Ionicons name="car-outline" size={15} color={COLORS.textMuted} />
          <AppText weight="bold" style={styles.segmentText}>
            רכבים
          </AppText>
        </TouchableOpacity>
      </View>

      <View style={styles.chipsWrap}>
        <FilterChips<LicenseFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'הכל', count: counts.all },
            { value: 'soon', label: 'רישיון קרוב לפוג', count: counts.soon },
            { value: 'expired', label: 'רישיון פג', count: counts.expired },
            { value: 'no_vehicle', label: 'ללא רכב', count: counts.noVehicle },
          ]}
        />
      </View>

      {loading ? (
        <LoadingState />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title={drivers.length === 0 ? 'עדיין אין נהגים' : 'לא נמצאו נהגים'}
              hint={drivers.length === 0 ? 'הוסף את הנהג הראשון של החברה' : undefined}
            />
          }
          renderItem={({ item }) => {
            const state = expiryState(item.license_expiry);
            const warn = state === 'soon' || state === 'expired';
            const licenseText = item.license_expiry
              ? state === 'expired'
                ? `רישיון פג ב-${formatDate(item.license_expiry)}`
                : `רישיון בתוקף עד ${formatDate(item.license_expiry)}`
              : 'ללא תוקף רישיון';

            return (
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.card}
                onPress={() => navigation.navigate('DriverDetail', { driverId: item.id })}
              >
                <View style={styles.avatarWrap}>
                  <View style={styles.avatar}>
                    <AppText weight="bold" style={styles.avatarText}>
                      {(item.full_name ?? '?').trim().charAt(0)}
                    </AppText>
                  </View>
                  {!!item.license_classes && (
                    <View style={[styles.gradeBadge, warn && styles.gradeBadgeWarn]}>
                      <AppText weight="bold" style={[styles.gradeText, warn && styles.gradeTextWarn]}>
                        {item.license_classes}
                      </AppText>
                    </View>
                  )}
                </View>

                <View style={styles.cardTitleWrap}>
                  <AppText weight="bold" style={styles.cardTitle} numberOfLines={1}>
                    {item.full_name ?? 'ללא שם'}
                  </AppText>
                  <AppText style={styles.cardSubtitle} numberOfLines={1}>
                    {item.national_id ? `ת.ז ${item.national_id}` : 'ללא ת.ז'}
                  </AppText>
                  <View style={styles.licenseRow}>
                    <View style={[styles.dot, { backgroundColor: warn ? COLORS.warnText : COLORS.okText }]} />
                    <AppText style={[styles.licenseText, warn && styles.licenseTextWarn]} numberOfLines={1}>
                      {licenseText}
                    </AppText>
                  </View>
                </View>

                {!!item.phone && (
                  <TouchableOpacity style={styles.callBtn} onPress={() => call(item.phone)} hitSlop={8}>
                    <Ionicons name="call-outline" size={17} color={COLORS.okText} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      <AdminBottomBar
        actionLabel="הוסף נהג חדש"
        actionIcon="add"
        onAction={() => navigation.navigate('DriverForm', {})}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpiRow: {
    flexDirection: 'row-reverse',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
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
  kpiBadge: {
    position: 'absolute',
    top: -8,
    right: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.card,
  },
  kpiBadgeText: { fontSize: 11, color: COLORS.textInverse },

  segment: {
    flexDirection: 'row-reverse',
    borderRadius: RADIUS.md,
    padding: 3,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    backgroundColor: COLORS.card,
    ...SUBTLE_SHADOW,
  },
  segmentBtn: {
    flex: 1,
    height: 38,
    borderRadius: RADIUS.sm,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segmentBtnActive: { backgroundColor: COLORS.accentSoft },
  segmentText: { fontSize: 13, color: COLORS.textMuted },
  segmentTextActive: { fontSize: 13, color: COLORS.text },

  chipsWrap: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },

  list: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 110 },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
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
  licenseText: { fontSize: 11, color: COLORS.textMuted },
  licenseTextWarn: { color: COLORS.warnText },

  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.okBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
