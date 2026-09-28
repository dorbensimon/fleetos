import React, { useRef, useState } from 'react';
import { FlatList, RefreshControl, StatusBar, StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  DK,
  DK_SPACE,
  DKText,
  EmptyPanel,
  ErrorPanel,
  Fab,
  FilterPills,
  ListEndAction,
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
  useTabBarScroll,
  useTabBarSpace,
  type Status,
} from '../../../components/driverKit';
import { BrandLogo } from '../../../components/ui/Brand';
import { timeGreeting } from '../../../lib/theme';
import type { AttentionSummary, ComplianceItem, DriverRow, Vehicle, VehicleDriverWithProfile } from '../../../lib/adminApi';
import { DriverFleetCard, VehicleFleetCard } from './FleetCards';
import { t, dirIcon, getLocale } from '../../../lib/i18n';
import { fontStack } from '../../../lib/fontStack';

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
  /** Defects in each vehicle's last safety inspection; absent when none. */
  inspectionDefects: Map<string, number>;
  departmentNames: Map<string, string>;
  restoringVehicleId: string | null;

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
  | { kind: 'vehicle'; item: Vehicle; index: number }
  | { kind: 'add' };

/** The add button starts floating once this many rows have scrolled past. */
const FLOAT_AFTER_ROWS = 4;

/** Where the list is and how its parts measure, in content pixels. */
export type ListMetrics = {
  scrollY: number;
  viewport: number;
  content: number;
  /** Height of everything above the pinned filter bar. */
  header: number;
  /** Height of each row, by its place in the list. */
  rows: number[];
  rowCount: number;
  /** Height of the add button at the end of the list; 0 while not shown. */
  end: number;
  /** Room under the list end: safe area and tab bar. */
  bottomPadding: number;
};

/**
 * The add button sits at the end of the list. Once the first rows have
 * slid under the pinned filter bar it also floats at the side, until the
 * button at the end of the list comes into view.
 */
export function addFloats(m: ListMetrics): boolean {
  const firstRows = m.rows.slice(0, FLOAT_AFTER_ROWS);
  const measured = firstRows.length === FLOAT_AFTER_ROWS && firstRows.every((height) => height > 0);
  const pastFirstRows = m.rowCount > FLOAT_AFTER_ROWS && measured
    && m.scrollY >= m.header + firstRows.reduce((sum, height) => sum + height, 0);
  const endInView = m.end > 0 && m.scrollY + m.viewport >= m.content - m.bottomPadding - m.end / 2;
  return pastFirstRows && !endInView;
}

function useFloatingAdd(rowCount: number, bottomPadding: number) {
  const [floating, setFloating] = useState(false);
  const metrics = useRef<ListMetrics>({ scrollY: 0, viewport: 0, content: 0, header: 0, rows: [], rowCount: 0, end: 0, bottomPadding: 0 }).current;
  metrics.rowCount = rowCount;
  metrics.bottomPadding = bottomPadding;
  const update = () => setFloating(addFloats(metrics));
  return {
    floating,
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
      metrics.scrollY = contentOffset.y;
      metrics.viewport = layoutMeasurement.height;
      metrics.content = contentSize.height;
      update();
    },
    onLayout: (event: LayoutChangeEvent) => {
      metrics.viewport = event.nativeEvent.layout.height;
      update();
    },
    onContentSizeChange: (_width: number, height: number) => {
      metrics.content = height;
      update();
    },
    measureHeader: (event: LayoutChangeEvent) => {
      metrics.header = event.nativeEvent.layout.height;
    },
    measureRow: (index: number) => (event: LayoutChangeEvent) => {
      metrics.rows[index] = event.nativeEvent.layout.height;
    },
    measureEnd: (event: LayoutChangeEvent) => {
      metrics.end = event.nativeEvent.layout.height;
      update();
    },
  };
}

/**
 * The fleet manager's home. The night carries the company, what needs
 * attention, the drivers/vehicles switch and three live counts that double
 * as filters; below, the list itself with its filters pinned while it
 * scrolls, and the action to add at its end, floating once the first rows have scrolled past.
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
    ...(loading ? [{ kind: 'loading' as const }] : error && !hasAny ? [{ kind: 'error' as const }] : items.length ? [...items, { kind: 'add' as const }] : [{ kind: 'empty' as const }]),
  ];
  const addLabel = drivers ? t('driver.new') : t('vehicle.new');
  const onAdd = drivers ? p.onAddDriver : p.onAddVehicle;
  const search = drivers ? p.driverSearch : p.vehicleSearch;
  const filtered = drivers ? p.driverFilter !== 'all' : p.vehicleFilter !== 'all';
  const tabBarScroll = useTabBarScroll();
  const tabBarSpace = useTabBarSpace();
  const bottomPadding = p.insetBottom + 24 + tabBarSpace;
  const floatingAdd = useFloatingAdd(items.length, bottomPadding);

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
                  { value: 'all', label: t('common.allShort'), count: p.driverCounts.all },
                  { value: 'expired', label: t('fleet.licenseExpired'), count: p.driverCounts.expired, tone: 'expired' },
                  { value: 'soon', label: t('status.aboutToExpire'), count: p.driverCounts.soon, tone: 'soon' },
                  { value: 'valid', label: t('status.valid'), count: p.driverCounts.valid, tone: 'ok' },
                  { value: 'no_vehicle', label: t('fleet.filter.noVehicle'), count: p.driverCounts.noVehicle },
                ]}
                trailing={
                  <Pressy onPress={p.onArchive} accessibilityLabel={t('fleet.driverArchiveCount', { archivedCount: p.archivedCount })} style={styles.archivePill} pressScale={0.95}>
                    <Ionicons name="archive-outline" size={16} color={DK.inkSoft} />
                    <DKText variant="label" color={DK.inkSoft}>
                      {t('common.archive')}
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
                  { value: 'all', label: t('common.allShort'), count: p.vehicleCounts.all },
                  { value: 'active', label: t('vehicle.status.active'), count: p.vehicleCounts.active, tone: 'ok' },
                  { value: 'insurance', label: t('fleet.insuranceInvalid'), count: p.vehicleCounts.insurance, tone: 'expired' },
                  { value: 'no_driver', label: t('vehicle.noDriver'), count: p.vehicleCounts.noDriver },
                  { value: 'maintenance', label: t('vehicle.status.maintenance'), count: p.vehicleCounts.maintenance, tone: 'soon' },
                  { value: 'disabled', label: t('vehicle.status.disabled'), count: p.vehicleCounts.disabled, tone: 'expired' },
                  { value: 'archived', label: t('common.archived'), count: p.vehicleCounts.archived },
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
            <ErrorPanel message={drivers ? t('fleet.cannotLoadDrivers') : t('fleet.cannotLoadVehicles')} hint={error ?? undefined} onRetry={drivers ? p.onRetryDrivers : p.onRetryVehicles} />
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
                  title={drivers ? t('fleet.noDriversFound') : t('fleet.noVehiclesFound')}
                  body={search ? t('fleet.noResultsForSearch', { search, v1: filtered ? t('fleet.inCurrentFilter') : '' }) : t('fleet.noItemsForFilter')}
                  action={{ label: t('common.showAll'), icon: 'refresh', onPress: clear }}
                />
              ) : (
                <EmptyPanel
                  icon={drivers ? 'people' : 'car-sport'}
                  title={drivers ? t('fleet.noDriversYet') : t('fleet.noVehiclesYet')}
                  body={drivers ? t('fleet.addFirstDriverHint') : t('fleet.addFirstVehicleHint')}
                  action={{ label: drivers ? t('fleet.addDriver') : t('fleet.addVehicle'), icon: 'add', onPress: drivers ? p.onAddDriver : p.onAddVehicle }}
                />
              )}
            </Reveal>
          </View>
        );
      case 'driver':
        return (
          <View style={styles.cell} onLayout={floatingAdd.measureRow(entry.index)}>
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
      case 'add':
        return (
          <View style={styles.cell} onLayout={floatingAdd.measureEnd}>
            <ListEndAction label={addLabel} onPress={onAdd} />
          </View>
        );
      case 'vehicle':
        return (
          <View style={styles.cell} onLayout={floatingAdd.measureRow(entry.index)}>
            <Reveal index={Math.min(entry.index, 8)}>
              <VehicleFleetCard
                item={entry.item}
                compliance={p.compliance.get(entry.item.id)}
                drivers={p.vehicleDrivers.get(entry.item.id)}
                defects={p.inspectionDefects.get(entry.item.id) ?? 0}
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
          onScroll={(event) => {
            tabBarScroll.onScroll?.(event);
            floatingAdd.onScroll(event);
          }}
          scrollEventThrottle={16}
          onLayout={floatingAdd.onLayout}
          onContentSizeChange={floatingAdd.onContentSizeChange}
          ListHeaderComponent={
            <View onLayout={floatingAdd.measureHeader}>
              <Hero {...p} />
            </View>
          }
          stickyHeaderIndices={[1]}
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          windowSize={9}
          refreshControl={<RefreshControl refreshing={p.refreshing} onRefresh={p.onRefresh} tintColor="#FFFFFF" colors={[DK.accent]} />}
        />
      </View>
      <Fab label={addLabel} onPress={onAdd} bottom={p.insetBottom + 18} visible={floatingAdd.floating} />
    </View>
  );
}

function Hero(p: Props) {
  const drivers = p.mode === 'drivers';
  const stats: { label: string; value: number; dot?: string; filter: string }[] = drivers
    ? [
        { label: t('common.drivers'), value: p.driverCounts.all, filter: 'all' },
        { label: t('fleet.licenseExpired'), value: p.driverCounts.expired, dot: STATUS.expired.fill, filter: 'expired' },
        { label: t('status.aboutToExpire'), value: p.driverCounts.soon, dot: STATUS.soon.fill, filter: 'soon' },
      ]
    : [
        { label: t('common.vehicles'), value: p.vehicleCounts.all, filter: 'all' },
        { label: t('fleet.insuranceExpired'), value: p.vehicleCounts.insurance, dot: STATUS.expired.fill, filter: 'insurance' },
        { label: t('vehicle.noDriver'), value: p.vehicleCounts.noDriver, dot: STATUS.soon.fill, filter: 'no_driver' },
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
        {/* Keeps the logo centred; the menu lives in the bottom bar now. */}
        <View style={styles.heroSlot} />
        <BrandLogo height={20} onDark />
        <HeroButton
          icon="notifications-outline"
          label={p.unread ? t('notifications.newCountLabel', { unread: p.unread }) : t('notifications.title')}
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
            { value: 'drivers', label: t('common.drivers'), icon: 'people', count: p.driverTotal },
            { value: 'vehicles', label: t('common.vehicles'), icon: 'car-sport', count: p.vehicleTotal },
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
          placeholder={drivers ? t('fleet.searchDriversMobile') : t('fleet.searchVehiclesMobile')}
        />
      </Reveal>
    </NightHero>
  );
}

/** What needs the manager, in one tappable line — or a calm "all clear". */
function AttentionPanel({ summary, onPress }: { summary: AttentionSummary; onPress: () => void }) {
  const parts = [
    summary.license && `${summary.license} ${summary.license === 1 ? t('fleet.license') : t('prefs.group.licenses')}`,
    summary.insurance && `${summary.insurance} ${summary.insurance === 1 ? t('fleet.insurance') : t('compliance.cat.insurance')}`,
    summary.unassignedVehicles && `${summary.unassignedVehicles} ${summary.unassignedVehicles === 1 ? t('fleet.vehicleNoDriver') : t('attention.vehiclesWithoutDriver')}`,
    summary.missingLicenseDocuments && `${summary.missingLicenseDocuments} ${summary.missingLicenseDocuments === 1 ? t('fleet.licenseUnverified') : t('attention.unverifiedLicenses')}`,
  ].filter(Boolean) as string[];
  const total = summary.license + summary.insurance + summary.unassignedVehicles + summary.missingLicenseDocuments;
  const tone: Status = summary.license || summary.insurance ? 'expired' : total ? 'soon' : 'ok';
  const s = STATUS[tone];
  return (
    <Pressy onPress={onPress} accessibilityLabel={total ? t('fleet.needsAttentionList', { total, v1: parts.join(', ') }) : t('fleet.allOkNoTasks')} pressScale={0.98}>
      <View style={styles.attention}>
        <View style={[styles.attentionDot, { backgroundColor: s.fill }]} />
        <View style={styles.flex}>
          <DKText variant="micro" color={s.fill}>
            {total ? t('status.needsAttention') : t('common.allOk')}
          </DKText>
          <DKText variant="label" color={DK.onNight} numberOfLines={2}>
            {total ? parts.join(' · ') : t('fleet.noOpenTasksNow')}
          </DKText>
        </View>
        {total > 0 && (
          <DKText style={styles.attentionValue} color={DK.onNight}>
            {total.toLocaleString(getLocale())}
          </DKText>
        )}
        <Ionicons name={dirIcon('chevron-back')} size={18} color={DK.onNightFaint} />
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
  heroSlot: { width: 48, height: 48 },
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
  attentionValue: { fontFamily: fontStack('Heebo_800ExtraBold'), fontSize: 34, lineHeight: 38, letterSpacing: -1, fontVariant: ['tabular-nums'] },

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
