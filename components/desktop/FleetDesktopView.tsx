import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HealthDeclarationInfo } from '../../lib/healthDeclaration';
import { ComplianceItem, DriverRow, Vehicle, VehicleDriverWithProfile } from '../../lib/adminApi';
import { VEHICLE_STATUS_LABELS } from '../../lib/compliance';
import { SERVICE_WARN_KM } from '../../lib/fleetCardHelpers';
import { formatPlate } from '../../lib/plate';
import { nextServiceKmOf } from '../../lib/serviceSchedule';
import { daysUntilExpiry, formatDate } from '../../lib/theme';
import { DLtrText, DText, HoverPressable, StatusPill } from './primitives';
import { DESKTOP_AVATAR_COLORS, DESKTOP_COLORS, DESKTOP_FONT, DESKTOP_TONES, DesktopTone, webOnly } from './desktopTheme';
import { enter, enterRow, FilterCard, FilterCards, FleetHeader, FleetMode, ModeSwitch } from './FleetOverview';

/**
 * Desktop body of the fleet screen, sized to the window (no page scroll).
 * Top to bottom it answers one question each: who is this for (greeting),
 * what am I looking at (drivers / vehicles + search + add), which of them
 * (filter cards that are also the numbers), then the list itself. Problems
 * no card covers live in the top-bar "needs attention" dropdown. Purely presentational — FleetScreen owns loading,
 * filtering and navigation, so phone and desktop show the same data.
 */

export type FleetChip<T extends string> = { value: T; label: string; count: number };

export interface FleetDesktopViewProps<LF extends string, SF extends string> {
  mode: FleetMode;
  onModeChange: (mode: FleetMode) => void;

  drivers: DriverRow[];
  filteredDrivers: DriverRow[];
  driversLoading: boolean;
  driversError: string | null;
  onRetryDrivers: () => void;
  driverSearch: string;
  onDriverSearch: (q: string) => void;
  driverFilter: LF;
  onDriverFilter: (value: LF) => void;
  driverChips: FleetChip<LF>[];
  driverKpis: { total: number; soon: number; expired: number };
  archivedCount: number;
  pendingSigning: Map<string, number>;
  healthDeclarations: Map<string, HealthDeclarationInfo>;

  vehicles: Vehicle[];
  filteredVehicles: Vehicle[];
  vehiclesLoading: boolean;
  vehiclesError: string | null;
  onRetryVehicles: () => void;
  vehicleSearch: string;
  onVehicleSearch: (q: string) => void;
  vehicleFilter: SF;
  onVehicleFilter: (value: SF) => void;
  vehicleChips: FleetChip<SF>[];
  vehicleKpis: { total: number; active: number; inactive: number };
  compliance: Map<string, ComplianceItem[]>;
  vehicleDrivers: Map<string, VehicleDriverWithProfile[]>;
  departmentNames: Map<string, string>;
  restoringVehicleId: string | null;

  onOpenDriver: (driverId: string) => void;
  onOpenVehicle: (vehicleId: string) => void;
  onAddDriver: () => void;
  onAddVehicle: () => void;
  onOpenArchive: () => void;
  onCallDriver: (phone: string | null) => void;
  onRestoreVehicle: (vehicleId: string) => void;
}

/** Below this window height the page tightens its padding so the list keeps its room. */
const COMPACT_HEIGHT = 820;
const TIGHT_DOCK_WIDTH = 1000;

const DRIVER_CARDS: Record<string, Omit<FilterCard<string>, 'value' | 'count'>> = {
  all: { label: 'כל הנהגים', hint: 'נהגים פעילים בחברה', icon: 'people' },
  soon: { label: 'עומד לפוג', hint: 'פג בתוך 30 יום', icon: 'time', tone: 'warn' },
  expired: { label: 'פג תוקף', hint: 'צריך לחדש עכשיו', icon: 'alert-circle', tone: 'bad' },
  no_vehicle: { label: 'ללא רכב', hint: 'לא שויך להם רכב', icon: 'car-outline', tone: 'neutral' },
};

const VEHICLE_CARDS: Record<string, Omit<FilterCard<string>, 'value' | 'count'>> = {
  all: { label: 'כל הרכבים', hint: 'לא כולל ארכיון', icon: 'car-sport' },
  active: { label: 'פעילים', hint: 'בשימוש שוטף', icon: 'checkmark-circle', tone: 'ok' },
  maintenance: { label: 'בטיפול', hint: 'לא זמינים כרגע', icon: 'construct', tone: 'warn' },
  disabled: { label: 'מושבתים', hint: 'יצאו משימוש', icon: 'pause-circle', tone: 'neutral' },
};

const VEHICLE_STATUS_TONE: Record<string, DesktopTone> = {
  active: 'ok',
  maintenance: 'warn',
  disabled: 'neutral',
  archived: 'neutral',
};

/** Plain words instead of a bare date: how long until (or since) it expires. */
function expiryWords(date: string | null | undefined): { tone: DesktopTone; label: string } {
  const days = daysUntilExpiry(date);
  if (days == null) return { tone: 'neutral', label: 'לא הוזן' };
  if (days < 0) return { tone: 'bad', label: days === -1 ? 'פג אתמול' : `פג לפני ${Math.abs(days)} ימים` };
  if (days === 0) return { tone: 'bad', label: 'פג היום' };
  if (days <= 30) return { tone: 'warn', label: days === 1 ? 'פג מחר' : `עוד ${days} ימים` };
  return { tone: 'ok', label: 'בתוקף' };
}

/** Health declaration: valid, expiring, expired, waiting for signature or never signed. */
function healthWords(info: HealthDeclarationInfo | undefined): { tone: DesktopTone; label: string; sub: string } {
  if (info?.expiresAt) {
    const words = expiryWords(info.expiresAt);
    if (words.tone === 'bad' && info.pending) return { tone: 'warn', label: 'ממתינה לחתימה', sub: `פגה ${formatDate(info.expiresAt)}` };
    return { ...words, sub: `עד ${formatDate(info.expiresAt)}` };
  }
  if (info?.pending) return { tone: 'warn', label: 'ממתינה לחתימה', sub: '' };
  return { tone: 'neutral', label: 'לא נחתמה', sub: '' };
}

function serviceInfo(vehicle: Vehicle): { tone: DesktopTone; label: string } {
  const nextServiceKm = nextServiceKmOf(vehicle);
  if (nextServiceKm == null) return { tone: 'neutral', label: '—' };
  const km = nextServiceKm - vehicle.odometer;
  if (km <= 0) return { tone: 'bad', label: `באיחור ${Math.abs(km).toLocaleString()} ק״מ` };
  return { tone: km <= SERVICE_WARN_KM ? 'warn' : 'neutral', label: `בעוד ${km.toLocaleString()} ק״מ` };
}

function vehicleName(vehicle: Vehicle): string {
  return [vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') || 'רכב ללא דגם';
}

function initialOf(name: string | null | undefined): string {
  return (name ?? '').trim().charAt(0) || '?';
}

function countWords(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`;
}

export function FleetDesktopView<LF extends string, SF extends string>(props: FleetDesktopViewProps<LF, SF>) {
  const { mode } = props;
  const isDrivers = mode === 'drivers';
  const { height } = useWindowDimensions();
  const compact = height < COMPACT_HEIGHT;
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<TextInput>(null);
  // Below this the dock drops the switch and "new" labels to icons so everything stays on one line.
  const [dockWidth, setDockWidth] = useState(0);
  const tight = dockWidth > 0 && dockWidth < TIGHT_DOCK_WIDTH;

  // "/" jumps to search from anywhere on the page, unless the user is already typing.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const driverCards: FilterCard<LF>[] = props.driverChips.map((chip) => ({
    value: chip.value,
    count: chip.count,
    ...(DRIVER_CARDS[chip.value] ?? { label: chip.label, hint: '', icon: 'people' }),
  }));
  const vehicleCards: FilterCard<SF>[] = props.vehicleChips
    .filter((chip) => chip.value !== 'archived')
    .map((chip) => ({
      value: chip.value,
      count: chip.count,
      ...(VEHICLE_CARDS[chip.value] ?? { label: chip.label, hint: '', icon: 'car-sport' }),
    }));
  const vehicleArchive = props.vehicleChips.find((chip) => chip.value === 'archived');
  const showingArchive = !isDrivers && props.vehicleFilter === 'archived';
  const archiveCount = isDrivers ? props.archivedCount : (vehicleArchive?.count ?? 0);

  const listTitle = isDrivers
    ? (driverCards.find((c) => c.value === props.driverFilter)?.label ?? 'נהגים')
    : showingArchive
      ? 'רכבים בארכיון'
      : (vehicleCards.find((c) => c.value === props.vehicleFilter)?.label ?? 'רכבים');
  const listCount = isDrivers ? props.filteredDrivers.length : props.filteredVehicles.length;
  const search = isDrivers ? props.driverSearch : props.vehicleSearch;

  const assignedDrivers = (vehicle: Vehicle) => {
    const list = props.vehicleDrivers.get(vehicle.id) ?? [];
    const primary = list.find((d) => d.is_primary) ?? list[0] ?? null;
    return { primary, extra: Math.max(0, list.length - (primary ? 1 : 0)) };
  };

  const loading = isDrivers ? props.driversLoading : props.vehiclesLoading;
  const error = isDrivers
    ? props.driversError && props.drivers.length === 0
      ? props.driversError
      : null
    : props.vehiclesError && props.vehicles.length === 0
      ? props.vehiclesError
      : null;
  const isEmpty = listCount === 0;
  const hasAny = isDrivers ? props.drivers.length > 0 : props.vehicles.length > 0;
  // Rows replay their entrance whenever the list they belong to changes.
  const listKey = `${mode}-${isDrivers ? props.driverFilter : props.vehicleFilter}`;

  return (
    <View style={[styles.root, compact && styles.rootCompact]}>
      <FleetHeader />

      {/* The command dock: one floating surface, right to left — which of them (status rail),
          what am I looking at (drivers / vehicles), then find and add. */}
      <View style={[styles.dock, enter(1)]} onLayout={(e) => setDockWidth(e.nativeEvent.layout.width)}>
        {isDrivers ? (
          <FilterCards<LF>
            cards={driverCards}
            selected={props.driverFilter}
            loading={props.driversLoading}
            animKey="drivers"
            onSelect={props.onDriverFilter}
          />
        ) : (
          <FilterCards<SF>
            cards={vehicleCards}
            selected={props.vehicleFilter}
            loading={props.vehiclesLoading}
            animKey="vehicles"
            onSelect={props.onVehicleFilter}
          />
        )}
        <View style={styles.dockDivider} />
        <ModeSwitch mode={mode} compact={tight} onChange={props.onModeChange} />
        <View style={styles.dockDivider} />
        <View style={styles.searchWrap}>
          <Ionicons
            name="search"
            size={16}
            color={searchFocused ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkFaint}
            style={styles.searchIcon}
          />
          <TextInput
            ref={searchRef}
            value={search}
            onChangeText={isDrivers ? props.onDriverSearch : props.onVehicleSearch}
            placeholder={isDrivers ? 'שם, טלפון, ת.ז., רישיון או רכב' : 'מספר רכב, יצרן, דגם או נהג'}
            placeholderTextColor={DESKTOP_COLORS.inkFaint}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={[styles.search, searchFocused && styles.searchFocused]}
            accessibilityLabel={isDrivers ? 'חיפוש נהג לפי שם, טלפון, תעודת זהות, מספר רישיון או מספר רכב' : 'חיפוש רכב לפי מספר רכב, יצרן, דגם, קוד פנימי או שם נהג'}
          />
          {!searchFocused && !search && (
            <View style={styles.kbd} pointerEvents="none">
              <DText weight="semiBold" style={styles.kbdText}>
                /
              </DText>
            </View>
          )}
        </View>
        <HoverPressable
          style={[styles.iconButton, showingArchive && styles.iconButtonOn]}
          hoverStyle={styles.iconButtonHover}
          pressMotionStyle={styles.pressDown}
          onPress={isDrivers ? props.onOpenArchive : () => props.onVehicleFilter((showingArchive ? 'all' : 'archived') as SF)}
          accessibilityLabel={`${isDrivers ? 'ארכיון נהגים' : 'ארכיון רכבים'}, ${archiveCount}`}
        >
          <Ionicons name="archive-outline" size={18} color={showingArchive ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkMuted} />
          {archiveCount > 0 && (
            <View style={styles.badge}>
              <DText weight="bold" style={styles.badgeText}>
                {archiveCount}
              </DText>
            </View>
          )}
        </HoverPressable>
        <HoverPressable
          style={[styles.primaryButton, tight && styles.primaryButtonTight]}
          hoverMotionStyle={styles.primaryButtonHover}
          pressMotionStyle={styles.pressDown}
          onPress={isDrivers ? props.onAddDriver : props.onAddVehicle}
          accessibilityLabel={isDrivers ? 'נהג חדש' : 'רכב חדש'}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          {!tight && (
            <DText weight="semiBold" style={styles.primaryButtonText}>
              {isDrivers ? 'נהג חדש' : 'רכב חדש'}
            </DText>
          )}
        </HoverPressable>
      </View>

      <View style={styles.body}>
        <View style={[styles.listCard, enter(3)]}>
          <View style={styles.listHead}>
            <DText weight="bold" style={styles.listTitle} numberOfLines={1}>
              {listTitle}
            </DText>
            {!loading && !error && (
              <DText style={styles.listCount}>
                {isDrivers ? countWords(listCount, 'נהג אחד', 'נהגים') : countWords(listCount, 'רכב אחד', 'רכבים')}
                {search.trim() ? ' תואמים לחיפוש' : ''}
              </DText>
            )}
          </View>

          <TableHeader columns={isDrivers ? DRIVER_COLUMNS : VEHICLE_COLUMNS} />

          {loading ? (
            <View style={styles.rows}>
              {Array.from({ length: 6 }, (_, i) => (
                <View key={i} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                  <View style={styles.skeletonAvatar} />
                  <View style={[styles.skeletonBar, { flex: 2, maxWidth: 170 }]} />
                  <View style={[styles.skeletonBar, { flex: 1, maxWidth: 100 }]} />
                  <View style={[styles.skeletonBar, { flex: 1, maxWidth: 100 }]} />
                  <View style={[styles.skeletonBar, { flex: 1, maxWidth: 80 }]} />
                </View>
              ))}
            </View>
          ) : error ? (
            <View style={styles.state}>
              <DText weight="semiBold" style={styles.stateTitle}>
                {isDrivers ? 'לא ניתן לטעון את הנהגים' : 'לא ניתן לטעון את הרכבים'}
              </DText>
              <DText style={styles.stateHint}>{error}</DText>
              <HoverPressable
                style={styles.secondaryButton}
                hoverStyle={styles.secondaryButtonHover}
                onPress={isDrivers ? props.onRetryDrivers : props.onRetryVehicles}
              >
                <DText weight="semiBold" style={styles.secondaryButtonText}>
                  נסה שוב
                </DText>
              </HoverPressable>
            </View>
          ) : isEmpty ? (
            <View style={styles.state}>
              <View style={styles.stateIcon}>
                <Ionicons
                  name={
                    hasAny ? (search.trim() ? 'search' : 'checkmark-circle') : isDrivers ? 'people-outline' : 'car-sport-outline'
                  }
                  size={22}
                  color={hasAny && !search.trim() ? DESKTOP_TONES.ok.fg : DESKTOP_COLORS.inkFaint}
                />
              </View>
              <DText weight="semiBold" style={styles.stateTitle}>
                {!hasAny
                  ? isDrivers
                    ? 'עדיין אין נהגים'
                    : 'עדיין אין רכבים'
                  : search.trim()
                    ? 'לא נמצאו תוצאות'
                    : 'אין כאן אף אחד'}
              </DText>
              <DText style={styles.stateHint}>
                {!hasAny
                  ? isDrivers
                    ? 'הוסף את הנהג הראשון של החברה'
                    : 'הוסף את הרכב הראשון של החברה'
                  : search.trim()
                    ? 'נסה מילה אחרת או בחר כרטיס אחר'
                    : 'אין פריטים שמתאימים לכרטיס הזה'}
              </DText>
            </View>
          ) : (
            <ScrollView key={listKey} style={styles.rows} contentContainerStyle={styles.rowsContent}>
              {isDrivers
                ? props.filteredDrivers.map((driver, index) => {
                    const license = expiryWords(driver.license_expiry);
                    const health = healthWords(props.healthDeclarations.get(driver.id));
                    const pending = props.pendingSigning.get(driver.id) ?? 0;
                    return (
                      <HoverPressable
                        key={driver.id}
                        style={[styles.row, index % 2 === 1 && styles.rowAlt, enterRow(index) || null]}
                        hoverStyle={styles.rowHover}
                        pressMotionStyle={styles.rowPress}
                        onPress={() => props.onOpenDriver(driver.id)}
                        accessibilityLabel={driver.full_name ?? undefined}
                      >
                        <View style={[styles.cell, { flex: DRIVER_COLUMNS[0].flex }]}>
                          <View style={styles.nameCell}>
                            <View
                              style={[
                                styles.avatar,
                                { backgroundColor: DESKTOP_AVATAR_COLORS[index % DESKTOP_AVATAR_COLORS.length] },
                              ]}
                            >
                              <DText weight="bold" style={styles.avatarText}>
                                {initialOf(driver.full_name)}
                              </DText>
                            </View>
                            <TwoLine
                              title={driver.full_name || 'נהג ללא שם'}
                              subtitle={driver.job_title || ''}
                            />
                          </View>
                        </View>
                        <Cell
                          flex={DRIVER_COLUMNS[1].flex}
                          text={driver.phone || 'לא הוזן'}
                          ltr={!!driver.phone}
                          color={driver.phone ? DESKTOP_COLORS.ink : DESKTOP_COLORS.inkFaint}
                        />
                        <Cell
                          flex={DRIVER_COLUMNS[2].flex}
                          text={driver.national_id || 'לא הוזן'}
                          ltr={!!driver.national_id}
                          color={driver.national_id ? DESKTOP_COLORS.ink : DESKTOP_COLORS.inkFaint}
                        />
                        <View style={[styles.cell, { flex: DRIVER_COLUMNS[3].flex }]}>
                          {driver.license_number ? (
                            <DLtrText style={[styles.cellText, { color: DESKTOP_COLORS.ink }]} numberOfLines={1}>
                              {driver.license_number}
                            </DLtrText>
                          ) : (
                            <DText style={[styles.cellText, { color: DESKTOP_COLORS.inkFaint }]} numberOfLines={1}>
                              לא הוזן
                            </DText>
                          )}
                          {!!driver.license_classes && (
                            <DText style={styles.subText} numberOfLines={1}>
                              דרגה {driver.license_classes}
                            </DText>
                          )}
                        </View>
                        <View style={[styles.cell, { flex: DRIVER_COLUMNS[4].flex }]}>
                          <ToneLine tone={license.tone} label={license.label} />
                          {!!driver.license_expiry && (
                            <DText style={styles.subText} numberOfLines={1}>
                              עד {formatDate(driver.license_expiry)}
                            </DText>
                          )}
                        </View>
                        <View style={[styles.cell, { flex: DRIVER_COLUMNS[5].flex }]}>
                          <ToneLine tone={health.tone} label={health.label} />
                          {!!health.sub && (
                            <DText style={styles.subText} numberOfLines={1}>
                              {health.sub}
                            </DText>
                          )}
                        </View>
                        <View style={[styles.cell, { flex: DRIVER_COLUMNS[6].flex }]}>
                          {driver.vehicles.length ? (
                            driver.vehicles.map((vehicle) => (
                              <DLtrText
                                key={vehicle.id}
                                style={[styles.cellText, styles.mono, vehicle.is_primary && { color: DESKTOP_COLORS.ink }]}
                                numberOfLines={1}
                              >
                                {formatPlate(vehicle.plate_number)}
                              </DLtrText>
                            ))
                          ) : (
                            <DText style={[styles.cellText, { color: DESKTOP_COLORS.inkFaint }]} numberOfLines={1}>
                              ללא רכב
                            </DText>
                          )}
                        </View>
                        <Cell
                          flex={DRIVER_COLUMNS[7].flex}
                          text={pending > 0 ? countWords(pending, 'מסמך אחד', 'מסמכים') : '—'}
                          color={pending > 0 ? DESKTOP_TONES.warn.fg : DESKTOP_COLORS.inkFaint}
                          weight={pending > 0 ? 'semiBold' : undefined}
                        />
                        <Ionicons name="chevron-back" size={14} color={DESKTOP_COLORS.inkFaint} style={styles.rowChevron} />
                      </HoverPressable>
                    );
                  })
                : props.filteredVehicles.map((vehicle, index) => {
                    const insurance = (props.compliance.get(vehicle.id) ?? []).find((c) => c.item_type === 'insurance_mandatory');
                    const words = expiryWords(insurance?.expiry_date);
                    // Driving without mandatory insurance is never neutral.
                    const insuranceInfo = words.tone === 'neutral' ? { tone: 'bad' as const, label: 'אין ביטוח' } : words;
                    const { primary, extra } = assignedDrivers(vehicle);
                    const service = serviceInfo(vehicle);
                    return (
                      <HoverPressable
                        key={vehicle.id}
                        style={[styles.row, index % 2 === 1 && styles.rowAlt, enterRow(index) || null]}
                        hoverStyle={styles.rowHover}
                        pressMotionStyle={styles.rowPress}
                        onPress={() => props.onOpenVehicle(vehicle.id)}
                        accessibilityLabel={`${vehicleName(vehicle)} ${formatPlate(vehicle.plate_number)}`}
                      >
                        <View style={[styles.cell, { flex: VEHICLE_COLUMNS[0].flex }]}>
                          <View style={styles.nameCell}>
                            <View style={[styles.avatar, styles.vehicleIcon]}>
                              <Ionicons name="car-sport" size={16} color={DESKTOP_COLORS.brand} />
                            </View>
                            <TwoLine
                              title={formatPlate(vehicle.plate_number)}
                              titleLtr
                              titleMono
                              subtitle={vehicleName(vehicle)}
                            />
                          </View>
                        </View>
                        <Cell
                          flex={VEHICLE_COLUMNS[1].flex}
                          text={primary?.full_name ? `${primary.full_name}${extra > 0 ? ` +${extra}` : ''}` : 'ללא נהג'}
                          color={primary?.full_name ? DESKTOP_COLORS.ink : DESKTOP_COLORS.inkFaint}
                        />
                        <View style={[styles.cell, { flex: VEHICLE_COLUMNS[2].flex }]}>
                          <ToneLine tone={insuranceInfo.tone} label={insuranceInfo.label} />
                          {!!insurance?.expiry_date && (
                            <DLtrText style={styles.subText} numberOfLines={1}>
                              {formatDate(insurance.expiry_date)}
                            </DLtrText>
                          )}
                        </View>
                        <Cell
                          flex={VEHICLE_COLUMNS[3].flex}
                          text={service.label}
                          color={service.tone === 'neutral' ? undefined : DESKTOP_TONES[service.tone].fg}
                          weight={service.tone === 'neutral' ? undefined : 'semiBold'}
                        />
                        <View style={[styles.cell, styles.statusCell]}>
                          <StatusPill
                            tone={VEHICLE_STATUS_TONE[vehicle.status] ?? 'neutral'}
                            label={VEHICLE_STATUS_LABELS[vehicle.status] ?? vehicle.status}
                          />
                        </View>
                        <Ionicons name="chevron-back" size={14} color={DESKTOP_COLORS.inkFaint} style={styles.rowChevron} />
                      </HoverPressable>
                    );
                  })}
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */

const DRIVER_COLUMNS = [
  { label: 'נהג', flex: 1.7 },
  { label: 'טלפון נייד', flex: 1.05 },
  { label: 'תעודת זהות', flex: 0.95 },
  { label: 'מספר רישיון', flex: 1 },
  { label: 'תוקף רישיון', flex: 1 },
  { label: 'הצהרת בריאות', flex: 1.05 },
  { label: 'רכבים משויכים', flex: 1.1 },
  { label: 'ממתין לחתימה', flex: 0.9 },
];

const VEHICLE_COLUMNS = [
  { label: 'רכב', flex: 1.8 },
  { label: 'נהג ראשי', flex: 1.3 },
  { label: 'ביטוח חובה', flex: 1.1 },
  { label: 'טיפול הבא', flex: 1.1 },
  { label: 'סטטוס', flex: 0 },
];

function TableHeader({ columns }: { columns: { label: string; flex: number }[] }) {
  return (
    <View style={[styles.row, styles.headerRow]}>
      {columns.map((column) => (
        <View key={column.label} style={[styles.cell, column.flex ? { flex: column.flex } : styles.statusCell]}>
          <DText weight="semiBold" style={styles.headerText} numberOfLines={1}>
            {column.label}
          </DText>
        </View>
      ))}
      <View style={styles.rowChevron} />
    </View>
  );
}

function TwoLine({
  title,
  subtitle,
  titleLtr,
  titleMono,
  subtitleLtr,
}: {
  title: string;
  subtitle: string;
  titleLtr?: boolean;
  titleMono?: boolean;
  subtitleLtr?: boolean;
}) {
  const Title = titleLtr ? DLtrText : DText;
  const Subtitle = subtitleLtr ? DLtrText : DText;
  return (
    <View style={styles.twoLine}>
      <Title weight="semiBold" style={[styles.cellTitle, titleMono && styles.mono]} numberOfLines={1}>
        {title}
      </Title>
      {!!subtitle && (
        <Subtitle style={styles.subText} numberOfLines={1}>
          {subtitle}
        </Subtitle>
      )}
    </View>
  );
}

function ToneLine({ tone, label }: { tone: DesktopTone; label: string }) {
  const color = tone === 'neutral' ? DESKTOP_COLORS.inkFaint : tone === 'ok' ? DESKTOP_COLORS.ink : DESKTOP_TONES[tone].fg;
  return (
    <View style={styles.toneLine}>
      <View style={[styles.toneDot, { backgroundColor: tone === 'neutral' ? DESKTOP_COLORS.border : DESKTOP_TONES[tone].fg }]} />
      <DText
        weight={tone === 'ok' || tone === 'neutral' ? 'medium' : 'semiBold'}
        style={[styles.cellText, { color }]}
        numberOfLines={1}
      >
        {label}
      </DText>
    </View>
  );
}

function Cell({
  flex,
  text,
  ltr,
  color,
  weight,
  mono,
}: {
  flex: number;
  text: string;
  ltr?: boolean;
  color?: string;
  weight?: keyof typeof DESKTOP_FONT;
  mono?: boolean;
}) {
  const TextComponent = ltr ? DLtrText : DText;
  return (
    <View style={[styles.cell, { flex }]}>
      <TextComponent weight={weight} style={[styles.cellText, mono && styles.mono, color ? { color } : null]} numberOfLines={1}>
        {text}
      </TextComponent>
    </View>
  );
}

const styles = StyleSheet.create({
  pressDown: { transform: [{ scale: 0.97 }] },
  root: { flex: 1, paddingTop: 24, paddingHorizontal: 28, paddingBottom: 22, gap: 18 },
  rootCompact: { paddingTop: 18, paddingBottom: 16, gap: 14 },

  dock: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    padding: 6,
    borderRadius: 22,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(16,34,50,0.06)',
    ...webOnly({
      boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 18px 40px -22px rgba(16,34,50,0.28), inset 0 1px 0 rgba(255,255,255,0.9)',
    }),
  },
  dockDivider: { width: 1, height: 28, backgroundColor: 'rgba(16,34,50,0.08)', marginHorizontal: 2 },
  searchWrap: { flexGrow: 0.6, flexShrink: 1, flexBasis: 170, minWidth: 120, maxWidth: 280, justifyContent: 'center' },
  searchIcon: { position: 'absolute', right: 14, zIndex: 1 },
  search: {
    height: 44,
    borderRadius: 14,
    backgroundColor: DESKTOP_COLORS.canvas,
    paddingRight: 38,
    paddingLeft: 36,
    fontSize: 14,
    fontFamily: DESKTOP_FONT.regular,
    color: DESKTOP_COLORS.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
    borderWidth: 1,
    borderColor: 'transparent',
    ...webOnly({
      outlineStyle: 'none',
      transition: 'background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease',
    }),
  },
  searchFocused: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderColor: DESKTOP_COLORS.brand,
    ...webOnly({ boxShadow: `0 0 0 4px ${DESKTOP_COLORS.brandFocusRing}` }),
  },
  kbd: {
    position: 'absolute',
    left: 10,
    minWidth: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    ...webOnly({ boxShadow: '0 1px 0 rgba(16,34,50,0.08)' }),
  },
  kbdText: { fontSize: 11, color: DESKTOP_COLORS.inkFaint },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ transition: 'background-color 150ms ease-out, transform 120ms ease-out' }),
  },
  iconButtonHover: { backgroundColor: 'rgba(118,118,128,0.10)' },
  iconButtonOn: { backgroundColor: DESKTOP_COLORS.brandFocusRing },
  badge: {
    position: 'absolute',
    top: 5,
    left: 4,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DESKTOP_COLORS.ink,
    borderWidth: 2,
    borderColor: DESKTOP_COLORS.surface,
  },
  badgeText: { fontSize: 9.5, lineHeight: 11, color: '#FFFFFF', ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  primaryButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: DESKTOP_COLORS.brand,
    ...webOnly({
      backgroundImage: 'linear-gradient(180deg, #1BA5EA 0%, #0082C6 100%)',
      boxShadow: '0 10px 22px -10px rgba(0,136,204,0.9), inset 0 1px 0 rgba(255,255,255,0.25)',
      transition: 'transform 180ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 180ms ease-out',
    }),
  },
  primaryButtonTight: { width: 44, paddingHorizontal: 0 },
  primaryButtonHover: {
    transform: [{ translateY: -1 }],
    ...webOnly({ boxShadow: '0 14px 28px -10px rgba(0,136,204,0.95), inset 0 1px 0 rgba(255,255,255,0.3)' }),
  },
  primaryButtonText: { color: '#fff', fontSize: 14.5 },
  secondaryButton: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  secondaryButtonHover: { backgroundColor: DESKTOP_COLORS.canvas },
  secondaryButtonText: { color: DESKTOP_COLORS.ink, fontSize: 13, textAlign: 'center' },

  body: { flex: 1, minHeight: 0, flexDirection: 'row-reverse', gap: 16 },
  listCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: DESKTOP_COLORS.surface,
    borderRadius: 20,
    overflow: 'hidden',
    ...webOnly({ boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 4px 14px rgba(16,24,40,0.05)' }),
  },
  listHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 12,
  },
  listTitle: { fontSize: 18, color: DESKTOP_COLORS.ink, letterSpacing: -0.3, flexShrink: 1 },
  listCount: { fontSize: 13.5, color: DESKTOP_COLORS.inkFaint, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },

  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 6 },
  stateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(118,118,128,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stateTitle: { fontSize: 16, color: DESKTOP_COLORS.ink, textAlign: 'center' },
  stateHint: { fontSize: 13.5, color: DESKTOP_COLORS.inkMuted, textAlign: 'center', marginBottom: 6 },

  rows: { flex: 1 },
  rowsContent: { paddingTop: 4, paddingBottom: 10 },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    minHeight: 60,
    marginHorizontal: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    ...webOnly({ transition: 'background-color 150ms ease-out, transform 120ms ease-out' }),
  },
  // Zebra striping: every second row sits on a faint grey so the eye can follow a line across the columns.
  rowAlt: { backgroundColor: '#F6F8FA' },
  rowHover: { backgroundColor: '#ECF1F5' },
  rowPress: { transform: [{ scale: 0.995 }] },
  rowChevron: { marginLeft: 2, width: 16, flexShrink: 0 },
  headerRow: {
    minHeight: 0,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: DESKTOP_COLORS.borderSoft,
    borderRadius: 0,
    marginHorizontal: 0,
    paddingHorizontal: 22,
    backgroundColor: DESKTOP_COLORS.surfaceMuted,
  },
  headerText: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  cell: { minWidth: 0, paddingLeft: 14, gap: 2 },
  statusCell: { width: 92, flexShrink: 0, paddingLeft: 0 },
  cellText: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },
  cellTitle: { fontSize: 14.5, color: DESKTOP_COLORS.ink },
  subText: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint },
  mono: { ...webOnly({ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontVariantNumeric: 'tabular-nums' }) },
  twoLine: { flex: 1, minWidth: 0, gap: 2 },
  toneLine: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  toneDot: { width: 7, height: 7, borderRadius: 4 },
  nameCell: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minWidth: 0 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  skeletonAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: DESKTOP_COLORS.borderSoft, marginLeft: 12 },
  skeletonBar: { height: 12, borderRadius: 6, backgroundColor: DESKTOP_COLORS.borderSoft, marginLeft: 14 },
  avatarText: { color: '#fff', fontSize: 15, textAlign: 'center' },
  vehicleIcon: { backgroundColor: DESKTOP_COLORS.brandFocusRing },
});
