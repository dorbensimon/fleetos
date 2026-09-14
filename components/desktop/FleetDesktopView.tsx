import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ComplianceItem, DriverRow, Vehicle, VehicleDriverWithProfile } from '../../lib/adminApi';
import { complianceRemainingDays, findComplianceDef, VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '../../lib/compliance';
import { SERVICE_WARN_KM } from '../../lib/fleetCardHelpers';
import { formatPlate } from '../../lib/plate';
import { daysUntilExpiry, expiryState, formatDate } from '../../lib/theme';
import { DLtrText, DText, HoverPressable, StatusPill } from './primitives';
import { DESKTOP_AVATAR_COLORS, DESKTOP_COLORS, DESKTOP_FONT, DESKTOP_TONES, DesktopTone, webOnly } from './desktopTheme';

/**
 * Desktop body of the fleet screen: drivers/vehicles tabs, search + filter
 * chips, KPI strip and a dense table. Purely presentational — FleetScreen
 * owns loading, filtering and navigation and hands everything in, so the
 * phone and desktop layouts always show the same data.
 */

type Mode = 'drivers' | 'vehicles';

export type FleetChip<T extends string> = { value: T; label: string; count: number };

type DetailAction = { label: string; onPress: () => void; primary?: boolean; disabled?: boolean };
type DetailRow = { label: string; value: string; ltr?: boolean; tone?: DesktopTone };
type Detail = {
  avatar: string;
  avatarBg: string;
  title: string;
  subtitle: string;
  actions: DetailAction[];
  groups: { title: string; rows: DetailRow[] }[];
};

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
  if (vehicle.next_service_km == null) return { tone: 'neutral', label: '—' };
  const km = vehicle.next_service_km - vehicle.odometer;
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
  const [detail, setDetail] = useState<Detail | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    if (!detail || Platform.OS !== 'web') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetail(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detail]);

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

  const openDriverDetail = (driver: DriverRow, index: number) => {
    const license = EXPIRY_TONE[expiryState(driver.license_expiry)] ?? EXPIRY_TONE.missing;
    const plates = driver.vehicles.map((v) => formatPlate(v.plate_number)).join(', ');
    setDetail({
      avatar: initialOf(driver.full_name),
      avatarBg: DESKTOP_AVATAR_COLORS[index % DESKTOP_AVATAR_COLORS.length],
      title: driver.full_name || 'נהג ללא שם',
      subtitle: [
        driver.license_classes ? `דרגה ${driver.license_classes}` : null,
        driver.license_expiry ? `תוקף ${formatDate(driver.license_expiry)}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      actions: [
        { label: 'פתיחת תיק נהג', primary: true, onPress: () => props.onOpenDriver(driver.id) },
        { label: 'התקשרות', disabled: !driver.phone, onPress: () => props.onCallDriver(driver.phone) },
        ...(driver.vehicle_id
          ? [{ label: 'פתיחת רכב משויך', onPress: () => props.onOpenVehicle(driver.vehicle_id!) }]
          : []),
      ],
      groups: [
        {
          title: 'פרטי קשר ורכב',
          rows: [
            { label: 'טלפון', value: driver.phone || '—', ltr: true },
            ...(driver.email ? [{ label: 'מייל', value: driver.email, ltr: true }] : []),
            { label: 'מספר עובד', value: driver.employee_number || '—', ltr: true },
            { label: 'רכב משויך', value: plates || 'ללא רכב', ltr: !!plates },
          ],
        },
        {
          title: 'מסמכים ורישוי',
          rows: [
            { label: 'תוקף רישיון', value: formatDate(driver.license_expiry), ltr: true },
            { label: 'סטטוס רישיון', value: license.label, tone: license.tone },
            { label: 'מסמכים לחתימה', value: String(props.pendingSigning.get(driver.id) ?? 0) },
          ],
        },
      ],
    });
  };

  const openVehicleDetail = (vehicle: Vehicle) => {
    const { insurance, insuranceInfo, test, testInfo } = vehicleCompliance(vehicle);
    const { primary, extra } = assignedDrivers(vehicle);
    const service = serviceInfo(vehicle);
    const department = vehicle.department_id ? props.departmentNames.get(vehicle.department_id) : null;
    setDetail({
      avatar: 'ר',
      avatarBg: DESKTOP_COLORS.ink,
      title: vehicleName(vehicle),
      subtitle: [formatPlate(vehicle.plate_number), VEHICLE_TYPE_LABELS[vehicle.vehicle_type]].filter(Boolean).join(' · '),
      actions: [
        { label: 'פתיחת תיק רכב', primary: true, onPress: () => props.onOpenVehicle(vehicle.id) },
        ...(primary ? [{ label: 'פתיחת נהג ראשי', onPress: () => props.onOpenDriver(primary.driver_id) }] : []),
        ...(vehicle.status === 'archived'
          ? [{
              label: 'שחזור רכב',
              disabled: props.restoringVehicleId === vehicle.id,
              onPress: () => props.onRestoreVehicle(vehicle.id),
            }]
          : []),
      ],
      groups: [
        {
          title: 'זיהוי ושיוך',
          rows: [
            { label: 'מספר רישוי', value: formatPlate(vehicle.plate_number), ltr: true },
            ...(vehicle.internal_code ? [{ label: 'קוד פנימי', value: vehicle.internal_code, ltr: true }] : []),
            { label: 'מחלקה', value: department || '—' },
            { label: 'נהג ראשי', value: primary?.full_name || '—' },
            ...(extra > 0 ? [{ label: 'נהגים נוספים', value: String(extra) }] : []),
          ],
        },
        {
          title: 'תוקפים ותחזוקה',
          rows: [
            {
              label: 'ביטוח חובה',
              value: insurance?.expiry_date ? `${formatDate(insurance.expiry_date)} · ${insuranceInfo.label}` : insuranceInfo.label,
              tone: insuranceInfo.tone,
            },
            {
              label: 'טסט שנתי',
              value: test?.expiry_date ? `${formatDate(test.expiry_date)} · ${testInfo.label}` : testInfo.label,
              tone: testInfo.tone,
            },
            { label: 'טיפול הבא', value: service.label, tone: service.tone },
            { label: 'קילומטראז׳', value: `${vehicle.odometer.toLocaleString()} ק״מ` },
          ],
        },
      ],
    });
  };

  const runAction = (action: DetailAction) => {
    setDetail(null);
    action.onPress();
  };

  /* ---------------------------------------------------------------- */

  const kpis = isDrivers
    ? [
        { label: 'סה״כ נהגים', value: props.driverKpis.total, color: DESKTOP_COLORS.ink },
        { label: 'רישיון קרוב לפוג', value: props.driverKpis.soon, color: DESKTOP_TONES.warn.fg },
        { label: 'רישיון פג תוקף', value: props.driverKpis.expired, color: DESKTOP_TONES.bad.fg },
      ]
    : [
        { label: 'סה״כ רכבים', value: props.vehicleKpis.total, color: DESKTOP_COLORS.ink },
        { label: 'פעילים', value: props.vehicleKpis.active, color: DESKTOP_TONES.ok.fg },
        { label: 'בטיפול / מושבתים', value: props.vehicleKpis.inactive, color: DESKTOP_TONES.warn.fg },
      ];

  const loading = isDrivers ? props.driversLoading : props.vehiclesLoading;
  const error = isDrivers
    ? props.driversError && props.drivers.length === 0 ? props.driversError : null
    : props.vehiclesError && props.vehicles.length === 0 ? props.vehiclesError : null;
  const isEmpty = isDrivers ? props.filteredDrivers.length === 0 : props.filteredVehicles.length === 0;
  const hasAny = isDrivers ? props.drivers.length > 0 : props.vehicles.length > 0;

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.toolbar}>
          <View style={styles.tabs}>
            <Tab label="נהגים" active={isDrivers} onPress={() => props.onModeChange('drivers')} />
            <Tab label="רכבים" active={!isDrivers} onPress={() => props.onModeChange('vehicles')} />
          </View>
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
            <HoverPressable style={styles.archiveLink} onPress={props.onOpenArchive}>
              <DText weight="semiBold" style={styles.linkText}>ארכיון נהגים ({props.archivedCount})</DText>
            </HoverPressable>
          )}
        </View>

        <View style={styles.kpis}>
          {kpis.map((kpi) => (
            <View key={kpi.label} style={styles.kpi}>
              <DText weight="extraBold" style={[styles.kpiValue, { color: kpi.color }]}>{kpi.value}</DText>
              <DText weight="medium" style={styles.kpiLabel}>{kpi.label}</DText>
            </View>
          ))}
        </View>

        {loading ? (
          <View style={styles.state}>
            <ActivityIndicator color={DESKTOP_COLORS.brand} />
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
                  onPress={() => openDriverDetail(driver, index)}
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
                  onPress={() => openVehicleDetail(vehicle)}
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
                    text={insuranceInfo.label}
                    weight="semiBold"
                    color={insuranceInfo.tone === 'neutral' ? DESKTOP_COLORS.inkFaint : DESKTOP_TONES[insuranceInfo.tone].fg}
                  />
                  <Cell
                    flex={VEHICLE_COLUMNS[4].flex}
                    text={service.label}
                    color={service.tone === 'neutral' ? undefined : DESKTOP_TONES[service.tone].fg}
                    weight={service.tone === 'neutral' ? undefined : 'semiBold'}
                  />
                  <View style={[styles.cell, styles.statusCell]}>
                    <StatusPill tone={statusTone} label={VEHICLE_STATUS_LABELS[vehicle.status] ?? vehicle.status} />
                  </View>
                </HoverPressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {detail && (
        <View style={styles.overlay}>
          <HoverPressable style={StyleSheet.absoluteFill} onPress={() => setDetail(null)} accessibilityLabel="סגירה" />
          <View style={styles.dialog} accessibilityViewIsModal>
            <View style={styles.dialogHeader}>
              <View style={styles.dialogIdentity}>
                <View style={[styles.dialogAvatar, { backgroundColor: detail.avatarBg }]}>
                  <DText weight="bold" style={styles.dialogAvatarText}>{detail.avatar}</DText>
                </View>
                <View style={styles.flexShrink}>
                  <DText weight="bold" style={styles.dialogTitle} numberOfLines={1}>{detail.title}</DText>
                  {!!detail.subtitle && <DText style={styles.dialogSubtitle}>{detail.subtitle}</DText>}
                </View>
              </View>
              <HoverPressable
                style={styles.closeButton}
                hoverStyle={styles.secondaryButtonHover}
                onPress={() => setDetail(null)}
                accessibilityLabel="סגירה"
              >
                <Ionicons name="close" size={14} color={DESKTOP_COLORS.ink} />
              </HoverPressable>
            </View>

            <View style={styles.dialogActions}>
              {detail.actions.map((action) => (
                <HoverPressable
                  key={action.label}
                  disabled={action.disabled}
                  style={[
                    action.primary ? styles.primaryButton : styles.secondaryButton,
                    action.disabled && styles.disabled,
                  ]}
                  hoverStyle={action.primary ? styles.primaryButtonHover : styles.secondaryButtonHover}
                  onPress={() => runAction(action)}
                >
                  <DText weight="semiBold" style={action.primary ? styles.primaryButtonText : styles.secondaryButtonText}>
                    {action.label}
                  </DText>
                </HoverPressable>
              ))}
            </View>

            <ScrollView style={styles.dialogBody} contentContainerStyle={styles.dialogBodyContent}>
              {detail.groups.map((group) => (
                <View key={group.title}>
                  <DText weight="bold" style={styles.groupTitle}>{group.title}</DText>
                  <View style={styles.group}>
                    {group.rows.map((row, i) => (
                      <View key={row.label} style={[styles.groupRow, i === group.rows.length - 1 && styles.groupRowLast]}>
                        <DText style={styles.groupLabel}>{row.label}</DText>
                        {row.ltr ? (
                          <DLtrText weight="semiBold" style={styles.groupValue}>{row.value}</DLtrText>
                        ) : (
                          <DText
                            weight="semiBold"
                            style={[
                              styles.groupValue,
                              row.tone && row.tone !== 'neutral' && { color: DESKTOP_TONES[row.tone].fg },
                            ]}
                          >
                            {row.value}
                          </DText>
                        )}
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
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

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <HoverPressable
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <DText weight="bold" style={[styles.tabText, active && styles.tabTextActive]}>{label}</DText>
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
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingTop: 18, paddingHorizontal: 22, paddingBottom: 32, width: '100%', maxWidth: 1440, alignSelf: 'center' },
  flexShrink: { flexShrink: 1 },

  toolbar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 16,
  },
  tabs: { flexDirection: 'row-reverse', alignItems: 'center', gap: 20 },
  tab: { paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: DESKTOP_COLORS.brand },
  tabText: { fontSize: 13, color: DESKTOP_COLORS.inkFaint },
  tabTextActive: { color: DESKTOP_COLORS.ink },

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
  disabled: { opacity: 0.45 },

  filters: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
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
  archiveLink: { marginRight: 'auto' },
  linkText: { fontSize: 12, color: DESKTOP_COLORS.brand },

  kpis: { flexDirection: 'row-reverse', gap: 10, marginBottom: 18 },
  kpi: {
    flex: 1,
    minWidth: 180,
    flexDirection: 'row-reverse',
    alignItems: 'baseline',
    gap: 8,
    backgroundColor: DESKTOP_COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  kpiValue: { fontSize: 19 },
  kpiLabel: { fontSize: 12, color: DESKTOP_COLORS.inkFaint },

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
  },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
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
  avatarText: { color: '#fff', fontSize: 11, textAlign: 'center' },
  vehicleIcon: { backgroundColor: '#F1F4F7' },

  overlay: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: DESKTOP_COLORS.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  dialog: {
    width: 460,
    maxWidth: '92%',
    maxHeight: '80%',
    backgroundColor: DESKTOP_COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    overflow: 'hidden',
    ...webOnly({ boxShadow: '0 16px 40px rgba(16,34,50,0.24)' }),
  },
  dialogHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.border,
  },
  dialogIdentity: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexShrink: 1 },
  dialogAvatar: { width: 36, height: 36, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  dialogAvatarText: { color: '#fff', fontSize: 14, textAlign: 'center' },
  dialogTitle: { fontSize: 14.5 },
  dialogSubtitle: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint },
  closeButton: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogActions: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.border,
  },
  dialogBody: { flexGrow: 0 },
  dialogBodyContent: { paddingHorizontal: 18, paddingVertical: 14, gap: 12 },
  groupTitle: { fontSize: 11, color: DESKTOP_COLORS.inkFaint, letterSpacing: 0.2, marginBottom: 6 },
  group: { borderWidth: 1, borderColor: DESKTOP_COLORS.borderSoft, borderRadius: 6, overflow: 'hidden' },
  groupRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F4F6',
  },
  groupRowLast: { borderBottomWidth: 0 },
  groupLabel: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint },
  groupValue: { fontSize: 12.5 },
});
