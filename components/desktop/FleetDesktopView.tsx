import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HealthDeclarationInfo } from '../../lib/healthDeclaration';
import { ComplianceItem, DriverRow, Vehicle, VehicleDriverWithProfile } from '../../lib/adminApi';
import { VEHICLE_STATUS_LABELS } from '../../lib/compliance';
import { SERVICE_WARN_KM } from '../../lib/fleetCardHelpers';
import { formatPlate } from '../../lib/plate';
import { nextServiceKmOf } from '../../lib/serviceSchedule';
import { vehicleName } from '../../lib/vehicleAttention';
import { daysUntilExpiry, formatDate } from '../../lib/theme';
import { DLtrText, DText, HoverPressable } from './primitives';
import { DESKTOP_AVATAR_COLORS, DESKTOP_COLORS, DESKTOP_FONT, DESKTOP_TONES, DesktopTone, webOnly } from './desktopTheme';
import { enter, enterRow, FilterCard, FilterCards, FleetHeader, FleetMode, ModeSwitch } from './FleetOverview';

/**
 * Desktop body of the fleet screen, sized to the window (no page scroll).
 * Top to bottom it answers one question each: who is this for (greeting),
 * what am I looking at (drivers / vehicles + search + archive + add), which
 * of them (filter tiles that are also the numbers), then the list itself.
 * Sized for readability first: 15-16px text, 44-48px targets, and every
 * status spelled out with an icon and words, never colour alone. Problems no
 * tile covers live in the top-bar "needs attention" dropdown. Purely
 * presentational — FleetScreen owns loading, filtering and navigation, so
 * phone and desktop show the same data.
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
  /** Defects in each vehicle's last safety inspection; absent when none. */
  inspectionDefects: Map<string, number>;
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
const TIGHT_DOCK_WIDTH = 900;

const DRIVER_CARDS: Record<string, Omit<FilterCard<string>, 'value' | 'count'>> = {
  all: { label: 'כל הנהגים', hint: 'נהגים פעילים בחברה', icon: 'people' },
  soon: { label: 'עומד לפוג', hint: 'רישיון פג בתוך 30 יום', icon: 'time', tone: 'warn' },
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

function initialOf(name: string | null | undefined): string {
  return (name ?? '').trim().charAt(0) || '?';
}

function countWords(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`;
}


/** Status words as an icon plus text, so colour is never the only signal. */
const TONE_ICON: Record<DesktopTone, React.ComponentProps<typeof Ionicons>['name']> = {
  ok: 'checkmark-circle',
  warn: 'time',
  bad: 'alert-circle',
  neutral: 'remove-circle-outline',
};

export function FleetDesktopView<LF extends string, SF extends string>(props: FleetDesktopViewProps<LF, SF>) {
  const { mode } = props;
  const isDrivers = mode === 'drivers';
  const { height } = useWindowDimensions();
  const compact = height < COMPACT_HEIGHT;
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<TextInput>(null);
  // Below this the toolbar drops the switch, archive and "new" labels to icons so everything stays on one line.
  const [toolbarWidth, setToolbarWidth] = useState(0);
  const tight = toolbarWidth > 0 && toolbarWidth < TIGHT_DOCK_WIDTH;

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
  const modeCounts = {
    drivers: props.driversLoading ? undefined : props.driverKpis.total,
    vehicles: props.vehiclesLoading ? undefined : (vehicleCards.find((c) => c.value === 'all')?.count ?? props.vehicles.length),
  };

  const listTitle = isDrivers
    ? (driverCards.find((c) => c.value === props.driverFilter)?.label ?? 'נהגים')
    : showingArchive
      ? 'רכבים בארכיון'
      : (vehicleCards.find((c) => c.value === props.vehicleFilter)?.label ?? 'רכבים');
  const listCount = isDrivers ? props.filteredDrivers.length : props.filteredVehicles.length;
  const search = isDrivers ? props.driverSearch : props.vehicleSearch;
  const query = search.trim();
  const setSearch = isDrivers ? props.onDriverSearch : props.onVehicleSearch;

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
  const columns = isDrivers ? DRIVER_COLUMNS : VEHICLE_COLUMNS;
  const onAdd = isDrivers ? props.onAddDriver : props.onAddVehicle;

  return (
    <View style={[styles.root, compact && styles.rootCompact]}>
      <FleetHeader />

      {/* What am I looking at (drivers / vehicles), then find, archive and add. */}
      <View
        style={[styles.toolbar, enter(1)]}
        onLayout={(e) => setToolbarWidth(e.nativeEvent.layout.width)}
        accessibilityLabel="מה מוצג"
      >
        <ModeSwitch mode={mode} compact={tight} counts={modeCounts} onChange={props.onModeChange} />
        <View style={styles.grow} />
        <View style={[styles.searchWrap, tight && styles.searchWrapTight]}>
          <Ionicons
            name="search"
            size={19}
            color={searchFocused ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkFaint}
            style={styles.searchIcon}
            pointerEvents="none"
          />
          <TextInput
            ref={searchRef}
            value={search}
            onChangeText={setSearch}
            placeholder={isDrivers ? 'חיפוש לפי שם, טלפון, ת.ז., רישיון או רכב' : 'חיפוש לפי מספר רכב, יצרן, דגם או נהג'}
            placeholderTextColor={DESKTOP_COLORS.inkFaint}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyPress={(e) => {
              if ((e.nativeEvent as { key?: string }).key === 'Escape' && search) setSearch('');
            }}
            style={[styles.search, searchFocused && styles.searchFocused]}
            accessibilityLabel={isDrivers ? 'חיפוש נהג לפי שם, טלפון, תעודת זהות, מספר רישיון או מספר רכב' : 'חיפוש רכב לפי מספר רכב, יצרן, דגם, קוד פנימי או שם נהג'}
          />
          {search ? (
            <HoverPressable
              style={styles.clear}
              hoverStyle={styles.clearHover}
              onPress={() => {
                setSearch('');
                searchRef.current?.focus();
              }}
              accessibilityLabel="ניקוי החיפוש"
            >
              <Ionicons name="close" size={18} color={DESKTOP_COLORS.inkMuted} />
            </HoverPressable>
          ) : (
            !searchFocused && (
              <View style={styles.kbd} pointerEvents="none">
                <DText weight="semiBold" style={styles.kbdText}>
                  /
                </DText>
              </View>
            )
          )}
        </View>
        <HoverPressable
          style={[styles.ghostButton, tight && styles.ghostButtonTight, showingArchive && styles.ghostButtonOn]}
          hoverStyle={showingArchive ? undefined : styles.ghostButtonHover}
          pressMotionStyle={styles.pressDown}
          onPress={isDrivers ? props.onOpenArchive : () => props.onVehicleFilter((showingArchive ? 'all' : 'archived') as SF)}
          accessibilityLabel={`${isDrivers ? 'ארכיון נהגים' : 'ארכיון רכבים'}, ${archiveCount}`}
          accessibilityState={isDrivers ? undefined : { selected: showingArchive }}
          aria-pressed={isDrivers ? undefined : showingArchive}
        >
          <Ionicons name="archive-outline" size={19} color={showingArchive ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkMuted} />
          {!tight && (
            <DText weight="semiBold" style={[styles.ghostButtonText, showingArchive && styles.ghostButtonTextOn]}>
              ארכיון
            </DText>
          )}
          {archiveCount > 0 && (
            <View style={styles.countBadge}>
              <DText weight="bold" style={styles.countBadgeText}>
                {archiveCount}
              </DText>
            </View>
          )}
        </HoverPressable>
        <HoverPressable
          style={[styles.primaryButton, tight && styles.primaryButtonTight]}
          hoverMotionStyle={styles.primaryButtonHover}
          pressMotionStyle={styles.pressDown}
          onPress={onAdd}
          accessibilityLabel={isDrivers ? 'נהג חדש' : 'רכב חדש'}
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
          {!tight && (
            <DText weight="semiBold" style={styles.primaryButtonText}>
              {isDrivers ? 'נהג חדש' : 'רכב חדש'}
            </DText>
          )}
        </HoverPressable>
      </View>

      <View style={enter(2)}>
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
      </View>

      <View style={[styles.listCard, enter(3)]}>
        <View style={styles.listHead}>
          <DText weight="extraBold" style={styles.listTitle} numberOfLines={1}>
            {listTitle}
          </DText>
          {!loading && !error && (
            <DText style={styles.listCount}>
              {isDrivers ? countWords(listCount, 'נהג אחד', 'נהגים') : countWords(listCount, 'רכב אחד', 'רכבים')}
            </DText>
          )}
          {!!query && (
            <View style={styles.searchChip}>
              <DText weight="semiBold" style={styles.searchChipText} numberOfLines={1}>
                תוצאות עבור „{query}”
              </DText>
              <HoverPressable
                style={styles.searchChipClear}
                hoverStyle={styles.searchChipClearHover}
                onPress={() => setSearch('')}
                accessibilityLabel="ניקוי החיפוש"
              >
                <Ionicons name="close" size={14} color={DESKTOP_COLORS.brand} />
              </HoverPressable>
            </View>
          )}
        </View>

        {error ? (
          <EmptyState
            icon="cloud-offline-outline"
            title={isDrivers ? 'לא ניתן לטעון את הנהגים' : 'לא ניתן לטעון את הרכבים'}
            hint={error}
            action={{ label: 'נסה שוב', icon: 'refresh', onPress: isDrivers ? props.onRetryDrivers : props.onRetryVehicles }}
          />
        ) : !loading && isEmpty ? (
          !hasAny ? (
            <EmptyState
              icon={isDrivers ? 'people-outline' : 'car-sport-outline'}
              title={isDrivers ? 'עדיין אין נהגים' : 'עדיין אין רכבים'}
              hint={isDrivers ? 'הוסף את הנהג הראשון של החברה' : 'הוסף את הרכב הראשון של החברה'}
              action={{ label: isDrivers ? 'נהג חדש' : 'רכב חדש', icon: 'add', onPress: onAdd, primary: true }}
            />
          ) : query ? (
            <EmptyState
              icon="search"
              title="לא נמצאו תוצאות"
              hint={`אין התאמה ל„${query}”. נסה מילה אחרת או בחר כרטיס אחר`}
              action={{ label: 'ניקוי החיפוש', icon: 'close', onPress: () => setSearch('') }}
            />
          ) : (
            <EmptyState
              icon="checkmark-circle"
              iconTone="ok"
              title="אין כאן אף אחד"
              hint="אין פריטים שמתאימים לכרטיס הזה"
            />
          )
        ) : (
          // Narrow windows scroll the table sideways instead of squeezing statuses into "...".
          <View style={styles.tableScroll}>
            <View style={[styles.table, { minWidth: tableMinWidth(columns) }]}>
              <TableHeader columns={columns} />
              {loading ? (
                <SkeletonRows columns={columns} />
              ) : (
                <ScrollView key={listKey} style={styles.rows} contentContainerStyle={styles.rowsContent}>
                  {isDrivers
                    ? props.filteredDrivers.map((driver, index) => {
                        const license = expiryWords(driver.license_expiry);
                        const health = healthWords(props.healthDeclarations.get(driver.id));
                        const pending = props.pendingSigning.get(driver.id) ?? 0;
                        return (
                          <TableRow
                            key={driver.id}
                            index={index}
                            onPress={() => props.onOpenDriver(driver.id)}
                            accessibilityLabel={driver.full_name ?? undefined}
                          >
                            <View style={[styles.cell, colStyle(DRIVER_COLUMNS[0])]}>
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
                                <View style={styles.twoLine}>
                                  <Highlight text={driver.full_name || 'נהג ללא שם'} query={query} weight="bold" style={styles.cellTitle} />
                                  {!!driver.job_title && (
                                    <DText style={styles.subText} numberOfLines={1}>
                                      {driver.job_title}
                                    </DText>
                                  )}
                                </View>
                              </View>
                            </View>
                            <View style={[styles.cell, colStyle(DRIVER_COLUMNS[1])]}>
                              <DataText value={driver.phone} query={query} />
                            </View>
                            <View style={[styles.cell, colStyle(DRIVER_COLUMNS[2])]}>
                              <DataText value={driver.national_id} query={query} />
                            </View>
                            <View style={[styles.cell, colStyle(DRIVER_COLUMNS[3])]}>
                              <DataText value={driver.license_number} query={query} />
                              {!!driver.license_classes && (
                                <DText style={styles.subText} numberOfLines={1}>
                                  דרגה {driver.license_classes}
                                </DText>
                              )}
                            </View>
                            <View style={[styles.cell, colStyle(DRIVER_COLUMNS[4])]}>
                              <Status tone={license.tone} label={license.label} />
                              {!!driver.license_expiry && (
                                <DText style={styles.subText} numberOfLines={1}>
                                  עד {formatDate(driver.license_expiry)}
                                </DText>
                              )}
                            </View>
                            <View style={[styles.cell, colStyle(DRIVER_COLUMNS[5])]}>
                              <Status tone={health.tone} label={health.label} />
                              {!!health.sub && (
                                <DText style={styles.subText} numberOfLines={1}>
                                  {health.sub}
                                </DText>
                              )}
                            </View>
                            <View style={[styles.cell, colStyle(DRIVER_COLUMNS[6])]}>
                              {driver.vehicles.length ? (
                                <View style={styles.plates}>
                                  {driver.vehicles.map((vehicle) => (
                                    <Plate key={vehicle.id} plate={vehicle.plate_number} small />
                                  ))}
                                </View>
                              ) : (
                                <DText style={[styles.cellText, styles.faint]} numberOfLines={1}>
                                  ללא רכב
                                </DText>
                              )}
                            </View>
                            <View style={[styles.cell, colStyle(DRIVER_COLUMNS[7])]}>
                              {pending > 0 ? (
                                <Pill tone="warn" label={countWords(pending, 'מסמך אחד', 'מסמכים')} />
                              ) : (
                                <DText style={[styles.cellText, styles.faint]}>—</DText>
                              )}
                            </View>
                          </TableRow>
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
                          <TableRow
                            key={vehicle.id}
                            index={index}
                            onPress={() => props.onOpenVehicle(vehicle.id)}
                            accessibilityLabel={`${vehicleName(vehicle)} ${formatPlate(vehicle.plate_number)}`}
                          >
                            <View style={[styles.cell, colStyle(VEHICLE_COLUMNS[0])]}>
                              <View style={styles.nameCell}>
                                <View style={styles.vehicleIcon}>
                                  <Ionicons name="car-sport" size={19} color={DESKTOP_COLORS.brand} />
                                </View>
                                <View style={styles.twoLine}>
                                  <Plate plate={vehicle.plate_number} query={query} />
                                  <Highlight text={vehicleName(vehicle)} query={query} style={styles.subText} />
                                  {vehicle.status !== 'archived' && (props.inspectionDefects.get(vehicle.id) ?? 0) > 0 && (
                                    <View style={styles.defectMark}>
                                      <Status tone="bad" label="יש ליקויים" />
                                    </View>
                                  )}
                                </View>
                              </View>
                            </View>
                            <View style={[styles.cell, colStyle(VEHICLE_COLUMNS[1])]}>
                              {primary?.full_name ? (
                                <Highlight
                                  text={`${primary.full_name}${extra > 0 ? ` +${extra}` : ''}`}
                                  query={query}
                                  weight="medium"
                                  style={styles.cellValue}
                                />
                              ) : (
                                <DText style={[styles.cellText, styles.faint]} numberOfLines={1}>
                                  ללא נהג
                                </DText>
                              )}
                            </View>
                            <View style={[styles.cell, colStyle(VEHICLE_COLUMNS[2])]}>
                              <Status tone={insuranceInfo.tone} label={insuranceInfo.label} />
                              {!!insurance?.expiry_date && (
                                <DText style={styles.subText} numberOfLines={1}>
                                  עד {formatDate(insurance.expiry_date)}
                                </DText>
                              )}
                            </View>
                            <View style={[styles.cell, colStyle(VEHICLE_COLUMNS[3])]}>
                              {service.tone === 'neutral' ? (
                                <DText weight="medium" style={[styles.cellValue, service.label === '—' && styles.faint]} numberOfLines={1}>
                                  {service.label}
                                </DText>
                              ) : (
                                <Status tone={service.tone} label={service.label} />
                              )}
                            </View>
                            <View style={[styles.cell, colStyle(VEHICLE_COLUMNS[4])]}>
                              <Pill
                                tone={VEHICLE_STATUS_TONE[vehicle.status] ?? 'neutral'}
                                label={VEHICLE_STATUS_LABELS[vehicle.status] ?? vehicle.status}
                              />
                            </View>
                          </TableRow>
                        );
                      })}
                </ScrollView>
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */

type Column = { label: string; flex: number; min: number };

const DRIVER_COLUMNS: Column[] = [
  { label: 'נהג', flex: 1.7, min: 184 },
  { label: 'טלפון נייד', flex: 1, min: 120 },
  { label: 'תעודת זהות', flex: 0.9, min: 104 },
  { label: 'מספר רישיון', flex: 0.9, min: 96 },
  { label: 'תוקף רישיון', flex: 1.15, min: 146 },
  { label: 'הצהרת בריאות', flex: 1.15, min: 150 },
  { label: 'רכבים משויכים', flex: 1, min: 116 },
  { label: 'ממתין לחתימה', flex: 0.9, min: 106 },
];

const VEHICLE_COLUMNS: Column[] = [
  { label: 'רכב', flex: 1.6, min: 210 },
  { label: 'נהג ראשי', flex: 1.3, min: 140 },
  { label: 'ביטוח חובה', flex: 1.2, min: 150 },
  { label: 'טיפול הבא', flex: 1.2, min: 160 },
  { label: 'סטטוס', flex: 0.7, min: 104 },
];

const ROW_INSET = 10;
const ROW_PADDING = 14;
const CHEVRON_WIDTH = 24;

function colStyle(column: Column) {
  return { flexGrow: column.flex, flexShrink: 0, flexBasis: 0, minWidth: column.min };
}

function tableMinWidth(columns: Column[]) {
  return columns.reduce((sum, c) => sum + c.min, 0) + CHEVRON_WIDTH + 2 * (ROW_INSET + ROW_PADDING);
}

function TableHeader({ columns }: { columns: Column[] }) {
  return (
    <View style={[styles.row, styles.headerRow]}>
      {columns.map((column) => (
        <View key={column.label} style={[styles.cell, colStyle(column)]}>
          <DText weight="bold" style={styles.headerText} numberOfLines={1}>
            {column.label}
          </DText>
        </View>
      ))}
      <View style={styles.rowChevron} />
    </View>
  );
}

/** One clickable line: zebra striped, lights up on hover and the arrow leans toward the details. */
function TableRow({
  index,
  onPress,
  accessibilityLabel,
  children,
}: {
  index: number;
  onPress: () => void;
  accessibilityLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <HoverPressable
      style={[styles.row, index % 2 === 1 && styles.rowAlt, enterRow(index) || null]}
      hoverStyle={styles.rowHover}
      pressStyle={styles.rowPressed}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
    >
      {(state) => (
        <>
          {children}
          <View style={styles.rowChevron}>
            <Ionicons
              name="chevron-back"
              size={18}
              color={(state as { hovered?: boolean }).hovered ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkFaint}
              style={[styles.chevronIcon, (state as { hovered?: boolean }).hovered && styles.chevronIconHover]}
            />
          </View>
        </>
      )}
    </HoverPressable>
  );
}

/** Marks where the search term appears, so it is obvious why a row matched. */
function Highlight({
  text,
  query,
  style,
  weight,
  ltr,
}: {
  text: string;
  query: string;
  style?: React.ComponentProps<typeof DText>['style'];
  weight?: keyof typeof DESKTOP_FONT;
  ltr?: boolean;
}) {
  const TextComponent = ltr ? DLtrText : DText;
  const at = query ? text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) : -1;
  return (
    <TextComponent weight={weight} style={style} numberOfLines={1}>
      {at < 0 ? (
        text
      ) : (
        <>
          {text.slice(0, at)}
          <Text style={styles.mark}>{text.slice(at, at + query.length)}</Text>
          {text.slice(at + query.length)}
        </>
      )}
    </TextComponent>
  );
}

/** Latin data (phone, ID, licence number), or a quiet "not entered". */
function DataText({ value, query }: { value: string | null | undefined; query: string }) {
  if (!value) {
    return (
      <DText style={[styles.cellText, styles.faint]} numberOfLines={1}>
        לא הוזן
      </DText>
    );
  }
  return <Highlight text={value} query={query} weight="medium" style={styles.cellValue} ltr />;
}

function Status({ tone, label }: { tone: DesktopTone; label: string }) {
  const loud = tone === 'warn' || tone === 'bad';
  const iconColor = tone === 'neutral' ? DESKTOP_COLORS.inkFaint : DESKTOP_TONES[tone].fg;
  const textColor = loud ? DESKTOP_TONES[tone].fg : tone === 'ok' ? DESKTOP_COLORS.ink : DESKTOP_COLORS.inkFaint;
  return (
    <View style={[styles.status, loud && [styles.statusLoud, { backgroundColor: TONE_SOFT[tone] }]]}>
      <Ionicons name={TONE_ICON[tone]} size={17} color={iconColor} />
      <DText weight={loud ? 'semiBold' : 'medium'} style={[styles.statusText, { color: textColor }]} numberOfLines={1}>
        {label}
      </DText>
    </View>
  );
}

function Pill({ tone, label }: { tone: DesktopTone; label: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: TONE_SOFT[tone] }]}>
      <DText weight="semiBold" style={[styles.pillText, { color: DESKTOP_TONES[tone].fg }]} numberOfLines={1}>
        {label}
      </DText>
    </View>
  );
}

/** Israeli plate: yellow with the blue IL strip — reads as "a vehicle number" before the digits do. */
function Plate({ plate, small, query = '' }: { plate: string; small?: boolean; query?: string }) {
  const text = formatPlate(plate);
  const matches = !!query && (text.includes(query) || plate.includes(query.replace(/\D/g, '') || '\u0000'));
  return (
    <View style={[styles.plate, small && styles.plateSmall, matches && styles.plateMatch]}>
      <View style={styles.plateStrip}>
        <DText weight="extraBold" style={styles.plateIL}>
          IL
        </DText>
      </View>
      <DLtrText weight="bold" style={[styles.plateText, small && styles.plateTextSmall]} numberOfLines={1}>
        {text}
      </DLtrText>
    </View>
  );
}

function SkeletonRows({ columns }: { columns: Column[] }) {
  return (
    <View style={styles.rowsContent} accessibilityLabel="טוען" aria-busy>
      {Array.from({ length: 7 }, (_, i) => (
        <View key={i} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
          {columns.map((column, c) => (
            <View key={column.label} style={[styles.cell, colStyle(column)]}>
              {c === 0 ? (
                <View style={styles.nameCell}>
                  <View style={[styles.skeleton, styles.skeletonAvatar]} />
                  <View style={[styles.skeleton, { width: '60%' }]} />
                </View>
              ) : (
                <View style={[styles.skeleton, { width: `${55 + ((i * 7 + c * 13) % 35)}%` }]} />
              )}
            </View>
          ))}
          <View style={styles.rowChevron} />
        </View>
      ))}
    </View>
  );
}

function EmptyState({
  icon,
  iconTone,
  title,
  hint,
  action,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconTone?: DesktopTone;
  title: string;
  hint: string;
  action?: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; primary?: boolean };
}) {
  return (
    <View style={styles.state}>
      <View style={[styles.stateIcon, iconTone && { backgroundColor: TONE_SOFT[iconTone] }]}>
        <Ionicons name={icon} size={26} color={iconTone ? DESKTOP_TONES[iconTone].fg : DESKTOP_COLORS.inkMuted} />
      </View>
      <DText weight="bold" style={styles.stateTitle}>
        {title}
      </DText>
      <DText style={styles.stateHint}>{hint}</DText>
      {action && (
        <HoverPressable
          style={action.primary ? styles.primaryButton : styles.ghostButton}
          hoverStyle={action.primary ? undefined : styles.ghostButtonHover}
          hoverMotionStyle={action.primary ? styles.primaryButtonHover : undefined}
          pressMotionStyle={styles.pressDown}
          onPress={action.onPress}
        >
          <Ionicons name={action.icon} size={action.primary ? 22 : 18} color={action.primary ? '#FFFFFF' : DESKTOP_COLORS.inkMuted} />
          <DText weight="semiBold" style={action.primary ? styles.primaryButtonText : styles.ghostButtonText}>
            {action.label}
          </DText>
        </HoverPressable>
      )}
    </View>
  );
}

/** Opaque soft tints behind status text (the theme's translucent ones turn muddy on the zebra rows). */
const TONE_SOFT: Record<DesktopTone, string> = {
  ok: '#E7F5EC',
  warn: '#FFF1DC',
  bad: '#FDE9E7',
  neutral: '#EEF0F2',
};

const BRAND_SOFT = '#E6F2F9';
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

const styles = StyleSheet.create({
  defectMark: { flexDirection: 'row-reverse', marginTop: 3 },
  pressDown: { transform: [{ scale: 0.97 }] },
  root: { flex: 1, paddingTop: 24, paddingHorizontal: 32, paddingBottom: 22, gap: 18 },
  rootCompact: { paddingTop: 16, paddingBottom: 14, gap: 12 },

  toolbar: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, zIndex: 1 },
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  searchWrap: { flexGrow: 0, flexShrink: 1, flexBasis: 400, minWidth: 240, justifyContent: 'center' },
  searchWrapTight: { flexBasis: 280, minWidth: 180 },
  searchIcon: { position: 'absolute', right: 15, zIndex: 1 },
  search: {
    height: 48,
    borderRadius: 14,
    backgroundColor: DESKTOP_COLORS.surface,
    paddingRight: 44,
    paddingLeft: 46,
    fontSize: 15.5,
    fontFamily: DESKTOP_FONT.regular,
    color: DESKTOP_COLORS.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    ...webOnly({
      outlineStyle: 'none',
      boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
      transition: `border-color 180ms ${EASE_OUT}, box-shadow 220ms ${EASE_OUT}`,
    }),
  },
  searchFocused: {
    borderColor: DESKTOP_COLORS.brand,
    ...webOnly({ boxShadow: '0 0 0 4px rgba(0,117,179,0.18)' }),
  },
  kbd: {
    position: 'absolute',
    left: 12,
    minWidth: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DESKTOP_COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    ...webOnly({ boxShadow: '0 1px 0 rgba(16,34,50,0.08)' }),
  },
  kbdText: { fontSize: 12, color: DESKTOP_COLORS.inkFaint },
  clear: {
    position: 'absolute',
    left: 8,
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ transition: 'background-color 150ms ease' }),
  },
  clearHover: { backgroundColor: TONE_SOFT.neutral },

  ghostButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    backgroundColor: DESKTOP_COLORS.surface,
    ...webOnly({
      boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
      transition: `background-color 160ms ${EASE_OUT}, border-color 160ms ${EASE_OUT}, transform 160ms ${EASE_OUT}`,
    }),
  },
  ghostButtonTight: { paddingHorizontal: 12 },
  ghostButtonHover: { backgroundColor: DESKTOP_COLORS.surfaceMuted, borderColor: '#CFD7DE' },
  ghostButtonOn: { backgroundColor: BRAND_SOFT, borderColor: 'rgba(0,117,179,0.35)' },
  ghostButtonText: { fontSize: 15.5, color: DESKTOP_COLORS.ink },
  ghostButtonTextOn: { color: DESKTOP_COLORS.brand },
  countBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TONE_SOFT.neutral,
  },
  countBadgeText: { fontSize: 12, lineHeight: 15, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  primaryButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    paddingRight: 18,
    paddingLeft: 22,
    borderRadius: 14,
    backgroundColor: DESKTOP_COLORS.brand,
    ...webOnly({
      backgroundImage: 'linear-gradient(180deg, #1B9FE0 0%, #0078B8 100%)',
      boxShadow: '0 10px 22px -12px rgba(0,117,179,0.9), inset 0 1px 0 rgba(255,255,255,0.25)',
      transition: `transform 180ms ${EASE_OUT}, box-shadow 200ms ${EASE_OUT}`,
    }),
  },
  primaryButtonTight: { width: 48, paddingLeft: 0, paddingRight: 0 },
  primaryButtonHover: {
    transform: [{ translateY: -1 }],
    ...webOnly({ boxShadow: '0 14px 26px -12px rgba(0,117,179,0.95), inset 0 1px 0 rgba(255,255,255,0.3)' }),
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15.5 },

  listCard: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    backgroundColor: DESKTOP_COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16,34,50,0.05)',
    overflow: 'hidden',
    ...webOnly({ boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 6px 20px -8px rgba(16,34,50,0.10)' }),
  },
  listHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 14,
  },
  listTitle: { fontSize: 20, lineHeight: 26, color: DESKTOP_COLORS.ink, letterSpacing: -0.3, flexShrink: 1 },
  listCount: { fontSize: 15, color: DESKTOP_COLORS.inkFaint, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  searchChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingRight: 12,
    paddingLeft: 6,
    borderRadius: 16,
    backgroundColor: BRAND_SOFT,
    maxWidth: 320,
  },
  searchChipText: { fontSize: 13.5, color: DESKTOP_COLORS.brand, flexShrink: 1 },
  searchChipClear: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  searchChipClearHover: { backgroundColor: 'rgba(0,117,179,0.14)' },

  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 6 },
  stateIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: TONE_SOFT.neutral,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stateTitle: { fontSize: 18, color: DESKTOP_COLORS.ink, textAlign: 'center' },
  stateHint: { fontSize: 15, color: DESKTOP_COLORS.inkMuted, textAlign: 'center', marginBottom: 12 },

  tableScroll: { flex: 1, minHeight: 0, ...webOnly({ overflowX: 'auto', overflowY: 'hidden' }) },
  table: { flex: 1, minHeight: 0, width: '100%' },
  rows: { flex: 1 },
  rowsContent: { paddingTop: 6, paddingBottom: 12 },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    minHeight: 66,
    marginHorizontal: ROW_INSET,
    paddingHorizontal: ROW_PADDING,
    paddingVertical: 10,
    borderRadius: 14,
    ...webOnly({ transition: `background-color 150ms ${EASE_OUT}` }),
  },
  // Zebra striping: every second row sits on a faint grey so the eye can follow a line across the columns.
  rowAlt: { backgroundColor: '#F8FAFB' },
  rowHover: { backgroundColor: '#EDF3F8' },
  rowPressed: { backgroundColor: '#E3ECF3' },
  rowChevron: { width: CHEVRON_WIDTH, flexShrink: 0, alignItems: 'flex-start' },
  chevronIcon: { ...webOnly({ transition: `transform 220ms ${EASE_OUT}` }) },
  chevronIconHover: { transform: [{ translateX: -3 }] },
  headerRow: {
    minHeight: 0,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: DESKTOP_COLORS.borderSoft,
    borderRadius: 0,
    marginHorizontal: 0,
    paddingHorizontal: ROW_INSET + ROW_PADDING,
    backgroundColor: DESKTOP_COLORS.surfaceMuted,
  },
  headerText: { fontSize: 13, color: '#4F5B67' },
  cell: { paddingLeft: 14, gap: 3, alignItems: 'flex-end' },
  cellText: { fontSize: 15, color: DESKTOP_COLORS.inkMuted, maxWidth: '100%' },
  cellValue: { fontSize: 15, color: DESKTOP_COLORS.ink, maxWidth: '100%' },
  cellTitle: { fontSize: 16, color: DESKTOP_COLORS.ink, maxWidth: '100%' },
  faint: { color: DESKTOP_COLORS.inkFaint },
  subText: { fontSize: 13, color: DESKTOP_COLORS.inkFaint, maxWidth: '100%' },
  mark: { backgroundColor: '#FFE9A8', borderRadius: 3 },
  twoLine: { flex: 1, minWidth: 0, gap: 3, alignItems: 'flex-end' },
  nameCell: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minWidth: 0, alignSelf: 'stretch' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...webOnly({ boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.08)' }),
  },
  avatarText: { color: '#FFFFFF', fontSize: 16, textAlign: 'center' },
  vehicleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: BRAND_SOFT,
  },

  status: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, flexShrink: 0 },
  statusLoud: { height: 28, paddingRight: 9, paddingLeft: 11, borderRadius: 14 },
  statusText: { fontSize: 14.5 },
  pill: { height: 28, paddingHorizontal: 11, borderRadius: 14, justifyContent: 'center', flexShrink: 0 },
  pillText: { fontSize: 13.5 },

  plates: { gap: 5, alignItems: 'flex-end' },
  plate: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 28,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    backgroundColor: '#FCD116',
    ...webOnly({ boxShadow: '0 1px 0 rgba(0,0,0,0.12)' }),
  },
  plateSmall: { height: 24 },
  plateMatch: { ...webOnly({ boxShadow: '0 0 0 3px #FFE9A8' }) },
  plateStrip: { width: 14, backgroundColor: '#0B4FA3', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 2 },
  plateIL: { fontSize: 7, lineHeight: 8, color: '#FFFFFF', textAlign: 'center' },
  plateText: {
    alignSelf: 'center',
    paddingLeft: 7,
    paddingRight: 8,
    fontSize: 14.5,
    letterSpacing: 0.6,
    color: '#111111',
    ...webOnly({ fontVariantNumeric: 'tabular-nums' }),
  },
  plateTextSmall: { fontSize: 13, paddingLeft: 6, paddingRight: 7 },

  skeleton: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EEF1F4',
    ...webOnly({
      backgroundImage: 'linear-gradient(90deg, #EEF1F4 0%, #F7F9FA 40%, #EEF1F4 80%)',
      backgroundSize: '300% 100%',
      animationKeyframes: { from: { backgroundPosition: '100% 0' }, to: { backgroundPosition: '-200% 0' } },
      animationDuration: '1.3s',
      animationTimingFunction: 'linear',
      animationIterationCount: 'infinite',
    }),
  },
  skeletonAvatar: { width: 40, height: 40, borderRadius: 20, flexShrink: 0 },
});
