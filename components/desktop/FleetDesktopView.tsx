import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ComplianceItem, DriverRow, Vehicle, VehicleDriverWithProfile } from '../../lib/adminApi';
import { complianceRemainingDays, findComplianceDef, VEHICLE_STATUS_LABELS } from '../../lib/compliance';
import { SERVICE_WARN_KM } from '../../lib/fleetCardHelpers';
import { formatPlate } from '../../lib/plate';
import { nextServiceKmOf } from '../../lib/serviceSchedule';
import { daysUntilExpiry, expiryState, formatDate } from '../../lib/theme';
import { DLtrText, DText, HoverPressable, StatusPill } from './primitives';
import { DESKTOP_AVATAR_COLORS, DESKTOP_COLORS, DESKTOP_FONT, DESKTOP_TONES, DesktopTone, webOnly } from './desktopTheme';
import { FleetOverview, OverviewFocus } from './FleetOverview';

/**
 * Desktop body of the fleet screen: the overview (greeting, fleet health,
 * needs-attention queue) above a drivers/vehicles table with search + filter
 * chips. Purely presentational — FleetScreen
 * owns loading, filtering and navigation and hands everything in, so the
 * phone and desktop layouts always show the same data.
 */

type Mode = 'drivers' | 'vehicles';

export type FleetChip<T extends string> = { value: T; label: string; count: number };

export interface FleetDesktopViewProps<LF extends string, SF extends string> {
  mode: Mode;
  onModeChange: (mode: Mode) => void;

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

const EXPIRY_TONE: Record<string, { tone: DesktopTone; label: string }> = {
  ok: { tone: 'ok', label: 'תקין' },
  soon: { tone: 'warn', label: 'קרוב לפוג' },
  expired: { tone: 'bad', label: 'פג תוקף' },
  missing: { tone: 'neutral', label: 'חסר' },
};

const VEHICLE_STATUS_TONE: Record<string, DesktopTone> = {
  active: 'ok',
  maintenance: 'warn',
  disabled: 'neutral',
  archived: 'neutral',
};

function daysTone(days: number | null): { tone: DesktopTone; label: string } {
  if (days == null) return EXPIRY_TONE.missing;
  if (days < 0) return EXPIRY_TONE.expired;
  return days <= 30 ? EXPIRY_TONE.soon : EXPIRY_TONE.ok;
}

function serviceInfo(vehicle: Vehicle): { tone: DesktopTone; label: string } {
  const nextServiceKm = nextServiceKmOf(vehicle);
  if (nextServiceKm == null) return { tone: 'neutral', label: '—' };
  const km = nextServiceKm - vehicle.odometer;
  if (km <= 0) return { tone: 'bad', label: `באיחור ${Math.abs(km).toLocaleString()} ק״מ` };
  return { tone: km <= SERVICE_WARN_KM ? 'warn' : 'neutral', label: `${km.toLocaleString()} ק״מ` };
}

function vehicleName(vehicle: Vehicle): string {
  return [vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') || 'רכב ללא דגם';
}

function initialOf(name: string | null | undefined): string {
  return (name ?? '').trim().charAt(0) || '?';
}

export function FleetDesktopView<LF extends string, SF extends string>(props: FleetDesktopViewProps<LF, SF>) {
  const { mode } = props;
  const isDrivers = mode === 'drivers';
  const [searchFocused, setSearchFocused] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const listTop = useRef(0);

  // Overview legend rows jump to the matching table filter.
  const focusList = (focus: OverviewFocus) => {
    props.onModeChange(focus.mode);
    if (focus.mode === 'drivers') {
      const chip = props.driverChips.find((c) => c.value === focus.filter);
      if (chip) props.onDriverFilter(chip.value);
    } else {
      const chip = props.vehicleChips.find((c) => c.value === focus.filter);
      if (chip) props.onVehicleFilter(chip.value);
    }
    scrollRef.current?.scrollTo({ y: Math.max(0, listTop.current - 12), animated: true });
  };

  const vehicleCompliance = (vehicle: Vehicle) => {
    const items = props.compliance.get(vehicle.id) ?? [];
    const insurance = items.find((c) => c.item_type === 'insurance_mandatory') ?? null;
    const test = items.find((c) => c.item_type === 'annual_test') ?? null;
    const testDef = findComplianceDef('vehicle', 'annual_test');
    return {
      insurance,
      insuranceInfo: daysTone(daysUntilExpiry(insurance?.expiry_date)),
      test,
      testInfo: daysTone(testDef ? complianceRemainingDays(testDef, test) : daysUntilExpiry(test?.expiry_date)),
    };
  };

  const assignedDrivers = (vehicle: Vehicle) => {
    const list = props.vehicleDrivers.get(vehicle.id) ?? [];
    const primary = list.find((d) => d.is_primary) ?? list[0] ?? null;
    return { primary, extra: Math.max(0, list.length - (primary ? 1 : 0)) };
  };

  /* ---------------------------------------------------------------- */

  const loading = isDrivers ? props.driversLoading : props.vehiclesLoading;
  const error = isDrivers
    ? props.driversError && props.drivers.length === 0 ? props.driversError : null
    : props.vehiclesError && props.vehicles.length === 0 ? props.vehiclesError : null;
  const isEmpty = isDrivers ? props.filteredDrivers.length === 0 : props.filteredVehicles.length === 0;
  const hasAny = isDrivers ? props.drivers.length > 0 : props.vehicles.length > 0;

  return (
    <View style={styles.root}>
      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content}>
        <FleetOverview
          drivers={props.drivers}
          vehicles={props.vehicles}
          compliance={props.compliance}
          vehicleDrivers={props.vehicleDrivers}
          loading={props.driversLoading || props.vehiclesLoading}
          onFocus={focusList}
          onOpenDriver={props.onOpenDriver}
          onOpenVehicle={props.onOpenVehicle}
        />

        <View style={styles.toolbar} onLayout={(e) => { listTop.current = e.nativeEvent.layout.y; }}>
          <DText weight="bold" style={styles.sectionTitle}>רשימת הצי</DText>
          <View style={styles.tabs} accessibilityRole="tablist">
            <Tab label="נהגים" count={props.driverKpis.total} active={isDrivers} onPress={() => props.onModeChange('drivers')} />
            <Tab label="רכבים" count={props.vehicleKpis.total} active={!isDrivers} onPress={() => props.onModeChange('vehicles')} />
          </View>
        </View>

        <View style={styles.filters}>
          <TextInput
            value={isDrivers ? props.driverSearch : props.vehicleSearch}
            onChangeText={isDrivers ? props.onDriverSearch : props.onVehicleSearch}
            placeholder={isDrivers ? 'חיפוש לפי שם, ת.ז, מספר עובד או טלפון' : 'חיפוש לפי מספר רישוי, דגם או נהג'}
            placeholderTextColor={DESKTOP_COLORS.inkFaint}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={[styles.search, searchFocused && styles.searchFocused]}
          />
          {isDrivers
            ? props.driverChips.map((chip) => (
                <Chip key={chip.value} chip={chip} active={props.driverFilter === chip.value} onPress={() => props.onDriverFilter(chip.value)} />
              ))
            : props.vehicleChips.map((chip) => (
                <Chip key={chip.value} chip={chip} active={props.vehicleFilter === chip.value} onPress={() => props.onVehicleFilter(chip.value)} />
              ))}
          {isDrivers && (
            <HoverPressable style={styles.chip} hoverStyle={styles.secondaryButtonHover} pressStyle={styles.pressDown} onPress={props.onOpenArchive}>
              <DText weight="semiBold" style={styles.chipText}>ארכיון</DText>
              <DText weight="semiBold" style={styles.chipCount}>{props.archivedCount}</DText>
            </HoverPressable>
          )}
          <View style={styles.listActions}>
            <HoverPressable
              style={styles.primaryButton}
              hoverStyle={styles.primaryButtonHover}
              onPress={isDrivers ? props.onAddDriver : props.onAddVehicle}
            >
              <DText weight="semiBold" style={styles.primaryButtonText}>
                {isDrivers ? '+ הוספת נהג' : '+ הוספת רכב'}
              </DText>
            </HoverPressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.table}>
            <TableHeader columns={isDrivers ? DRIVER_COLUMNS : VEHICLE_COLUMNS} />
            {Array.from({ length: 6 }, (_, i) => (
              <View key={i} style={styles.row}>
                <View style={styles.skeletonAvatar} />
                <View style={[styles.skeletonBar, { flex: 2, maxWidth: 160 }]} />
                <View style={[styles.skeletonBar, { flex: 1, maxWidth: 90 }]} />
                <View style={[styles.skeletonBar, { flex: 1, maxWidth: 90 }]} />
                <View style={[styles.skeletonBar, styles.statusCell]} />
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
              <DText weight="semiBold" style={styles.secondaryButtonText}>נסה שוב</DText>
            </HoverPressable>
          </View>
        ) : isEmpty ? (
          <View style={styles.state}>
            <DText weight="semiBold" style={styles.stateTitle}>
              {hasAny ? 'אין תוצאות' : isDrivers ? 'עדיין אין נהגים' : 'עדיין אין רכבים'}
            </DText>
            <DText style={styles.stateHint}>
              {hasAny
                ? 'נסה לשנות את החיפוש או הסינון'
                : isDrivers ? 'הוסף את הנהג הראשון של החברה' : 'הוסף את הרכב הראשון של החברה'}
            </DText>
          </View>
        ) : isDrivers ? (
          <View style={styles.table}>
            <TableHeader columns={DRIVER_COLUMNS} />
            {props.filteredDrivers.map((driver, index) => {
              const license = EXPIRY_TONE[expiryState(driver.license_expiry)] ?? EXPIRY_TONE.missing;
              const plates = driver.vehicles.map((v) => formatPlate(v.plate_number)).join(', ');
              const pending = props.pendingSigning.get(driver.id) ?? 0;
              return (
                <HoverPressable
                  key={driver.id}
                  style={styles.row}
                  hoverStyle={styles.rowHover}
                  pressStyle={styles.rowPress}
                  onPress={() => props.onOpenDriver(driver.id)}
                  accessibilityLabel={driver.full_name ?? undefined}
                >
                  <View style={[styles.cell, { flex: DRIVER_COLUMNS[0].flex }]}>
                    <View style={styles.nameCell}>
                      <View style={[styles.avatar, { backgroundColor: DESKTOP_AVATAR_COLORS[index % DESKTOP_AVATAR_COLORS.length] }]}>
                        <DText weight="bold" style={styles.avatarText}>{initialOf(driver.full_name)}</DText>
                      </View>
                      <DText weight="semiBold" style={styles.cellText} numberOfLines={1}>
                        {driver.full_name || 'נהג ללא שם'}
                      </DText>
                    </View>
                  </View>
                  <Cell flex={DRIVER_COLUMNS[1].flex} text={driver.license_classes || '—'} ltr={!!driver.license_classes} />
                  <Cell flex={DRIVER_COLUMNS[2].flex} text={formatDate(driver.license_expiry)} ltr />
                  <Cell flex={DRIVER_COLUMNS[3].flex} text={plates || 'ללא רכב'} ltr={!!plates} />
                  <Cell
                    flex={DRIVER_COLUMNS[4].flex}
                    text={String(pending)}
                    color={pending > 0 ? DESKTOP_TONES.warn.fg : undefined}
                    weight={pending > 0 ? 'semiBold' : undefined}
                  />
                  <View style={[styles.cell, styles.statusCell]}>
                    <StatusPill tone={license.tone} label={license.label} />
                  </View>
                  <Ionicons name="chevron-back" size={13} color={DESKTOP_COLORS.inkFaint} style={styles.rowChevron} />
                </HoverPressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.table}>
            <TableHeader columns={VEHICLE_COLUMNS} />
            {props.filteredVehicles.map((vehicle) => {
              const { insuranceInfo } = vehicleCompliance(vehicle);
              const { primary, extra } = assignedDrivers(vehicle);
              const service = serviceInfo(vehicle);
              const statusTone = VEHICLE_STATUS_TONE[vehicle.status] ?? 'neutral';
              return (
                <HoverPressable
                  key={vehicle.id}
                  style={styles.row}
                  hoverStyle={styles.rowHover}
                  pressStyle={styles.rowPress}
                  onPress={() => props.onOpenVehicle(vehicle.id)}
                  accessibilityLabel={vehicleName(vehicle)}
                >
                  <View style={[styles.cell, { flex: VEHICLE_COLUMNS[0].flex }]}>
                    <View style={styles.nameCell}>
                      <View style={[styles.avatar, styles.vehicleIcon]}>
                        <Ionicons name="car-sport" size={14} color={DESKTOP_COLORS.brand} />
                      </View>
                      <DText weight="semiBold" style={styles.cellText} numberOfLines={1}>
                        {vehicleName(vehicle)}
                      </DText>
                    </View>
                  </View>
                  <View style={[styles.cell, { flex: VEHICLE_COLUMNS[1].flex }]}>
                    <DLtrText style={[styles.cellText, styles.muted, styles.plate]} numberOfLines={1}>
                      {formatPlate(vehicle.plate_number)}
                    </DLtrText>
                  </View>
                  <Cell
                    flex={VEHICLE_COLUMNS[2].flex}
                    text={primary?.full_name ? `${primary.full_name}${extra > 0 ? ` +${extra}` : ''}` : '—'}
                  />
                  <Cell
                    flex={VEHICLE_COLUMNS[3].flex}
                    text={primary ? formatDate(primary.license_expiry) : '—'}
                    ltr={!!primary?.license_expiry}
                    color={primary?.license_expiry ? undefined : DESKTOP_COLORS.inkFaint}
                  />
                  <Cell
                    flex={VEHICLE_COLUMNS[4].flex}
                    text={insuranceInfo.label}
                    weight="semiBold"
                    color={insuranceInfo.tone === 'neutral' ? DESKTOP_COLORS.inkFaint : DESKTOP_TONES[insuranceInfo.tone].fg}
                  />
                  <Cell
                    flex={VEHICLE_COLUMNS[5].flex}
                    text={service.label}
                    color={service.tone === 'neutral' ? undefined : DESKTOP_TONES[service.tone].fg}
                    weight={service.tone === 'neutral' ? undefined : 'semiBold'}
                  />
                  <View style={[styles.cell, styles.statusCell]}>
                    <StatusPill tone={statusTone} label={VEHICLE_STATUS_LABELS[vehicle.status] ?? vehicle.status} />
                  </View>
                  <Ionicons name="chevron-back" size={13} color={DESKTOP_COLORS.inkFaint} style={styles.rowChevron} />
                </HoverPressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */

const DRIVER_COLUMNS = [
  { label: 'נהג', flex: 2 },
  { label: 'דרגה', flex: 1 },
  { label: 'תוקף רישיון', flex: 1 },
  { label: 'רכב', flex: 1 },
  { label: 'מסמכים לחתימה', flex: 1 },
  { label: 'סטטוס', flex: 0 },
];

const VEHICLE_COLUMNS = [
  { label: 'רכב', flex: 1.6 },
  { label: 'מספר רישוי', flex: 1 },
  { label: 'נהג ראשי', flex: 1.2 },
  { label: 'תוקף רישיון נהג', flex: 1.15 },
  { label: 'ביטוח חובה', flex: 1 },
  { label: 'טיפול הבא', flex: 1 },
  { label: 'סטטוס', flex: 0 },
];

function TableHeader({ columns }: { columns: { label: string; flex: number }[] }) {
  return (
    <View style={[styles.row, styles.headerRow]}>
      {columns.map((column) => (
        <View key={column.label} style={[styles.cell, column.flex ? { flex: column.flex } : styles.statusCell]}>
          <DText weight="bold" style={styles.headerText} numberOfLines={1}>{column.label}</DText>
        </View>
      ))}
      <View style={styles.rowChevronSpacer} />
    </View>
  );
}

function Cell({
  flex,
  text,
  ltr,
  color,
  weight,
}: {
  flex: number;
  text: string;
  ltr?: boolean;
  color?: string;
  weight?: keyof typeof DESKTOP_FONT;
}) {
  const TextComponent = ltr ? DLtrText : DText;
  return (
    <View style={[styles.cell, { flex }]}>
      <TextComponent weight={weight} style={[styles.cellText, styles.muted, color ? { color } : null]} numberOfLines={1}>
        {text}
      </TextComponent>
    </View>
  );
}

function Tab({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) {
  return (
    <HoverPressable
      style={[styles.tab, active && styles.tabActive]}
      hoverStyle={active ? undefined : styles.tabHover}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <DText weight="semiBold" style={[styles.tabText, active && styles.tabTextActive]}>{label}</DText>
      <DText weight="semiBold" style={[styles.tabCount, active && styles.tabCountActive]}>{count}</DText>
    </HoverPressable>
  );
}

function Chip<T extends string>({ chip, active, onPress }: { chip: FleetChip<T>; active: boolean; onPress: () => void }) {
  return (
    <HoverPressable
      style={[styles.chip, active && styles.chipActive]}
      hoverStyle={active ? undefined : styles.secondaryButtonHover}
      onPress={onPress}
      accessibilityState={{ selected: active }}
    >
      <DText weight="semiBold" style={[styles.chipText, active && styles.chipTextActive]}>
        {chip.label}
      </DText>
      <DText weight="semiBold" style={[styles.chipCount, active && styles.chipCountActive]}>
        {chip.count}
      </DText>
    </HoverPressable>
  );
}

const styles = StyleSheet.create({
  pressDown: { transform: [{ scale: 0.97 }] },
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingTop: 18, paddingHorizontal: 22, paddingBottom: 32, width: '100%', maxWidth: 1440, alignSelf: 'center' },

  toolbar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 13.5, color: DESKTOP_COLORS.ink },
  tabs: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2,
    padding: 3,
    borderRadius: 9,
    backgroundColor: '#E9EDF0',
  },
  tab: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 7,
    ...webOnly({ transition: 'background-color 160ms ease, box-shadow 160ms ease' }),
  },
  tabActive: {
    backgroundColor: DESKTOP_COLORS.surface,
    ...webOnly({ boxShadow: '0 1px 2px rgba(22,34,46,0.10), 0 0 0 0.5px rgba(22,34,46,0.06)' }),
  },
  tabHover: { backgroundColor: 'rgba(255,255,255,0.55)' },
  tabText: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  tabTextActive: { color: DESKTOP_COLORS.ink },
  tabCount: { fontSize: 11, color: DESKTOP_COLORS.inkFaint, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  tabCountActive: { color: DESKTOP_COLORS.brand },

  primaryButton: {
    backgroundColor: DESKTOP_COLORS.brand,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.brand,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  primaryButtonHover: { backgroundColor: DESKTOP_COLORS.brandHover, borderColor: DESKTOP_COLORS.brandHover },
  primaryButtonText: { color: '#fff', fontSize: 12.5, textAlign: 'center' },
  secondaryButton: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  secondaryButtonHover: { backgroundColor: DESKTOP_COLORS.canvas },
  secondaryButtonText: { color: DESKTOP_COLORS.ink, fontSize: 12, textAlign: 'center' },

  filters: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  listActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginRight: 'auto' },
  search: {
    width: 280,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
    backgroundColor: DESKTOP_COLORS.surface,
    paddingHorizontal: 10,
    fontSize: 12.5,
    fontFamily: DESKTOP_FONT.regular,
    color: DESKTOP_COLORS.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...webOnly({ outlineStyle: 'none' }),
  },
  searchFocused: {
    borderColor: DESKTOP_COLORS.brand,
    ...webOnly({ boxShadow: `0 0 0 2px ${DESKTOP_COLORS.brandFocusRing}` }),
  },
  chip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
    backgroundColor: DESKTOP_COLORS.surface,
    borderRadius: 6,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  chipActive: { backgroundColor: DESKTOP_COLORS.ink, borderColor: DESKTOP_COLORS.ink },
  chipText: { fontSize: 12, color: DESKTOP_COLORS.inkMuted },
  chipTextActive: { color: '#fff' },
  chipCount: { fontSize: 11, color: DESKTOP_COLORS.inkFaint },
  chipCountActive: { color: 'rgba(255,255,255,0.65)' },

  state: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 6 },
  stateTitle: { fontSize: 14, color: DESKTOP_COLORS.inkMuted, textAlign: 'center' },
  stateHint: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint, textAlign: 'center', marginBottom: 6 },

  table: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.borderSoft,
    ...webOnly({ transition: 'background-color 150ms ease, transform 100ms ease-out' }),
  },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  rowPress: { transform: [{ scale: 0.997 }] },
  rowChevron: { marginLeft: 2, width: 15, flexShrink: 0 },
  rowChevronSpacer: { width: 15, flexShrink: 0 },
  headerRow: {
    paddingVertical: 8,
    backgroundColor: DESKTOP_COLORS.surfaceMuted,
    borderBottomColor: DESKTOP_COLORS.border,
  },
  headerText: { fontSize: 11, color: DESKTOP_COLORS.inkFaint },
  cell: { minWidth: 0, paddingLeft: 12 },
  statusCell: { width: 90, flexShrink: 0, paddingLeft: 0 },
  cellText: { fontSize: 12.5 },
  muted: { color: DESKTOP_COLORS.inkMuted },
  plate: { fontSize: 12, ...webOnly({ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }) },
  nameCell: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9, minWidth: 0 },
  avatar: { width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  skeletonAvatar: { width: 26, height: 26, borderRadius: 6, backgroundColor: DESKTOP_COLORS.borderSoft, marginLeft: 9 },
  skeletonBar: { height: 12, borderRadius: 4, backgroundColor: DESKTOP_COLORS.borderSoft, marginLeft: 12 },
  avatarText: { color: '#fff', fontSize: 11, textAlign: 'center' },
  vehicleIcon: { backgroundColor: '#F1F4F7' },
});
