// תיק רכב - תצוגת מחשב
import React, { useEffect, useRef, useState } from 'react';
import { FocusTarget } from '../ui/FocusTarget';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  AcquisitionType,
  ComplianceItem,
  Vehicle,
  VehicleDriverWithProfile,
  VehicleStatus,
  VehicleType,
} from '../../lib/adminApi';
import { ComplianceSection } from '../ComplianceSection';
import { TrafficReportsPanel } from './TrafficReportsCenter';
import { VehicleDriversEditor } from '../VehicleDriversEditor';
import { SAFETY_FOLDER, VehicleInspectionsDesktopSection } from '../inspection/VehicleInspectionsDesktopSection';
import { VehicleServiceFolderRow } from '../service/VehicleServiceRecords';
import { HeaderMenuBackdrop, headerMenuEnter, headerMenuStyles, useHeaderMenu } from './headerMenu';
import {
  ACQUISITION_TYPE_LABELS,
  VEHICLE_ACCESSORY_LABELS,
  VEHICLE_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  complianceBadgeState,
  findComplianceDef,
} from '../../lib/compliance';
import { ExpiryState, expiryState, formatDate } from '../../lib/theme';
import { formatPlate } from '../../lib/plate';
import { MAX_KM, deriveNextServiceKm, nextServiceKmOf } from '../../lib/serviceSchedule';
import { vehicleFolderByKey } from '../../lib/vehicleFolderAlerts';
import { requiresTachograph } from '../../lib/tachograph';
import { lookupVehicleRegistry } from '../../lib/vehicleRegistry';
import { cleanRegistryDetails, REGISTRY_DETAIL_FIELDS, registryChanges, registryPatch, type RegistryChange } from '../../lib/vehicleRegistryFields';
import { DesktopModal } from './DesktopModal';
import { errorMessage } from '../../lib/requestError';
import { BrandLoader } from '../ui/BrandLoader';
import { ISRAEL_COMMON_MANUFACTURERS } from '../../lib/manufacturers';
import {
  DesktopSelectOption,
  DLtrText,
  supportsFinePointerHoverMotion,
  DText,
  HoverPressable,
  prefersReducedMotion,
  StatusPill,
} from './primitives';
import {
  DocumentFolderUploadModal,
  EASE_OUT,
  OverflowMenu,
  StatusPicker,
  useOwnerDocuments,
} from './record/RecordKit';
import { expiryStatusText, FolderListRow, folderStatus } from './record/FolderDocuments';
import { DetailRow, Fact, FieldEditDialog, GroupLabel, NIGHT_TONES, digitsOnly, pageStyles, type FieldEditor, type TextFieldEditor } from './record/RecordPage';
import { DESKTOP_COLORS, DESKTOP_TONES, DesktopTone, webOnly } from './desktopTheme';
import { VehicleDriverHistoryButton } from './driver/DriverVehicleHistory';
import { t, dirIcon, fixedLayoutProps, FIXED_LAYOUT_STYLE } from '../../lib/i18n';

// מצבי הרכב שאפשר לבחור
/** Statuses an admin can pick from the header pill; archiving has its own action. */
const STATUS_OPTIONS: { value: VehicleStatus; label: string; tone: DesktopTone }[] = [
  { value: 'active', label: VEHICLE_STATUS_LABELS.active, tone: 'ok' },
  { value: 'maintenance', label: VEHICLE_STATUS_LABELS.maintenance, tone: 'warn' },
  { value: 'disabled', label: VEHICLE_STATUS_LABELS.disabled, tone: 'neutral' },
];

/**
 * Desktop body of the vehicle card ("תיק רכב"), laid out for a calm,
 * readable page an office admin can use without training:
 *
 * 1. A compact header — status, name, the three numbers people ask about
 *    (odometer, distance to service, drivers) and the licence plate.
 * 2. One amber notice listing every folder that expired or expires soon.
 * 3. The vehicle's details as tappable rows (each opens a small edit window),
 *    next to the maintenance card; then company usage next to the drivers.
 *    Rows of the two columns line up.
 * 4. Every document folder as a list row with its status, grouped into
 *    "רישוי וביטוח" (compliance items) and "בדיקות ובטיחות" (document folders).
 *
 * Each value appears once: licence/insurance status lives only in the
 * documents list; the plate lookup lives only in the edit form. The phone
 * keeps its own tabbed flow in VehicleDetailScreen.
 */

// Kept only so this component's props stay compatible with the shared
// VehicleDetailScreen (the phone app still tab-switches between these).
export type VehicleTab = 'general' | 'drivers' | 'documents' | 'maintenance' | 'licensing';

export type VehicleDocumentFolder = {
  category: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  requiresExpiry: boolean;
};

// סוגי הרכב לבחירה
const VEHICLE_TYPE_OPTIONS = (): DesktopSelectOption<VehicleType>[] => Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => ({
  value: value as VehicleType,
  label,
}));

// סוגי הרכישה לבחירה
const ACQUISITION_TYPE_OPTIONS = (): DesktopSelectOption<AcquisitionType>[] => Object.entries(ACQUISITION_TYPE_LABELS).map(([value, label]) => ({
  value: value as AcquisitionType,
  label,
}));

// פריטים שיכולים להציג אזהרה
/** Compliance items that can raise the attention notice. */
const ALERT_COMPLIANCE_TYPES = [
  { itemType: 'vehicle_license', get label() { return t('folder.vehicleLicense'); } },
  { itemType: 'operating_license', get label() { return t('folder.operatingLicense'); } },
  { itemType: 'insurance_mandatory', get label() { return t('folder.mandatoryInsurance'); } },
  { itemType: 'insurance_comprehensive', get label() { return t('folder.comprehensiveInsurance'); } },
  { itemType: 'engineer_report', get label() { return t('folder.engineerReport'); } },
];

// מספר ק"מ מעוצב
const km = (n: number) => n.toLocaleString();

// לוחית הרישוי הגדולה
/**
 * The Israeli licence plate, large, sitting on the page's own surface colour.
 * It rests slightly tilted and straightens to face the viewer on hover.
 * Touch screens and reduced-motion users get it flat and still.
 */
function LicensePlate({ plate }: { plate: string }) {
  const [tiltable] = useState(supportsFinePointerHoverMotion);
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      style={styles.plateWrap}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessible={false}
      focusable={false}
    >
      <View
        {...fixedLayoutProps}
        style={[styles.plate, FIXED_LAYOUT_STYLE, tiltable && (hovered ? styles.plateFlat : styles.plateTilted)]}
        accessibilityRole="image"
        accessibilityLabel={t('vehicle.numberLabel', { plate })}
      >
        <View style={styles.plateBand}>
          <View style={styles.plateFlag}>
            <View style={styles.plateFlagStripe} />
            <View style={styles.plateFlagStar} />
            <View style={styles.plateFlagStripe} />
          </View>
          <DText weight="extraBold" style={styles.plateBandText}>IL</DText>
        </View>
        <DLtrText weight="extraBold" style={styles.plateText} numberOfLines={1}>{plate}</DLtrText>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

// התיק: כותרת, פרטים, תחזוקה, נהגים, מסמכים ובדיקות
export function VehicleDetailDesktopView({
  vehicle,
  department,
  compliance,
  companyId,
  vehicleId,
  drivers,
  driverOptions,
  documentFolders,
  focusItem,
  onDriversChanged,
  onOpenDriver,
  onArchive,
  onRestore,
  onDelete,
  departmentOptions,
  onSaveField,
  openFolder,
  onFolderOpened,
  openDrivers,
  onDriversOpened,
}: {
  vehicle: Vehicle;
  department: string | null;
  compliance: ComplianceItem[];
  companyId: string;
  vehicleId: string;
  drivers: VehicleDriverWithProfile[];
  driverOptions: { value: string; label: string }[];
  documentFolders: readonly VehicleDocumentFolder[];
  focusItem: string | null;
  onDriversChanged: () => void | Promise<void>;
  onOpenDriver: (driverId: string) => void;
  /** Phone-only navigation into a folder screen; the desktop opens folders in place. */
  onOpenDocumentFolder?: (folder: VehicleDocumentFolder) => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  departmentOptions: { value: string; label: string }[];
  onSaveField: (patch: Partial<Vehicle>) => Promise<string | null>;
  /** A folder key (lib/vehicleFolderAlerts.ts) to open once, e.g. when arriving from an expiry notification. */
  openFolder?: string | null;
  onFolderOpened?: () => void;
  /** Open the assigned-drivers dialog once, e.g. when arriving from "needs attention". */
  openDrivers?: boolean;
  onDriversOpened?: () => void;
}) {
  const name = [vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') || formatPlate(vehicle.plate_number);
  const isArchived = vehicle.status === 'archived';

  // Service schedule
  const nextServiceKm = nextServiceKmOf(vehicle);
  const serviceRemaining = nextServiceKm == null ? null : nextServiceKm - vehicle.odometer;
  const serviceState: ExpiryState = serviceRemaining == null ? 'missing' : serviceRemaining <= 0 ? 'expired' : serviceRemaining <= 1000 ? 'soon' : 'ok';
  const serviceColor = serviceState === 'expired' ? DESKTOP_TONES.bad.fg : serviceState === 'soon' ? DESKTOP_TONES.warn.fg : DESKTOP_COLORS.brand;
  const serviceSpan = vehicle.service_interval_km && vehicle.service_interval_km > 0
    ? vehicle.service_interval_km
    : nextServiceKm != null && nextServiceKm > vehicle.last_service_km ? nextServiceKm - vehicle.last_service_km : null;
  const serviceUsed = Math.max(0, vehicle.odometer - vehicle.last_service_km);
  const servicePct = serviceSpan ? Math.min(100, (serviceUsed / serviceSpan) * 100) : 0;
  const derivedNextServiceKm = deriveNextServiceKm(vehicle.last_service_km, vehicle.service_interval_km);

  // Documents
  const { docs: folderDocs, loaded: folderDocsLoaded, reload: reloadFolderDocs } = useOwnerDocuments('vehicle', vehicleId);
  const [folderRequest, setFolderRequest] = useState<{ itemType: string; nonce: number } | null>(null);
  const openComplianceFolder = (itemType: string) => setFolderRequest((prev) => ({ itemType, nonce: (prev?.nonce ?? 0) + 1 }));
  const [openDocumentFolder, setOpenDocumentFolder] = useState<VehicleDocumentFolder | null>(null);

  useEffect(() => {
    if (!openFolder) return;
    const folder = vehicleFolderByKey(openFolder);
    if (folder?.folderKey === 'tachograph_calibration' && !requiresTachograph(vehicle.vehicle_type)) {
      onFolderOpened?.();
      return;
    }
    if (folder?.source === 'compliance') openComplianceFolder(folder.folderKey);
    else {
      // A fixed document folder, or one the owner added (its key is its category).
      const documentFolder = documentFolders.find((f) => f.category === (folder?.folderKey ?? openFolder));
      // The owner's folders arrive a moment later: wait for them.
      if (!folder && !documentFolder) return;
      if (documentFolder) setOpenDocumentFolder(documentFolder);
    }
    onFolderOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFolder, onFolderOpened, documentFolders.length]);

  const safetyFolder = documentFolders.find((f) => f.category === SAFETY_FOLDER);
  const otherFolders = documentFolders.filter((f) => f.category !== SAFETY_FOLDER);

  // Attention notice: expired or soon-expiring compliance items and document folders.
  type Alert = { key: string; label: string; state: ExpiryState; date: string | null; open: () => void };
  const alerts: Alert[] = [];
  for (const { itemType, label } of ALERT_COMPLIANCE_TYPES) {
    const def = findComplianceDef('vehicle', itemType);
    const item = compliance.find((c) => c.item_type === itemType) ?? null;
    const state = def ? complianceBadgeState(def, item) : expiryState(item?.expiry_date);
    if (state === 'expired' || state === 'soon') alerts.push({ key: itemType, label, state, date: item?.expiry_date ?? null, open: () => openComplianceFolder(itemType) });
  }
  // The safety folder's date is the next inspection (its own row), not an uploaded file's.
  for (const folder of otherFolders) {
    const status = folderStatus(folderDocs.filter((d) => d.category === folder.category));
    if (status.state === 'expired' || status.state === 'soon') alerts.push({ key: folder.category, label: folder.title, state: status.state, date: status.expiry, open: () => setOpenDocumentFolder(folder) });
  }
  alerts.sort((a, b) => (a.state === b.state ? 0 : a.state === 'expired' ? -1 : 1));

  // Editing
  const [editor, setEditor] = useState<FieldEditor | null>(null);
  const driversMenu = useHeaderMenu('vehicle-drivers');
  const accessoriesMenu = useHeaderMenu('vehicle-accessories');
  useEffect(() => {
    if (!openDrivers) return;
    driversMenu.setOpen(true);
    onDriversOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDrivers]);

  const manufacturerOptions: DesktopSelectOption<string>[] = React.useMemo(() => {
    const names = ISRAEL_COMMON_MANUFACTURERS.map((m) => m.he);
    if (vehicle.manufacturer && !names.includes(vehicle.manufacturer)) names.push(vehicle.manufacturer);
    return names.sort((a, b) => a.localeCompare(b, 'he')).map((he) => ({ value: he, label: he }));
  }, [vehicle.manufacturer]);

  const kmEditor = (label: string, raw: number | null, onSave: (value: number | null) => Promise<string | null>, hint?: string): TextFieldEditor => ({
    kind: 'text',
    label,
    raw: raw ? String(raw) : '',
    ltr: true,
    numeric: true,
    hint,
    parse: digitsOnly,
    format: (v) => (v ? Number(v).toLocaleString() : ''),
    onSave: (v) => (Number(v) > MAX_KM ? Promise.resolve(t('vehicle.kmOutOfRange')) : onSave(v ? Number(v) : null)),
  });

  const productionLabel = vehicle.production_year ? `${vehicle.production_month ? `${String(vehicle.production_month).padStart(2, '0')}/` : ''}${vehicle.production_year}` : null;
  const subParts = [
    VEHICLE_TYPE_LABELS[vehicle.vehicle_type] ?? vehicle.vehicle_type,
    department,
    vehicle.production_year ? t('vehicle.yearLabel', { production_year: vehicle.production_year }) : null,
    vehicle.color,
  ].filter(Boolean) as string[];

  const menuItems = [
    ...(isArchived ? [] : [{ label: t('common.moveToArchive'), icon: 'archive-outline' as const, onPress: onArchive }]),
    { label: t('vehicle.delete'), icon: 'trash-outline' as const, onPress: onDelete, danger: true },
  ];

  const reduceMotion = prefersReducedMotion();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={[styles.hero, styles.heroNight, !reduceMotion && styles.enter]}>
        <View style={[styles.heroGlow, styles.heroGlowBlue, { pointerEvents: 'none' }]} />
        <View style={[styles.heroGlow, styles.heroGlowCyan, { pointerEvents: 'none' }]} />
        <View style={styles.heroIdentity}>
          <View style={styles.heroStatusRow}>
            {isArchived ? (
              <View style={styles.pillOnDark}><StatusPill tone="neutral" label={VEHICLE_STATUS_LABELS.archived} /></View>
            ) : (
              <StatusPicker value={vehicle.status} options={STATUS_OPTIONS} onChange={(status) => onSaveField({ status })} />
            )}
            <OverflowMenu items={menuItems} />
          </View>
          <DText weight="bold" style={[styles.heroName, styles.heroNameOnDark]} numberOfLines={1}>{name}</DText>
          <View style={styles.heroSub}>
            {subParts.map((part, index) => (
              <React.Fragment key={`${part}-${index}`}>
                {index > 0 && <DText style={[styles.heroSubDot, styles.heroSubDotOnDark]}>·</DText>}
                <DText style={[styles.heroSubText, styles.heroSubTextOnDark]}>{part}</DText>
              </React.Fragment>
            ))}
          </View>
        </View>

        <View style={styles.facts}>
          <Fact onDark label={t('vehicle.odometer')} value={km(vehicle.odometer)} unit={t('unit.km')} />
          <Fact
            onDark
            label={t('vehicle.nextServiceIn')}
            value={serviceRemaining == null ? t('common.notSet') : serviceRemaining <= 0 ? t('vehicle.overBy', { v1: km(Math.abs(serviceRemaining)) }) : km(serviceRemaining)}
            unit={serviceRemaining == null ? undefined : t('unit.km')}
            color={serviceState === 'expired' ? NIGHT_TONES.bad : serviceState === 'soon' ? NIGHT_TONES.warn : undefined}
            muted={serviceRemaining == null}
          />
          <Fact onDark label={t('vehicle.assignedDrivers')} value={String(drivers.length)} />
        </View>

        <LicensePlate plate={formatPlate(vehicle.plate_number)} />
        <RegistryRefreshAction vehicle={vehicle} onSaveField={onSaveField} />
      </View>

      {isArchived && (
        <View style={styles.archivedBanner}>
          <Ionicons name="archive-outline" size={18} color={DESKTOP_COLORS.inkMuted} />
          <View style={styles.flex}>
            <DText weight="bold" style={styles.archivedTitle}>{t('vehicle.inArchive')}</DText>
            <DText style={styles.archivedText}>{t('vehicle.inArchiveDetail')}</DText>
          </View>
          <HoverPressable style={styles.softBtn} hoverStyle={styles.softBtnHover} pressStyle={styles.pressDown} onPress={onRestore}>
            <Ionicons name="arrow-undo-outline" size={16} color={DESKTOP_COLORS.brand} />
            <DText weight="semiBold" style={styles.softBtnText}>{t('common.restoreFromArchive')}</DText>
          </HoverPressable>
        </View>
      )}

      {/* Attention notice */}
      {!isArchived && alerts.length > 0 && (
        <View style={[styles.attention, !reduceMotion && styles.enter]}>
          <Ionicons name="warning-outline" size={18} color={DESKTOP_TONES.warn.fg} style={styles.attentionIcon} />
          <View style={styles.flex}>
            <DText weight="bold" style={styles.attentionTitle}>
              {alerts.length === 1 ? t('documents.oneNeedsAttention') : t('documents.needAttentionCount', { length: alerts.length })}
            </DText>
            {alerts.map((alert) => (
              <View key={alert.key} style={styles.attentionRow}>
                <View style={styles.attentionTag}>
                  <DText weight="bold" style={[styles.attentionTagText, { color: alert.state === 'expired' ? DESKTOP_TONES.bad.fg : DESKTOP_TONES.warn.fg }]}>
                    {expiryStatusText(alert.state, alert.date)}
                  </DText>
                </View>
                <DText style={styles.attentionText}>{alert.label}</DText>
                {!!alert.date && (
                  <>
                    <DText style={styles.attentionText}>{alert.state === 'expired' ? t('documents.sinceComma') : t('documents.untilComma')}</DText>
                    <DLtrText style={styles.attentionText}>{formatDate(alert.date)}</DLtrText>
                  </>
                )}
                <HoverPressable style={styles.linkBtn} hoverStyle={styles.softBtnHover} onPress={alert.open} accessibilityLabel={t('common.openLabel', { label: alert.label })}>
                  <DText weight="semiBold" style={styles.linkText}>{t('common.open')}</DText>
                  <Ionicons name={dirIcon('chevron-back')} size={14} color={DESKTOP_COLORS.brand} />
                </HoverPressable>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Details + maintenance, then usage + drivers — two rows whose cells line up */}
      <View style={styles.gridRow}>
        <View style={styles.mainCell}>
          <GroupLabel>{t('vehicle.vehicle')}</GroupLabel>
          <View style={styles.card}>
            <DetailRow
              first
              label={t('vehicle.plateNumber')}
              value={formatPlate(vehicle.plate_number)}
              ltr
              edit={{
                kind: 'text',
                label: t('vehicle.plateNumber'),
                raw: vehicle.plate_number,
                ltr: true,
                numeric: true,
                hint: t('vehicle.plateHint'),
                parse: (v) => digitsOnly(v).slice(0, 8),
                format: formatPlate,
                validate: (v) => (/^\d{7,8}$/.test(v) ? null : t('vehicle.plateInvalid')),
                onSave: (v) => onSaveField({ plate_number: v }),
              }}
            />
            <DetailRow label={t('vehicle.manufacturer')} value={vehicle.manufacturer} onPress={() => setEditor({ kind: 'select', label: t('vehicle.manufacturer'), raw: vehicle.manufacturer, options: manufacturerOptions, allowClear: true, placeholder: t('vehicle.chooseManufacturer'), onSave: (v) => onSaveField({ manufacturer: v }) })} />
            <DetailRow label={t('vehicle.model')} value={vehicle.model} edit={{ kind: 'text', label: t('vehicle.model'), raw: vehicle.model ?? '', onSave: (v) => onSaveField({ model: v.trim() || null }) }} />
            <DetailRow label={t('vehicle.typeLabel')} value={VEHICLE_TYPE_LABELS[vehicle.vehicle_type] ?? vehicle.vehicle_type} onPress={() => setEditor({ kind: 'select', label: t('vehicle.typeLabel'), raw: vehicle.vehicle_type, options: VEHICLE_TYPE_OPTIONS(), onSave: (v) => onSaveField({ vehicle_type: (v ?? vehicle.vehicle_type) as VehicleType }) })} />
            <DetailRow
              label={t('vehicle.productionYear')}
              value={productionLabel}
              ltr
              onPress={() => setEditor({
                kind: 'monthYear',
                label: t('vehicle.productionYear'),
                month: vehicle.production_month ? String(vehicle.production_month) : '',
                year: vehicle.production_year ? String(vehicle.production_year) : '',
                onSave: (month, year) => onSaveField({ production_month: month ? Number(month) : null, production_year: year ? Number(year) : null }),
              })}
            />
            <DetailRow label={t('vehicle.color')} value={vehicle.color} edit={{ kind: 'text', label: t('vehicle.color'), raw: vehicle.color ?? '', onSave: (v) => onSaveField({ color: v.trim() || null }) }} />
            <DetailRow label={t('vehicle.onRoadDate')} value={vehicle.road_registration_date ? formatDate(vehicle.road_registration_date) : null} ltr onPress={() => setEditor({ kind: 'date', label: t('vehicle.onRoadDate'), raw: vehicle.road_registration_date, onSave: (v) => onSaveField({ road_registration_date: v }) })} />
            <DetailRow
              label={t('vehicle.vin')}
              value={vehicle.vin}
              ltr
              edit={{
                kind: 'text',
                label: t('vehicle.vin'),
                raw: vehicle.vin ?? '',
                ltr: true,
                hint: t('vehicle.vinHint'),
                parse: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17),
                validate: (v) => (!v || /^[A-HJ-NPR-Z0-9]{17}$/.test(v) ? null : t('vehicle.vinInvalid')),
                onSave: (v) => onSaveField({ vin: v || null }),
              }}
            />
          </View>
        </View>

        <View style={[styles.sideCell, driversMenu.open && headerMenuStyles.wrapOpen]}>
          {driversMenu.open && <HeaderMenuBackdrop onClose={driversMenu.close} />}
          <GroupLabel>{t('vehicle.maintenance')}</GroupLabel>
          <FocusTarget id="odometer,service" radius={8} tint={DESKTOP_COLORS.brand}>
          <View style={[styles.card, styles.maintCard]}>
            <View style={styles.maintTop}>
              <View style={styles.odoRow}>
                <DLtrText weight="bold" style={styles.odoValue}>{km(vehicle.odometer)}</DLtrText>
                <DText style={styles.odoUnit}>{t('unit.km')}</DText>
              </View>
              <View style={styles.inlineMeta}>
                <DText style={styles.mutedText}>{vehicle.odometer_updated_at ? t('vehicle.odometerUpdatedOn') : t('vehicle.odometerNotUpdated')}</DText>
                {!!vehicle.odometer_updated_at && <DLtrText style={styles.mutedText}>{formatDate(vehicle.odometer_updated_at)}</DLtrText>}
              </View>

              {serviceSpan == null && (
                <View style={styles.serviceHint}>
                  <Ionicons name="construct-outline" size={16} color={DESKTOP_COLORS.inkMuted} style={styles.serviceHintIcon} />
                  <DText style={[styles.mutedText, styles.flex]}>
                    {t('vehicle.serviceExplainer')}
                  </DText>
                </View>
              )}
              {serviceSpan != null && (
                <View style={styles.progressBlock}>
                  <View style={styles.progressLabels}>
                    <DText style={styles.mutedText}>{t('vehicle.sinceLastService')}</DText>
                    <DText weight="semiBold" style={styles.progressValue}>{km(serviceUsed)} {t('common.of')} {km(serviceSpan)}</DText>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { backgroundColor: serviceColor, transform: [{ scaleX: servicePct / 100 }] }, !reduceMotion && styles.progressFillEnter]} />
                  </View>
                  {serviceRemaining != null && (
                    <DText style={[styles.mutedText, serviceState !== 'ok' && { color: serviceColor }]}>
                      {serviceRemaining <= 0 ? t('vehicle.overServiceKm', { v1: km(Math.abs(serviceRemaining)) }) : t('vehicle.kmToService', { serviceRemaining: km(serviceRemaining) })}
                    </DText>
                  )}
                </View>
              )}
            </View>

            <View style={styles.maintRows}>
              <DetailRow
                first
                compact
                label={t('vehicle.atLastService')}
                // 0 is what a new vehicle starts with: nothing was entered yet.
                value={vehicle.last_service_km ? t('unit.kmValue', { v1: km(vehicle.last_service_km) }) : null}
                edit={kmEditor(t('vehicle.kmAtLastService'), vehicle.last_service_km, (value) => {
                  const last = value ?? 0;
                  const next = deriveNextServiceKm(last, vehicle.service_interval_km);
                  return onSaveField(next != null ? { last_service_km: last, next_service_km: next } : { last_service_km: last });
                }, t('vehicle.kmAtLastServiceHint'))}
              />
              <DetailRow
                compact
                label={t('vehicle.serviceEvery')}
                value={vehicle.service_interval_km ? t('unit.kmValue', { v1: km(vehicle.service_interval_km) }) : null}
                edit={kmEditor(t('vehicle.serviceInterval'), vehicle.service_interval_km, (interval) => {
                  const next = deriveNextServiceKm(vehicle.last_service_km, interval);
                  return onSaveField(next != null ? { service_interval_km: interval, next_service_km: next } : { service_interval_km: interval });
                }, t('vehicle.serviceIntervalHint'))}
              />
              <DetailRow
                compact
                label={t('vehicle.nextServiceAt')}
                value={nextServiceKm != null ? t('unit.kmNext', { nextServiceKm: km(nextServiceKm) }) : null}
                edit={derivedNextServiceKm != null ? undefined : kmEditor(t('vehicle.kmToNextService'), vehicle.next_service_km, (v) => onSaveField({ next_service_km: v }))}
              />
            </View>

            <HoverPressable
              style={[styles.primaryBtn, styles.maintButton]}
              hoverStyle={styles.primaryBtnHover}
              pressStyle={styles.pressDown}
              onPress={() => setEditor(kmEditor(t('vehicle.currentOdometer'), vehicle.odometer, (v) => onSaveField({ odometer: v ?? 0 }), t('vehicle.currentOdometerHint')))}
            >
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <DText weight="semiBold" style={styles.primaryBtnText}>{t('vehicle.updateOdometer')}</DText>
            </HoverPressable>
          </View>
          </FocusTarget>
        </View>
      </View>

      <View style={[styles.gridRow, (accessoriesMenu.open || driversMenu.open) && headerMenuStyles.wrapOpen]}>
        <View style={[styles.mainCell, accessoriesMenu.open && headerMenuStyles.wrapOpen]}>
          <GroupLabel>{t('vehicle.companyUse')}</GroupLabel>
          <View style={styles.card}>
            <DetailRow first label={t('common.department')} value={department} onPress={() => setEditor({ kind: 'select', label: t('common.department'), raw: vehicle.department_id, options: departmentOptions, allowClear: true, placeholder: t('common.noDepartment'), onSave: (v) => onSaveField({ department_id: v }) })} />
            <DetailRow label={t('vehicle.purpose')} value={vehicle.usage_type} edit={{ kind: 'text', label: t('vehicle.purpose'), raw: vehicle.usage_type ?? '', onSave: (v) => onSaveField({ usage_type: v.trim() || null }) }} />
            <DetailRow
              label={t('vehicle.dealType')}
              value={vehicle.acquisition_type ? ACQUISITION_TYPE_LABELS[vehicle.acquisition_type] ?? vehicle.acquisition_type : null}
              onPress={() => setEditor({ kind: 'select', label: t('vehicle.dealType'), raw: vehicle.acquisition_type, options: ACQUISITION_TYPE_OPTIONS(), allowClear: true, placeholder: t('common.notSelected'), onSave: (v) => onSaveField({ acquisition_type: v as AcquisitionType | null }) })}
            />
            <DetailRow label={t('vehicle.internalCode')} value={vehicle.internal_code} ltr edit={{ kind: 'text', label: t('vehicle.internalCode'), raw: vehicle.internal_code ?? '', ltr: true, onSave: (v) => onSaveField({ internal_code: v.trim() || null }) }} />
            <DetailRow
              label={t('vehicle.accessories')}
              value={(vehicle.accessories ?? []).map((key) => VEHICLE_ACCESSORY_LABELS[key] ?? key).join(', ') || null}
              onPress={accessoriesMenu.toggle}
            />
          </View>
          {/* Outside the card: the card clips its overflow. Opens right under the last row. */}
          {accessoriesMenu.open && <AccessoriesMenu selected={vehicle.accessories ?? []} onSave={(accessories) => onSaveField({ accessories })} onClose={accessoriesMenu.close} />}
        </View>

        <View style={styles.sideCell}>
          <GroupLabel
            action={
              <View style={styles.driversActions}>
                <VehicleDriverHistoryButton vehicleId={vehicleId} refreshKey={drivers.map((d) => d.id).join(',')} />
                <HoverPressable style={styles.linkBtn} hoverStyle={styles.softBtnHover} onPress={driversMenu.toggle} accessibilityLabel={t('vehicle.changeAssignedDrivers')}>
                  <DText weight="semiBold" style={styles.linkText}>{t('common.change')}</DText>
                </HoverPressable>
              </View>
            }
          >
            {t('vehicle.assignedDrivers')}
          </GroupLabel>
          <View style={[styles.card, styles.driversCard]}>
            {drivers.length === 0 ? (
              <View style={styles.driversEmpty}>
                <DText style={styles.mutedText}>{t('vehicle.noAssignedDrivers')}</DText>
                <HoverPressable style={styles.softBtn} hoverStyle={styles.softBtnHover} pressStyle={styles.pressDown} onPress={driversMenu.toggle}>
                  <Ionicons name="person-add-outline" size={16} color={DESKTOP_COLORS.brand} />
                  <DText weight="semiBold" style={styles.softBtnText}>{t('attention.assignDriver')}</DText>
                </HoverPressable>
              </View>
            ) : (
              drivers.map((driver, index) => <DriverRow key={driver.id} driver={driver} first={index === 0} onPress={() => onOpenDriver(driver.driver_id)} />)
            )}
          </View>
          {driversMenu.open && (
            <View style={[headerMenuStyles.menu, styles.driversMenu, headerMenuEnter()]} role="dialog" aria-label={t('vehicle.assignedDrivers')}>
              <View style={styles.driversModalContent}>
                <VehicleDriversEditor
                  vehicleId={vehicleId}
                  assignments={drivers}
                  driverOptions={driverOptions}
                  onChanged={onDriversChanged}
                  onOpenDriver={onOpenDriver}
                  desktop
                />
              </View>
            </View>
          )}
        </View>
      </View>

      <RegistryDetailsBlock vehicle={vehicle} onSaveField={onSaveField} setEditor={setEditor} />

      {/* Documents */}
      <View style={styles.docsHead}>
        <DText weight="bold" style={styles.docsTitle}>{t('documents.documentsAndExpiry')}</DText>
        <DText style={styles.mutedText}>{t('documents.clickToOpenUpload')}</DText>
      </View>
      <View style={styles.gridRow}>
        <View style={styles.halfCell}>
          <GroupLabel>{t('vehicle.licensingAndInsurance')}</GroupLabel>
          <View style={[styles.card, styles.listCard]}>
            <ComplianceSection
              companyId={companyId}
              ownerType="vehicle"
              ownerId={vehicleId}
              focusItemType={focusItem}
              openRequest={folderRequest}
              hiddenItemTypes={['annual_test']}
              desktopList
            />
          </View>
        </View>
        <View style={styles.halfCell}>
          <GroupLabel>{t('compliance.cat.inspection')}</GroupLabel>
          <View style={[styles.card, styles.listCard]}>
            {/* בדיקות קצין בטיחות: הבדיקות והמסמכים שלהן בתיקייה אחת */}
            <VehicleInspectionsDesktopSection
              companyId={companyId}
              vehicleId={vehicleId}
              archived={isArchived}
              first
              title={safetyFolder?.title}
              documents={folderDocs.filter((d) => d.category === SAFETY_FOLDER)}
            />
            {otherFolders.map((folder) => (
              <FolderListRow
                key={folder.category}
                title={folder.title}
                icon={folder.icon}
                docs={folderDocs.filter((d) => d.category === folder.category)}
                onPress={() => setOpenDocumentFolder(folder)}
                loading={!folderDocsLoaded}
              />
            ))}
            <VehicleServiceFolderRow companyId={companyId} vehicleId={vehicleId} />
          </View>
        </View>
      </View>

      {/* Traffic reports recorded on this vehicle; each lives in its driver's folder. */}
      <View style={styles.docsHead}>
        <DText weight="bold" style={styles.docsTitle}>{t('folder.trafficReports')}</DText>
        <DText style={styles.mutedText}>{t('trafficReport.vehicleHint')}</DText>
      </View>
      <TrafficReportsPanel vehicleId={vehicleId} />

      {openDocumentFolder && (
        <DocumentFolderUploadModal
          companyId={companyId}
          ownerType="vehicle"
          ownerId={vehicleId}
          folder={openDocumentFolder}
          docs={folderDocs}
          layout={openDocumentFolder.category === 'general' ? 'gallery' : 'versions'}
          onClose={() => setOpenDocumentFolder(null)}
          onChanged={reloadFolderDocs}
        />
      )}

      <FieldEditDialog editor={editor} onClose={() => setEditor(null)} />

    </ScrollView>
  );
}

// עדכון ממשרד התחבורה (הכפתור בכותרת)
/**
 * The header's "update from the Transport Ministry" action: pulls the registry
 * again and opens a window of what differs; only the fields the manager
 * leaves ticked are saved. A short result line shows under the button.
 */
function RegistryRefreshAction({ vehicle, onSaveField }: { vehicle: Vehicle; onSaveField: (patch: Partial<Vehicle>) => Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [review, setReview] = useState<RegistryChange[] | null>(null);

  const refresh = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const found = await lookupVehicleRegistry(vehicle.plate_number);
      if (!found) return setMessage(t('registry.notFound'));
      const changes = registryChanges(vehicle, found);
      if (!changes.length) return setMessage(t('registry.upToDate'));
      setReview(changes);
    } catch (err: any) {
      setMessage(errorMessage(err, t('vehicle.lookupUnavailable')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.heroAction}>
      <HoverPressable style={styles.heroActionBtn} hoverStyle={styles.heroActionBtnHover} pressStyle={styles.pressDown} onPress={() => void refresh()} disabled={busy} accessibilityLabel={t('registry.refresh')}>
        {busy ? <BrandLoader size="small" color="#FFFFFF" /> : <Ionicons name="sparkles" size={14} color="#FFFFFF" />}
        <DText weight="semiBold" style={styles.heroActionText}>{busy ? t('registry.refreshing') : t('registry.refresh')}</DText>
      </HoverPressable>
      {!!message && <DText style={styles.heroActionMessage}>{message}</DText>}
      {review && (
        <RegistryReviewDialog
          plate={formatPlate(vehicle.plate_number)}
          changes={review}
          onClose={() => setReview(null)}
          onApply={async (picked) => {
            const error = await onSaveField(registryPatch(vehicle, picked));
            if (!error) {
              setReview(null);
              setMessage(t('registry.refreshed'));
            }
            return error;
          }}
        />
      )}
    </View>
  );
}

// נתוני משרד התחבורה
/**
 * Everything the Transport Ministry registry added beyond the regular
 * fields, in two columns; each value edits in place and can be cleared. The
 * update button lives in the page header (RegistryRefreshAction).
 */
function RegistryDetailsBlock({
  vehicle,
  onSaveField,
  setEditor,
}: {
  vehicle: Vehicle;
  onSaveField: (patch: Partial<Vehicle>) => Promise<string | null>;
  setEditor: (editor: FieldEditor | null) => void;
}) {
  const details = cleanRegistryDetails(vehicle.registry_details);
  const fields = REGISTRY_DETAIL_FIELDS.filter((f) => f.key in details);
  const half = Math.ceil(fields.length / 2);

  const saveValue = (key: string, value: string | null) => {
    const next = { ...details };
    if (value && value.trim()) next[key] = value.trim();
    else delete next[key];
    return onSaveField({ registry_details: next });
  };

  const row = (f: (typeof fields)[number], first: boolean) =>
    f.kind === 'date' ? (
      <DetailRow
        key={f.key}
        first={first}
        label={f.label}
        value={formatDate(details[f.key])}
        ltr
        onPress={() => setEditor({ kind: 'date', label: f.label, raw: details[f.key] ?? null, onSave: (v) => saveValue(f.key, v) })}
      />
    ) : (
      <DetailRow
        key={f.key}
        first={first}
        label={f.label}
        value={f.kind === 'number' ? Number(details[f.key]).toLocaleString('he-IL') : details[f.key]}
        ltr={f.ltr || f.kind === 'number'}
        edit={{ kind: 'text', label: f.label, raw: details[f.key] ?? '', ltr: f.ltr || f.kind === 'number', numeric: f.kind === 'number', onSave: (v) => saveValue(f.key, v) }}
      />
    );

  return (
    <View style={styles.registryBlock}>
      <GroupLabel>{t('registry.title')}</GroupLabel>
      {fields.length === 0 ? (
        <View style={[styles.card, styles.registryEmpty]}>
          <DText style={styles.mutedText}>{t('registry.empty')}</DText>
        </View>
      ) : (
        <View style={styles.gridRow}>
          <View style={styles.halfCell}>
            <View style={styles.card}>{fields.slice(0, half).map((f, i) => row(f, i === 0))}</View>
          </View>
          {fields.length > 1 && (
            <View style={styles.halfCell}>
              <View style={styles.card}>{fields.slice(half).map((f, i) => row(f, i === 0))}</View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// חלון אישור: מה ישתנה מול משרד התחבורה, ומה לעדכן
function RegistryReviewDialog({ plate, changes, onClose, onApply }: { plate: string; changes: RegistryChange[]; onClose: () => void; onApply: (picked: RegistryChange[]) => Promise<string | null> }) {
  const [picked, setPicked] = useState(() => new Set(changes.map((c) => c.key)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (key: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const apply = async () => {
    setSaving(true);
    setError(null);
    const result = await onApply(changes.filter((c) => picked.has(c.key)));
    setSaving(false);
    if (result) setError(result);
  };

  return (
    <DesktopModal visible title={t('registry.reviewTitle', { plate })} onClose={onClose} maxWidth={720}>
      <View style={pageStyles.editBody}>
        <DText style={pageStyles.editHint}>{t('registry.reviewHint', { count: changes.length })}</DText>
        <View style={styles.reviewTable}>
          <View style={[styles.reviewRow, styles.reviewHead]}>
            <View style={styles.reviewCheck} />
            <DText weight="semiBold" style={[styles.reviewField, styles.reviewHeadText]}>{t('registry.colField')}</DText>
            <DText weight="semiBold" style={[styles.reviewValue, styles.reviewHeadText]}>{t('registry.colCard')}</DText>
            <DText weight="semiBold" style={[styles.reviewValue, styles.reviewHeadText]}>{t('registry.colMinistry')}</DText>
          </View>
          <ScrollView style={styles.reviewList}>
            {changes.map((c) => {
              const on = picked.has(c.key);
              return (
                <HoverPressable
                  key={c.key}
                  style={[styles.reviewRow, styles.rowDivider]}
                  hoverStyle={styles.rowHover}
                  onPress={() => toggle(c.key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${c.label}: ${c.current} → ${c.next}`}
                >
                  <View style={styles.reviewCheck}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkFaint} />
                  </View>
                  <DText weight="semiBold" style={styles.reviewField}>{c.label}</DText>
                  {c.ltr ? <DLtrText style={[styles.reviewValue, styles.mutedText]}>{c.current}</DLtrText> : <DText style={[styles.reviewValue, styles.mutedText]}>{c.current}</DText>}
                  {c.ltr
                    ? <DLtrText weight="semiBold" style={[styles.reviewValue, on && styles.reviewNext]}>{c.next}</DLtrText>
                    : <DText weight="semiBold" style={[styles.reviewValue, on && styles.reviewNext]}>{c.next}</DText>}
                </HoverPressable>
              );
            })}
          </ScrollView>
        </View>
        {!!error && <DText style={pageStyles.editError}>{error}</DText>}
        <View style={styles.reviewActions}>
          <HoverPressable
            style={[pageStyles.primaryBtn, pageStyles.editActionBtn, (saving || !picked.size) && pageStyles.disabled]}
            hoverStyle={pageStyles.primaryBtnHover}
            pressStyle={pageStyles.pressDown}
            onPress={() => void apply()}
            disabled={saving || !picked.size}
          >
            {saving && <BrandLoader size="small" color="#FFFFFF" />}
            <DText weight="semiBold" style={pageStyles.primaryBtnText}>{t('registry.apply', { count: picked.size })}</DText>
          </HoverPressable>
          <HoverPressable style={[pageStyles.plainBtn, pageStyles.editActionBtn]} hoverStyle={pageStyles.plainBtnHover} pressStyle={pageStyles.pressDown} onPress={onClose}>
            <DText weight="semiBold" style={pageStyles.plainBtnText}>{t('common.cancel')}</DText>
          </HoverPressable>
          <View style={styles.flex} />
          <HoverPressable style={styles.linkBtn} hoverStyle={styles.softBtnHover} onPress={() => setPicked(picked.size ? new Set() : new Set(changes.map((c) => c.key)))}>
            <DText weight="semiBold" style={styles.linkText}>{picked.size ? t('registry.clearPick') : t('registry.pickAll')}</DText>
          </HoverPressable>
        </View>
      </View>
    </DesktopModal>
  );
}

// שורת נהג ברכב
function DriverRow({ driver, first, onPress }: { driver: VehicleDriverWithProfile; first: boolean; onPress: () => void }) {
  const fullName = driver.full_name ?? t('common.unnamed');
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
  const license = driver.license_expiry ? expiryState(driver.license_expiry) : null;
  const licenseColor = license === 'expired' ? DESKTOP_TONES.bad.fg : license === 'soon' ? DESKTOP_TONES.warn.fg : DESKTOP_COLORS.inkMuted;

  return (
    <HoverPressable style={[styles.driverRow, !first && styles.rowDivider]} hoverStyle={styles.rowHover} onPress={onPress} accessibilityLabel={t('driver.openCard', { fullName })}>
      <View style={styles.avatar}>
        <DText weight="bold" style={styles.avatarText}>{initials}</DText>
      </View>
      <View style={styles.flex}>
        <DText weight="semiBold" style={styles.driverName} numberOfLines={1}>{fullName}</DText>
        {!!driver.phone && <DLtrText style={styles.mutedText}>{driver.phone}</DLtrText>}
        {license && (
          <View style={styles.inlineMeta}>
            <DText style={[styles.driverLicense, { color: licenseColor }]} weight={license === 'ok' ? 'regular' : 'semiBold'}>
              {license === 'expired' ? t('driver.licenseExpiredOn') : license === 'soon' ? t('driver.licenseExpiresOn') : t('driver.licenseValidUntil')}
            </DText>
            <DLtrText style={[styles.driverLicense, { color: licenseColor }]} weight={license === 'ok' ? 'regular' : 'semiBold'}>{formatDate(driver.license_expiry)}</DLtrText>
          </View>
        )}
      </View>
      <Ionicons name={dirIcon('chevron-back')} size={15} color={DESKTOP_COLORS.inkFaint} />
    </HoverPressable>
  );
}

// עיצוב תיק הרכב
// תפריט הציוד הנלווה: כל לחיצה מסמנת/מבטלת ונשמרת מיד
function AccessoriesMenu({ selected, onSave, onClose }: { selected: string[]; onSave: (accessories: string[]) => Promise<string | null>; onClose: () => void }) {
  // A click anywhere outside it closes it, so does Escape. Each check is already saved.
  // (A backdrop can't do this here: the page clips it and the card's own rows sit above it.)
  const ref = useRef<View>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onClick = (e: MouseEvent) => !(ref.current as unknown as HTMLElement | null)?.contains(e.target as Node) && onClose();
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick, true);
    };
  }, [onClose]);
  // Local copy so quick clicks build on each other instead of on the last saved value.
  const [picked, setPicked] = useState(selected);
  const toggle = (key: string) => {
    const next = picked.includes(key) ? picked.filter((k) => k !== key) : Object.keys(VEHICLE_ACCESSORY_LABELS).filter((k) => k === key || picked.includes(k));
    setPicked(next);
    // A failed save (the parent shows the error) drops the check again.
    void onSave(next).then((error) => error && setPicked(picked));
  };
  return (
    <View ref={ref} style={[headerMenuStyles.menu, styles.accessoriesMenu, headerMenuEnter()]} role="dialog" aria-label={t('vehicle.accessories')}>
      <View style={headerMenuStyles.head}>
        <DText style={headerMenuStyles.hint}>{t('vehicle.accessoriesHint')}</DText>
      </View>
      {Object.entries(VEHICLE_ACCESSORY_LABELS).map(([key, label]) => {
        const on = picked.includes(key);
        return (
          <HoverPressable
            key={key}
            style={styles.accessoryRow}
            hoverStyle={headerMenuStyles.rowHover}
            onPress={() => toggle(key)}
            accessibilityRole="checkbox"
            aria-checked={on}
            accessibilityLabel={label}
          >
            <Ionicons name={on ? 'checkbox' : 'square-outline'} size={19} color={on ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkFaint} />
            <DText weight={on ? 'semiBold' : 'regular'} style={styles.accessoryLabel}>{label}</DText>
          </HoverPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  registryBlock: { marginBottom: 4 },
  registryMessage: { marginBottom: 8, paddingHorizontal: 4 },
  registryEmpty: { padding: 16 },
  reviewTable: { borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 12, overflow: 'hidden' },
  reviewHead: { backgroundColor: DESKTOP_COLORS.surfaceMuted },
  reviewHeadText: { fontSize: 13, color: DESKTOP_COLORS.inkMuted },
  reviewList: { maxHeight: 420 },
  reviewRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 46, paddingHorizontal: 14, paddingVertical: 8 },
  reviewCheck: { width: 22, alignItems: 'center' },
  reviewField: { flex: 1.2, fontSize: 14, color: DESKTOP_COLORS.ink },
  reviewValue: { flex: 1, fontSize: 14, color: DESKTOP_COLORS.ink, textAlign: 'right' },
  reviewNext: { color: DESKTOP_COLORS.brand },
  reviewActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginTop: 4 },
  ...pageStyles,

  // כפתור 'עדכון ממשרד התחבורה' בכותרת, באותו זכוכית כמו מסגרת הלוחית
  heroAction: { alignItems: 'center', gap: 6, maxWidth: 220 },
  heroActionBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  heroActionBtnHover: { backgroundColor: 'rgba(255,255,255,0.16)' },
  heroActionText: { fontSize: 13.5, color: '#FFFFFF' },
  heroActionMessage: { fontSize: 12.5, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  plateWrap: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  // לוחית הרישוי
  plate: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 52,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: '#16222E',
    overflow: 'hidden',
    backgroundColor: '#F7C600',
    ...webOnly({
      backgroundImage: 'linear-gradient(180deg, #FFD83A 0%, #F7C600 55%, #EDB900 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -2px 0 rgba(0,0,0,0.08), 0 8px 16px -8px rgba(22,34,46,0.4), 0 1px 3px rgba(22,34,46,0.10)',
      transition: 'transform 600ms cubic-bezier(0.23, 1, 0.32, 1)',
    }),
  },
  plateTilted: webOnly({ transform: 'perspective(700px) rotateX(6deg) rotateY(-8deg)' }),
  plateFlat: webOnly({ transform: 'perspective(700px) rotateX(0deg) rotateY(0deg)' }),
  plateBand: { width: 30, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: '#1A55A6' },
  plateFlag: { width: 16, height: 11, borderRadius: 1.5, backgroundColor: '#FFFFFF', justifyContent: 'space-between', paddingVertical: 1.5, alignItems: 'center' },
  plateFlagStripe: { width: '100%', height: 2, backgroundColor: '#1A55A6' },
  plateFlagStar: { width: 5, height: 5, borderWidth: 1, borderColor: '#1A55A6', transform: [{ rotate: '45deg' }] },
  plateBandText: { fontSize: 10, color: '#FFFFFF', letterSpacing: 0.4 },
  plateText: { fontSize: 30, lineHeight: 46, color: '#111111', paddingHorizontal: 14, letterSpacing: 0.6, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },


  // כרטיס התחזוקה
  // Maintenance
  maintCard: { flexDirection: 'column' },
  maintTop: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  // שורת הקילומטראז'
  odoRow: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 6 },
  odoValue: { fontSize: 28, lineHeight: 33, letterSpacing: -0.5, color: DESKTOP_COLORS.ink, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  odoUnit: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },
  progressBlock: { marginTop: 12, gap: 5 },
  progressLabels: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  progressValue: { fontSize: 13.5, color: DESKTOP_COLORS.ink, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  // Fills from the right (RTL). Animated via scaleX, never width.
  progressFill: { width: '100%', height: '100%', borderRadius: 4, ...webOnly({ transformOrigin: 'right center', transition: `transform 500ms ${EASE_OUT}` }) },
  // פס ההתקדמות לטיפול הבא
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: DESKTOP_COLORS.borderSoft, overflow: 'hidden' },
  progressFillEnter: webOnly({
    animationKeyframes: { from: { transform: [{ scaleX: 0 }] } },
    animationDuration: '700ms',
    animationTimingFunction: EASE_OUT,
    animationDelay: '150ms',
    animationFillMode: 'backwards',
  }),
  serviceHint: { marginTop: 12, flexDirection: 'row-reverse', gap: 8, padding: 10, borderRadius: 10, backgroundColor: DESKTOP_COLORS.canvas },
  serviceHintIcon: { marginTop: 2 },
  maintRows: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  maintButton: { marginHorizontal: 16, marginBottom: 14, marginTop: 'auto', justifyContent: 'center' },

  // כרטיס הנהגים
  // Drivers
  driversCard: { paddingHorizontal: 0 },
  driversActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  // שורת נהג
  driverRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 9, ...webOnly({ transition: 'background-color 150ms ease' }) },
  driverName: { fontSize: 14.5 },
  driverLicense: { fontSize: 13, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  driversEmpty: { padding: 16, gap: 10, alignItems: 'flex-end' },
  // חלון הנהגים נפתח מתחת לכותרת
  driversMenu: { top: 34, start: 0, end: 0, width: 'auto' },
  // תפריט הציוד הנלווה, נפתח מתחת לשורה
  accessoriesMenu: { top: '100%', marginTop: 4, end: 8, width: 300, paddingBottom: 6 },
  accessoryRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 8, ...webOnly({ transition: 'background-color 150ms ease' }) },
  accessoryLabel: { fontSize: 14, color: DESKTOP_COLORS.ink },
  driversModalContent: { paddingHorizontal: 18, paddingVertical: 14 },
});
