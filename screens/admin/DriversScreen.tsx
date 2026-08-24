import React, { useCallback, useMemo, useState } from 'react';
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
  daysUntilExpiry,
  formatDate,
} from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { listDrivers, DriverRow } from '../../lib/adminApi';
import { exportDriversReport, REPORT_CATEGORIES, ReportCategory } from '../../lib/driverReport';
import { formatPlate } from '../../lib/plate';
import { formatPlate } from '../../libimport { RootStackParamList } from '../../navigation/types';

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
  const { companyId, company } = useCompany();

  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<LicenseFilter>('all');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingCategory, setExportingCategory] = useState<ReportCategory | null>(null);

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

  return (
    <Screen>
      <AdminGlassHeader
        query={search}
        onChangeQuery={setSearch}
        searchPlaceholder="חפש לפי שם, ת.ז או מספר עובד"
        toggleValue="drivers"
        onToggleChange={(v) => v === 'vehicles' && navigation.navigate('Vehicles')}
      />

      {loading ? (
        <LoadingState />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <>
              <View style={styles.kpiRow}>
                <TouchableOpacity
                  style={styles.kpiCard}
                  activeOpacity={0.8}
                  onPress={() => setExportMenuOpen(true)}
                >
                  <Ionicons name="document-text-outline" size={17} color={COLORS.textMuted} />
                  <AppText weight="bold" style={styles.kpiLabel}>
                    ייצוא דוח
                  </AppText>
                </TouchableOpacity>
              </View>

              <View style={styles.chipsWrap}>
                <FilterChips<LicenseFilter>
                  value={filter}
                  onChange={setFilter}
                  options={[
                    {
                      value: 'all',
                      label: 'הכל',
                      count: counts.all,
                      badgeColor: COLORS.accent,
                      icon: 'people-outline',
                    },
                    {
                      value: 'soon',
                      label: 'רישיון קרוב לפוג',
                      count: counts.soon,
                      badgeColor: COLORS.warnText,
                      icon: 'hourglass-outline',
                    },
                    {
                      value: 'expired',
                      label: 'רישיון פג',
                      count: counts.expired,
                      badgeColor: COLORS.dangerText,
                      icon: 'warning',
                    },
                    {
                      value: 'no_vehicle',
                      label: 'ללא רכב',
                      count: counts.noVehicle,
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
                    <View style={[styles.dot, { backgroundColor: licenseColor }]} />
                    <AppText style={[styles.licenseText, { color: licenseColor }]} numberOfLines={1}>
                      {licenseText}
                    <                  {item.vehicle_id && item.vehicle_plate && (
                    <TouchableOpacity
                      hitSlop={4}
                      onPress={(e) => {
                        e.stopPropagation();
                        navigation.navigate('VehicleDetail', { vehicleId: item.vehicle_id! });
                      }}
                    >
                      <AppText style={styles.vehicleLink} numberOfLines={1}>
                        רכב: {formatPlate(item.vehicle_plate)}
                      </AppText>
                    </TouchableOpacity>
                  )}
/AppText>
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

      <Modal
        visible={exportMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setExportMenuOpen(false)}
      >
        <Pressable style={styles.exportOverlay} onPress={() => setExportMenuOpen(false)}>
          <Pressable style={styles.exportSheet} onPress={(e) => e.stopPropagation()}>
            <AppText weight="bold" style={styles.exportTitle}>
              ייצוא דוח נהגים
            </AppText>
            <AppText style={styles.exportSubtitle}>בחר את קבוצת הנהגים לדוח</AppText>

            {REPORT_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.value}
                style={styles.exportRow}
                activeOpacity={0.7}
                disabled={!!exportingCategory}
                onPress={() => runExport(cat.value)}
              >
                <View style={styles.exportRowIcon}>
                  {exportingCategory === cat.value ? (
                    <ActivityIndicator size="small" color={COLORS.accent} />
                  ) : (
                    <Ionicons name={cat.icon as any} size={18} color={COLORS.accent} />
                  )}
                </View>
                <AppText weight="bold" style={styles.exportRowLabel}>
                  {cat.label}
                </AppText>
                <Ionicons name="chevron-back" size={16} color={COLORS.textFaint} />
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.exportCancel} onPress={() => setExportMenuOpen(false)}>
              <AppText weight="bold" style={styles.exportCancelText}>
                ביטול
              </AppText>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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

  chipsWrap: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },

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
  dot: { width: 6, height: 6, borderRadius: 3   vehicleLink: { fontSize: 11.5, color: COLORS.accent, marginTop: 3 },
},
  licenseText: { fontSize: 11 },
: SPACING.sm,
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
