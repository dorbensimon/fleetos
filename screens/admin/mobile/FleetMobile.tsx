import React from 'react';
import { FlatList, RefreshControl, StatusBar, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  DK,
  DK_SPACE,
  DKText,
  EmptyPanel,
  ErrorPanel,
  Fab,
  FilterPills,
  GlassSearch,
  HeroButton,
  HeroStat,
  LoadingPanel,
  NightHero,
  NightUnderlay,
  Pressy,
  Reveal,
  STATUS,
  Segmented,
  type Status,
} from '../../../components/driverKit';
import { BrandLogo } from '../../../components/ui/Brand';
import { timeGreeting } from '../../../lib/theme';
import type { AttentionSummary, ComplianceItem, DriverRow, Vehicle, VehicleDriverWithProfile } from '../../../lib/adminApi';
import { DriverFleetCard, VehicleFleetCard } from './FleetCards';

export type DriverFilter = 'all' | 'valid' | 'soon' | 'expired' | 'no_vehicle';
export type VehicleFilter = 'all' | 'active' | 'maintenance' | 'disabled' | 'archived' | 'insurance' | 'no_driver';
type Mode = 'drivers' | 'vehicles';

type Props = {
  insetTop: number;
  insetBottom: number;
  firstName: string;
  companyName: string;
  unread: number;
  attention: AttentionSummary | null;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  refreshing: boolean;
  onRefresh: () => void;

  drivers: DriverRow[];
  driverTotal: number;
  driverCounts: { all: number; soon: number; expired: number; noVehicle: number; valid: number };
  driverFilter: DriverFilter;
  onDriverFilter: (value: DriverFilter) => void;
  driverSearch: string;
  onDriverSearch: (value: string) => void;
  driversLoading: boolean;
  driversError: string | null;
  onRetryDrivers: () => void;
  archivedCount: number;
  pendingSigning: Map<string, number>;

  vehicles: Vehicle[];
  vehicleTotal: number;
  vehicleCounts: { all: number; active: number; maintenance: number; disabled: number; archived: number; insurance: number; noDriver: number };
  vehicleFilter: VehicleFilter;
  onVehicleFilter: (value: VehicleFilter) => void;
  vehicleSearch: string;
  onVehicleSearch: (value: string) => void;
  vehiclesLoading: boolean;
  vehiclesError: string | null;
  onRetryVehicles: () => void;
  compliance: Map<string, ComplianceItem[]>;
  vehicleDrivers: Map<string, VehicleDriverWithProfile[]>;
  departmentNames: Map<string, string>;
  restoringVehicleId: string | null;

  onMenu: () => void;
  onNotifications: () => void;
  onAttention: () => void;
  onArchive: () => void;
  onOpenDriver: (id: string) => void;
  onOpenVehicle: (id: string) => void;
  onCallDriver: (phone: string | null) => void;
  onRestoreVehicle: (id: string) => void;
  onAddDriver: () => void;
  onAddVehicle: () => void;
};

type Entry =
  | { kind: 'bar' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'empty' }
  | { kind: 'driver'; item: DriverRow; index: number }
  | { kind: 'vehicle'; item: Vehicle; index: number };

/**
 * The fleet manager's home. The night carries the company, what needs
 * attention, the drivers/vehicles switch and three live counts that double
 * as filters; below, the list itself with its filters pinned while it
 * scrolls, and one floating action to add.
 */
export function FleetMobile(p: Props) {
  const drivers = p.mode === 'drivers';
  const loading = drivers ? p.driversLoading : p.vehiclesLoading;
  const error = drivers ? p.driversError : p.vehiclesError;
  const hasAny = drivers ? p.driverTotal > 0 : p.vehicleTotal > 0;
  const items: Entry[] = drivers
    ? p.drivers.map((item, index) => ({ kind: 'driver', item, index }))
    : p.vehicles.map((item, index) => ({ kind: 'vehicle', item, index }));
  const data: Entry[] = [
    { kind: 'bar' },
    ...(loading ? [{ kind: 'loading' as const }] : error && !hasAny ? [{ kind: 'error' as const }] : items.length ? items : [{ kind: 'empty' as const }]),
  ];
  const search = drivers ? p.driverSearch : p.vehicleSearch;
  const filtered = drivers ? p.driverFilter !== 'all' : p.vehicleFilter !== 'all';

  const clear = () => {
    if (drivers) {
      p.onDriverSearch('');
      p.onDriverFilter('all');
    } else {
      p.onVehicleSearch('');
      p.onVehicleFilter('all');
    }
  };

  const renderItem = ({ item: entry }: { item: Entry }) => {
    switch (entry.kind) {
      case 'bar':
        return (
          <View style={styles.bar}>
            {drivers ? (
              <FilterPills<DriverFilter>
                value={p.driverFilter}
                onChange={p.onDriverFilter}
                options={[
                  { value: 'all', label: 'הכל', count: p.driverCounts.all },
                  { value: 'expired', label: 'רישיון פג', count: p.driverCounts.expired, tone: 'expired' },
                  { value: 'soon', label: 'קרוב לפוג', count: p.driverCounts.soon, tone: 'soon' },
                  { value: 'valid', label: 'בתוקף', count: p.driverCounts.valid, tone: 'ok' },
                  { value: 'no_vehicle', label: 'ללא רכב', count: p.driverCounts.noVehicle },
                ]}
                trailing={
                  <Pressy onPress={p.onArchive} accessibilityLabel={`ארכיון נהגים, ${p.archivedCount}`} style={styles.archivePill} pressScale={0.95}>
                    <Ionicons name="archive-outline" size={16} color={DK.inkSoft} />
                    <DKText variant="label" color={DK.inkSoft}>
                      ארכיון
                    </DKText>
                    {p.archivedCount > 0 && (
                      <DKText variant="micro" color={DK.muted} ltr>
                        {p.archivedCount}
                      </DKText>
                    )}
                  </Pressy>
                }
              />
            ) : (
              <FilterPills<VehicleFilter>
                value={p.vehicleFilter}
                onChange={p.onVehicleFilter}
                options={[
                  { value: 'all', label: 'הכל', count: p.vehicleCounts.all },
                  { value: 'active', label: 'פעיל', count: p.vehicleCounts.active, tone: 'ok' },
                  { value: 'insurance', label: 'ביטוח לא בתוקף', count: p.vehicleCounts.insurance, tone: 'expired' },
                  { value: 'no_driver', label: 'ללא נהג', count: p.vehicleCounts.noDriver },
                  { value: 'maintenance', label: 'בטיפול', count: p.vehicleCounts.maintenance, tone: 'soon' },
                  { value: 'disabled', label: 'מושבת', count: p.vehicleCounts.disabled, tone: 'expired' },
                  { value: 'archived', label: 'בארכיון', count: p.vehicleCounts.archived },
                ]}
              />
            )}
          </View>
        );
      case 'loading':
        return (
          <View style={styles.cell}>
            <LoadingPanel />
          </View>
        );
      case 'error':
        return (
          <View style={styles.cell}>
            <ErrorPanel message={drivers ? 'לא ניתן לטעון את הנהגים' : 'לא ניתן לטעון את הרכבים'} hint={error ?? undefined} onRetry={drivers ? p.onRetryDrivers : p.onRetryVehicles} />
          </View>
        );
      case 'empty':
        return (
          <View style={styles.cell}>
            <Reveal>
              {hasAny ? (
                <EmptyPanel
                  icon="search"
                  tone="muted"
                  title={drivers ? 'לא נמצאו נהגים' : 'לא נמצאו רכבים'}
                  body={search ? `אין תוצאות עבור "${search}"${filtered ? ' בסינון הנוכחי' : ''}.` : 'אין פריטים שמתאימים לסינון הזה.'}
                  action={{ label: 'הצגת הכל', icon: 'refresh', onPress: clear }}
                />
              ) : (
                <EmptyPanel
                  icon={drivers ? 'people' : 'car-sport'}
                  title={drivers ? 'עדיין אין נהגים' : 'עדיין אין רכבים'}
                  body={drivers ? 'הוסף את הנהג הראשון, עם מייל וסיסמה שבהם הוא ייכנס לאפליקציה.' : 'הוסף את הרכב הראשון, ואפשר למלא את פרטיו אוטומטית לפי מספר הרישוי.'}
                  action={{ label: drivers ? 'הוספת נהג' : 'הוספת רכב', icon: 'add', onPress: drivers ? p.onAddDriver : p.onAddVehicle }}
                />
              )}
            </Reveal>
          </View>
        );
      case 'driver':
        return (
          <View style={styles.cell}>
            <Reveal index={Math.min(entry.index, 8)}>
              <DriverFleetCard
                item={entry.item}
                pendingSigning={p.pendingSigning.get(entry.item.id) ?? 0}
                onPress={() => p.onOpenDriver(entry.item.id)}
                onPressVehicle={p.onOpenVehicle}
                onCall={() => p.onCallDriver(entry.item.phone)}
              />
            </Reveal>
          </View>
        );
      case 'vehicle':
        return (
          <View style={styles.cell}>
            <Reveal index={Math.min(entry.index, 8)}>
              <VehicleFleetCard
                item={entry.item}
                compliance={p.compliance.get(entry.item.id)}
                drivers={p.vehicleDrivers.get(entry.item.id)}
                departmentName={entry.item.department_id ? p.departmentNames.get(entry.item.department_id) ?? null : null}
                restoring={p.restoringVehicleId === entry.item.id}
                onPress={() => p.onOpenVehicle(entry.item.id)}
                onRestore={() => p.onRestoreVehicle(entry.item.id)}
              />
            </Reveal>
          </View>
        );
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      {/* The clock sits on a fixed strip of night, so the pinned filters
          stop under it instead of sliding beneath the status bar. */}
      <View style={[styles.statusStrip, { height: p.insetTop }]} />
      <View style={styles.flex}>
        <NightUnderlay />
        <FlatList
          data={data}
          keyExtractor={(entry) => (entry.kind === 'driver' || entry.kind === 'vehicle' ? entry.item.id : entry.kind)}
          renderItem={renderItem}
          ListHeaderComponent={<Hero {...p} />}
          stickyHeaderIndices={[1]}
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: p.insetBottom + 104 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          windowSize={9}
          refreshControl={<RefreshControl refreshing={p.refreshing} onRefresh={p.onRefresh} tintColor="#FFFFFF" colors={[DK.accent]} />}
        />
      </View>
      <Fab label={drivers ? 'נהג חדש' : 'רכב חדש'} onPress={drivers ? p.onAddDriver : p.onAddVehicle} bottom={p.insetBottom + 18} />
    </View>
  );
}

function Hero(p: Props) {
  const drivers = p.mode === 'drivers';
  const stats: { label: string; value: number; dot?: string; filter: string }[] = drivers
    ? [
        { label: 'נהגים', value: p.driverCounts.all, filter: 'all' },
        { label: 'רישיון פג', value: p.driverCounts.expired, dot: STATUS.expired.fill, filter: 'expired' },
        { label: 'קרוב לפוג', value: p.driverCounts.soon, dot: STATUS.soon.fill, filter: 'soon' },
      ]
    : [
        { label: 'רכבים', value: p.vehicleCounts.all, filter: 'all' },
        { label: 'ביטוח פג', value: p.vehicleCounts.insurance, dot: STATUS.expired.fill, filter: 'insurance' },
        { label: 'ללא נהג', value: p.vehicleCounts.noDriver, dot: STATUS.soon.fill, filter: 'no_driver' },
      ];
  const active = drivers ? p.driverFilter : p.vehicleFilter;
  const pick = (filter: string) => {
    const next = active === filter && filter !== 'all' ? 'all' : filter;
    if (drivers) p.onDriverFilter(next as DriverFilter);
    else p.onVehicleFilter(next as VehicleFilter);
  };

  return (
    <NightHero insetTop={0}>
      <View style={styles.topBar}>
        <HeroButton icon="menu" label="תפריט" onPress={p.onMenu} />
        <BrandLogo height={20} onDark />
        <HeroButton
          icon="notifications-outline"
          label={p.unread ? `התראות, ${p.unread} חדשות` : 'התראות'}
          onPress={p.onNotifications}
          badge={p.unread > 0}
        />
      </View>

      <Reveal index={0}>
        <DKText variant="caption" color={DK.onNightMuted}>
          {[timeGreeting(), p.firstName].filter(Boolean).join(', ')}
        </DKText>
        <DKText variant="display" color={DK.onNight} numberOfLines={2} accessibilityRole="header">
          {p.companyName || ' '}
        </DKText>
      </Reveal>

      {!!p.attention && (
        <Reveal index={1}>
          <AttentionPanel summary={p.attention} onPress={p.onAttention} />
        </Reveal>
      )}

      <Reveal index={2} style={styles.block}>
        <Segmented<Mode>
          onNight
          value={p.mode}
          onChange={p.onModeChange}
          options={[
            { value: 'drivers', label: 'נהגים', icon: 'people', count: p.driverTotal },
            { value: 'vehicles', label: 'רכבים', icon: 'car-sport', count: p.vehicleTotal },
          ]}
        />
      </Reveal>

      <Reveal index={3} style={styles.stats}>
        {stats.map((s) => (
          <HeroStat key={s.filter} value={s.value} label={s.label} dot={s.dot} active={active === s.filter && s.filter !== 'all'} onPress={() => pick(s.filter)} />
        ))}
      </Reveal>

      <Reveal index={4} style={styles.block}>
        <GlassSearch
          value={drivers ? p.driverSearch : p.vehicleSearch}
          onChangeText={drivers ? p.onDriverSearch : p.onVehicleSearch}
          placeholder={drivers ? 'שם, ת.ז, טלפון או מספר רכב' : 'מספר רישוי, דגם, קוד או נהג'}
        />
      </Reveal>
    </NightHero>
  );
}

/** What needs the manager, in one tappable line — or a calm "all clear". */
function AttentionPanel({ summary, onPress }: { summary: AttentionSummary; onPress: () => void }) {
  const parts = [
    summary.license && `${summary.license} ${summary.license === 1 ? 'רישיון' : 'רישיונות'}`,
    summary.insurance && `${summary.insurance} ${summary.insurance === 1 ? 'ביטוח' : 'ביטוחים'}`,
    summary.unassignedVehicles && `${summary.unassignedVehicles} ${summary.unassignedVehicles === 1 ? 'רכב ללא נהג' : 'רכבים ללא נהג'}`,
    summary.missingLicenseDocuments && `${summary.missingLicenseDocuments} ${summary.missingLicenseDocuments === 1 ? 'רישיון לא מאומת' : 'רישיונות לא מאומתים'}`,
  ].filter(Boolean) as string[];
  const total = summary.license + summary.insurance + summary.unassignedVehicles + summary.missingLicenseDocuments;
  const tone: Status = summary.license || summary.insurance ? 'expired' : total ? 'soon' : 'ok';
  const s = STATUS[tone];
  return (
    <Pressy onPress={onPress} accessibilityLabel={total ? `דורש טיפול, ${total}: ${parts.join(', ')}` : 'הכול תקין, אין משימות פתוחות'} pressScale={0.98}>
      <View style={styles.attention}>
        <View style={[styles.attentionDot, { backgroundColor: s.fill }]} />
        <View style={styles.flex}>
          <DKText variant="micro" color={s.fill}>
            {total ? 'דורש טיפול' : 'הכול תקין'}
          </DKText>
          <DKText variant="label" color={DK.onNight} numberOfLines={2}>
            {total ? parts.join(' · ') : 'אין כרגע משימות פתוחות בצי'}
          </DKText>
        </View>
        {total > 0 && (
          <DKText style={styles.attentionValue} color={DK.onNight}>
            {total.toLocaleString('he-IL')}
          </DKText>
        )}
        <Ionicons name="chevron-back" size={18} color={DK.onNightFaint} />
      </View>
    </Pressy>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: DK.canvas },
  statusStrip: { backgroundColor: DK.night[0] },
  content: { flexGrow: 1, backgroundColor: DK.canvas },

  topBar: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  block: { marginTop: 16 },
  stats: { flexDirection: 'row-reverse', gap: 8, marginTop: 12 },

  attention: {
    marginTop: 20,
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  attentionDot: { width: 10, height: 10, borderRadius: 5 },
  attentionValue: { fontFamily: 'Heebo_800ExtraBold', fontSize: 34, lineHeight: 38, letterSpacing: -1, fontVariant: ['tabular-nums'] },

  bar: { backgroundColor: DK.canvas, paddingTop: 14, paddingBottom: 12 },
  archivePill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    height: 42,
    paddingHorizontal: 15,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(10,22,38,0.18)',
  },
  cell: { paddingHorizontal: DK_SPACE.md, paddingBottom: 12, width: '100%', maxWidth: 640, alignSelf: 'center' },
});
