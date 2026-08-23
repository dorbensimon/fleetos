import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, TouchableOpacity, Animated, Easing } from 'react-native';
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
import { COLORS, RADIUS, SPACING, CARD_SHADOW, formatDate, daysUntilExpiry } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import {
  listVehicles,
  listComplianceForOwners,
  listDrivers,
  listDepartments,
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
 * each card leads with a status chip (worst of insurance/test/service)
 * and a three-column stats row with a colour-coded, animated fill bar
 * per item — mirrors the "Tolvex Vehicles" design canvas.
 */

const TONE_OK = '#1DBF73';
const TONE_WARN = '#F5A623';
const TONE_BAD = '#E5484D';
const TONE_NEUTRAL = '#979797';

function dateTone(days: number | null): string {
  if (days == null) return TONE_NEUTRAL;
  return days <= 30 ? TONE_BAD : days <= 90 ? TONE_WARN : TONE_OK;
}

function worstTone(tones: string[]): string {
  if (tones.includes(TONE_BAD)) return TONE_BAD;
  if (tones.includes(TONE_WARN)) return TONE_WARN;
  if (tones.every((t) => t === TONE_NEUTRAL)) return TONE_NEUTRAL;
  return TONE_OK;
}

function chipFor(tone: string): { label: string; bg: string; fg: string } {
  if (tone === TONE_BAD) return { label: 'דורש טיפול', bg: '#FDECEC', fg: TONE_BAD };
  if (tone === TONE_WARN) return { label: 'מתקרב מועד', bg: '#FFF6E5', fg: '#B9720A' };
  if (tone === TONE_NEUTRAL) return { label: 'חסר נתונים', bg: '#F2F2F2', fg: TONE_NEUTRAL };
  return { label: 'תקין', bg: '#EAF8F1', fg: '#118653' };
}

type StatusFilter = 'all' | 'active' | 'maintenance' | 'disabled' | 'archived';

export default function VehiclesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { companyId } = useCompany();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [compliance, setCompliance] = useState<Map<string, ComplianceItem[]>>(new Map());
  const [driverNames, setDriverNames] = useState<Map<string, string>>(new Map());
  const [departmentNames, setDepartmentNames] = useState<Map<string, string>>(new Map());
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

    const departments = await listDepartments(companyId);
    setDepartmentNames(new Map(departments.map((d) => [d.id, d.name])));
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
            const departmentName = item.department_id ? departmentNames.get(item.department_id) : null;
            const isArchived = item.status === 'archived';

            const insDays = daysUntilExpiry(insurance);
            const testDays = daysUntilExpiry(test);
            const kmToService = item.next_service_km != null ? item.next_service_km - item.odometer : null;

            const insTone = dateTone(insDays);
            const testTone = dateTone(testDays);
            const svcOverdue = kmToService != null && kmToService <= 0;
            const svcTone = kmToService == null ? TONE_NEUTRAL : svcOverdue ? TONE_BAD : TONE_OK;
            const worst = worstTone([insTone, testTone, svcTone]);
            const chip = chipFor(worst);

            return (
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.card, worst === TONE_BAD && !isArchived && styles.cardAlert]}
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
                    <View style={styles.titleRow}>
                      <AppText weight="bold" style={styles.cardTitle} numberOfLines={1}>
                        {[item.manufacturer, item.model].filter(Boolean).join(' ') || 'ללא דגם'}
                      </AppText>
                      {!isArchived && (
                        <View style={[styles.chip, { backgroundColor: chip.bg }]}>
                          <AppText weight="bold" style={[styles.chipText, { color: chip.fg }]} numberOfLines={1}>
                            {chip.label}
                          </AppText>
                        </View>
                      )}
                    </View>
                    <AppText style={styles.cardSubtitle} numberOfLines={1}>
                      {driverName ? `נהג: ${driverName}` : 'ללא נהג'}
                      {departmentName ? ` · מח': ${departmentName}` : ''}
                      {` · סוג: ${VEHICLE_TYPE_LABELS[item.vehicle_type] ?? item.vehicle_type}`}
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

                {isArchived ? (
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
                  <View style={styles.statsRow}>
                    <StatCell
                      label="ביטוח"
                      value={insurance ? formatDate(insurance) : 'חסר'}
                      note={insDays == null ? 'חסר' : insDays < 0 ? 'פג תוקף' : `${insDays} ימים`}
                      tone={insTone}
                      ratio={insDays == null ? 0.06 : Math.max(0, insDays) / 365}
                      showDivider
                    />
                    <StatCell
                      label="טסט"
                      value={test ? formatDate(test) : 'חסר'}
                      note={testDays == null ? 'חסר' : testDays < 0 ? 'פג תוקף' : `${testDays} ימים`}
                      tone={testTone}
                      ratio={testDays == null ? 0.06 : Math.max(0, testDays) / 365}
                      showDivider
                    />
                    <StatCell
                      label="טיפול"
                      value={item.next_service_km != null ? `${item.next_service_km.toLocaleString()} ק״מ` : 'חסר'}
                      note={
                        kmToService == null
                          ? 'חסר'
                          : svcOverdue
                            ? 'פג תוקף'
                            : `בעוד ${kmToService.toLocaleString()} ק״מ`
                      }
                      tone={svcTone}
                      ratio={svcOverdue ? 1 : 0.55}
                    />
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

/**
 * One column of the insurance/test/service stats row: a coloured dot +
 * label, the value, a fill bar that animates in from empty on mount
 * (matching the loading animation in the design canvas), and a note line.
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
    <View style={[styles.statCell, showDivider && styles.statCellDivider]}>
      <View style={styles.statHeader}>
        <View style={[styles.statDot, { backgroundColor: tone }]} />
        <AppText style={styles.statLabel} numberOfLines={1}>
          {label}
        </AppText>
      </View>
      <AppText weight="bold" style={[styles.statValue, isBad && styles.statValueBad]} numberOfLines={1}>
        {value}
      </AppText>
      <View style={styles.statTrack}>
        <Animated.View style={[styles.statBar, { width, backgroundColor: tone }]} />
      </View>
      <AppText style={[styles.statNote, isBad && styles.statNoteBad]} numberOfLines={1}>
        {note}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, gap: SPACING.md },

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
  statTrack: { height: 3, borderRadius: RADIUS.pill, backgroundColor: '#ECECEC', overflow: 'hidden', marginTop: 1 },
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
