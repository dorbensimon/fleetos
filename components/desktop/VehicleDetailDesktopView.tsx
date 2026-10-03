import React, { useEffect, useState } from 'react';
import { FocusTarget } from '../ui/FocusTarget';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BrandLoader } from '../ui/BrandLoader';
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
import { VehicleDriversEditor } from '../VehicleDriversEditor';
import { VehicleInspectionsDesktopSection } from '../inspection/VehicleInspectionsDesktopSection';
import { DesktopModal } from './DesktopModal';
import {
  ACQUISITION_TYPE_LABELS,
  VEHICLE_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  complianceBadgeState,
  findComplianceDef,
} from '../../lib/compliance';
import { ExpiryState, expiryState, formatDate } from '../../lib/theme';
import { formatPlate } from '../../lib/plate';
import { deriveNextServiceKm, nextServiceKmOf } from '../../lib/serviceSchedule';
import { vehicleFolderByKey } from '../../lib/vehicleFolderAlerts';
import { requiresTachograph } from '../../lib/tachograph';
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
import { DetailRow, Fact, FieldEditDialog, GroupLabel, digitsOnly, pageStyles, type FieldEditor, type TextFieldEditor } from './record/RecordPage';
import { DESKTOP_COLORS, DESKTOP_TONES, DesktopTone, webOnly } from './desktopTheme';
import { t, dirIcon, fixedLayoutProps, FIXED_LAYOUT_STYLE } from '../../lib/i18n';

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
 * documents list, and the plate lookup sits inside the plate row. The phone
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

const VEHICLE_TYPE_OPTIONS = (): DesktopSelectOption<VehicleType>[] => Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => ({
  value: value as VehicleType,
  label,
}));

const ACQUISITION_TYPE_OPTIONS = (): DesktopSelectOption<AcquisitionType>[] => Object.entries(ACQUISITION_TYPE_LABELS).map(([value, label]) => ({
  value: value as AcquisitionType,
  label,
}));

/** Compliance items that can raise the attention notice. */
const ALERT_COMPLIANCE_TYPES = [
  { itemType: 'vehicle_license', get label() { return t('folder.vehicleLicense'); } },
  { itemType: 'operating_license', get label() { return t('folder.operatingLicense'); } },
  { itemType: 'insurance_mandatory', get label() { return t('folder.mandatoryInsurance'); } },
  { itemType: 'insurance_comprehensive', get label() { return t('folder.comprehensiveInsurance'); } },
];

const km = (n: number) => n.toLocaleString();

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
  lookupLoading,
  lookupMessage,
  onLookupPlate,
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
  lookupLoading: boolean;
  lookupMessage: string | null;
  onLookupPlate: () => void;
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
  const { docs: folderDocs, reload: reloadFolderDocs } = useOwnerDocuments('vehicle', vehicleId);
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
    else if (folder?.source === 'document') {
      const documentFolder = documentFolders.find((f) => f.category === folder.folderKey);
      if (documentFolder) setOpenDocumentFolder(documentFolder);
    }
    onFolderOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFolder, onFolderOpened]);

  // Attention notice: expired or soon-expiring compliance items and document folders.
  type Alert = { key: string; label: string; state: ExpiryState; date: string | null; open: () => void };
  const alerts: Alert[] = [];
  for (const { itemType, label } of ALERT_COMPLIANCE_TYPES) {
    const def = findComplianceDef('vehicle', itemType);
    const item = compliance.find((c) => c.item_type === itemType) ?? null;
    const state = def ? complianceBadgeState(def, item) : expiryState(item?.expiry_date);
    if (state === 'expired' || state === 'soon') alerts.push({ key: itemType, label, state, date: item?.expiry_date ?? null, open: () => openComplianceFolder(itemType) });
  }
  for (const folder of documentFolders) {
    const status = folderStatus(folderDocs.filter((d) => d.category === folder.category));
    if (status.state === 'expired' || status.state === 'soon') alerts.push({ key: folder.category, label: folder.title, state: status.state, date: status.expiry, open: () => setOpenDocumentFolder(folder) });
  }
  alerts.sort((a, b) => (a.state === b.state ? 0 : a.state === 'expired' ? -1 : 1));

  // Editing
  const [editor, setEditor] = useState<FieldEditor | null>(null);
  const [driversModalOpen, setDriversModalOpen] = useState(false);
  useEffect(() => {
    if (!openDrivers) return;
    setDriversModalOpen(true);
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
    onSave: (v) => onSave(v ? Number(v) : null),
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
      <View style={[styles.hero, !reduceMotion && styles.enter]}>
        <View style={styles.heroIdentity}>
          <View style={styles.heroStatusRow}>
            {isArchived ? (
              <StatusPill tone="neutral" label={VEHICLE_STATUS_LABELS.archived} />
            ) : (
              <StatusPicker value={vehicle.status} options={STATUS_OPTIONS} onChange={(status) => onSaveField({ status })} />
            )}
            <OverflowMenu items={menuItems} />
          </View>
          <DText weight="bold" style={styles.heroName} numberOfLines={1}>{name}</DText>
          <View style={styles.heroSub}>
            {subParts.map((part, index) => (
              <React.Fragment key={`${part}-${index}`}>
                {index > 0 && <DText style={styles.heroSubDot}>·</DText>}
                <DText style={styles.heroSubText}>{part}</DText>
              </React.Fragment>
            ))}
          </View>
        </View>

        <View style={styles.facts}>
          <Fact label={t('vehicle.odometer')} value={km(vehicle.odometer)} unit={t('unit.km')} />
          <Fact
            label={t('vehicle.nextServiceIn')}
            value={serviceRemaining == null ? t('common.notSet') : serviceRemaining <= 0 ? t('vehicle.overBy', { v1: km(Math.abs(serviceRemaining)) }) : km(serviceRemaining)}
            unit={serviceRemaining == null ? undefined : t('unit.km')}
            color={serviceState === 'expired' ? DESKTOP_TONES.bad.fg : serviceState === 'soon' ? DESKTOP_TONES.warn.fg : undefined}
            muted={serviceRemaining == null}
          />
          <Fact label={t('vehicle.assignedDrivers')} value={String(drivers.length)} />
        </View>

        <LicensePlate plate={formatPlate(vehicle.plate_number)} />
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
              accessory={
                <HoverPressable
                  style={[styles.lookupPill, lookupLoading && styles.disabled]}
                  hoverStyle={styles.softBtnHover}
                  pressStyle={styles.pressDown}
                  onPress={onLookupPlate}
                  disabled={lookupLoading}
                  accessibilityLabel={t('vehicle.autofillLabel')}
                >
                  {lookupLoading ? <BrandLoader size="small" color={DESKTOP_COLORS.brand} style={styles.lookupSpinner} /> : <Ionicons name="search-outline" size={13} color={DESKTOP_COLORS.brand} />}
                  <DText weight="semiBold" style={styles.lookupText}>{lookupLoading ? t('common.searching') : t('vehicle.autofill')}</DText>
                </HoverPressable>
              }
            />
            {!!lookupMessage && (
              <View style={styles.lookupNote}>
                <DText style={styles.lookupNoteText}>{lookupMessage}</DText>
              </View>
            )}
            <DetailRow first={!!lookupMessage} label={t('vehicle.manufacturer')} value={vehicle.manufacturer} onPress={() => setEditor({ kind: 'select', label: t('vehicle.manufacturer'), raw: vehicle.manufacturer, options: manufacturerOptions, allowClear: true, placeholder: t('vehicle.chooseManufacturer'), onSave: (v) => onSaveField({ manufacturer: v }) })} />
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

        <View style={styles.sideCell}>
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
                value={t('unit.kmValue', { v1: km(vehicle.last_service_km) })}
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

      <View style={styles.gridRow}>
        <View style={styles.mainCell}>
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
          </View>
        </View>

        <View style={styles.sideCell}>
          <GroupLabel
            action={
              <HoverPressable style={styles.linkBtn} hoverStyle={styles.softBtnHover} onPress={() => setDriversModalOpen(true)} accessibilityLabel={t('vehicle.changeAssignedDrivers')}>
                <DText weight="semiBold" style={styles.linkText}>{t('common.change')}</DText>
              </HoverPressable>
            }
          >
            {t('vehicle.assignedDrivers')}
          </GroupLabel>
          <View style={[styles.card, styles.driversCard]}>
            {drivers.length === 0 ? (
              <View style={styles.driversEmpty}>
                <DText style={styles.mutedText}>{t('vehicle.noAssignedDrivers')}</DText>
                <HoverPressable style={styles.softBtn} hoverStyle={styles.softBtnHover} pressStyle={styles.pressDown} onPress={() => setDriversModalOpen(true)}>
                  <Ionicons name="person-add-outline" size={16} color={DESKTOP_COLORS.brand} />
                  <DText weight="semiBold" style={styles.softBtnText}>{t('attention.assignDriver')}</DText>
                </HoverPressable>
              </View>
            ) : (
              drivers.map((driver, index) => <DriverRow key={driver.id} driver={driver} first={index === 0} onPress={() => onOpenDriver(driver.driver_id)} />)
            )}
          </View>
        </View>
      </View>

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
            {documentFolders.map((folder, index) => (
              <FolderListRow
                key={folder.category}
                title={folder.title}
                icon={folder.icon}
                docs={folderDocs.filter((d) => d.category === folder.category)}
                onPress={() => setOpenDocumentFolder(folder)}
                first={index === 0}
              />
            ))}
            <VehicleInspectionsDesktopSection companyId={companyId} vehicleId={vehicleId} archived={isArchived} first={documentFolders.length === 0} />
          </View>
        </View>
      </View>

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

      <DesktopModal visible={driversModalOpen} title={t('vehicle.assignedDrivers')} onClose={() => setDriversModalOpen(false)} maxWidth={480}>
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
      </DesktopModal>
    </ScrollView>
  );
}

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

const styles = StyleSheet.create({
  ...pageStyles,

  plateWrap: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, backgroundColor: DESKTOP_COLORS.canvas },
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

  lookupPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, height: 24, paddingHorizontal: 8, borderRadius: 12, backgroundColor: 'rgba(0,136,204,0.09)', ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  lookupSpinner: { transform: [{ scale: 0.7 }], width: 13, height: 13 },
  lookupText: { fontSize: 12.5, color: DESKTOP_COLORS.brand },
  lookupNote: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F3FAF6', borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  lookupNoteText: { fontSize: 13.5, color: DESKTOP_COLORS.inkMuted },

  // Maintenance
  maintCard: { flexDirection: 'column' },
  maintTop: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  odoRow: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 6 },
  odoValue: { fontSize: 28, lineHeight: 33, letterSpacing: -0.5, color: DESKTOP_COLORS.ink, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  odoUnit: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },
  progressBlock: { marginTop: 12, gap: 5 },
  progressLabels: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  progressValue: { fontSize: 13.5, color: DESKTOP_COLORS.ink, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  // Fills from the right (RTL). Animated via scaleX, never width.
  progressFill: { width: '100%', height: '100%', borderRadius: 4, ...webOnly({ transformOrigin: 'right center', transition: `transform 500ms ${EASE_OUT}` }) },
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

  // Drivers
  driversCard: { paddingHorizontal: 0 },
  driverRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 9, ...webOnly({ transition: 'background-color 150ms ease' }) },
  driverName: { fontSize: 14.5 },
  driverLicense: { fontSize: 13, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  driversEmpty: { padding: 16, gap: 10, alignItems: 'flex-end' },
  driversModalContent: { paddingHorizontal: 18, paddingVertical: 14 },
});
