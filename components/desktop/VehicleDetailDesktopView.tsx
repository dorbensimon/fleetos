import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
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
import { ExpiryBadge } from '../ui';
import { VehicleDriversEditor } from '../VehicleDriversEditor';
import { DesktopModal } from './DesktopModal';
import {
  ACQUISITION_TYPE_LABELS,
  VEHICLE_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  complianceBadgeLabel,
  complianceBadgeState,
  findComplianceDef,
} from '../../lib/compliance';
import { ExpiryState, expiryState, formatDate } from '../../lib/theme';
import { formatPlate } from '../../lib/plate';
import { deriveNextServiceKm, nextServiceKmOf } from '../../lib/serviceSchedule';
import { vehicleFolderByKey } from '../../lib/vehicleFolderAlerts';
import { ISRAEL_COMMON_MANUFACTURERS } from '../../lib/manufacturers';
import { DesktopInput, DesktopSelectOption, DLtrText, DText, HoverPressable, prefersReducedMotion, StatusPill } from './primitives';
import {
  DocumentFolderUploadModal,
  EASE_OUT,
  EditableDateField,
  EditableFieldShell,
  EditableSelectField,
  EditableTextField,
  EXPIRY_TONE_MAP,
  Field,
  FolderTile,
  latestDocumentOf,
  OverflowMenu,
  PlateBadge,
  recordStyles,
  Section,
  STATE_LABEL,
  StatusPicker,
  useOwnerDocuments,
} from './record/RecordKit';
import { DESKTOP_COLORS, DESKTOP_TONES, DesktopTone, webOnly } from './desktopTheme';

/** Statuses an admin can pick from the header pill; archiving has its own action. */
const STATUS_OPTIONS: { value: VehicleStatus; label: string; tone: DesktopTone }[] = [
  { value: 'active', label: VEHICLE_STATUS_LABELS.active, tone: 'ok' },
  { value: 'maintenance', label: VEHICLE_STATUS_LABELS.maintenance, tone: 'warn' },
  { value: 'disabled', label: VEHICLE_STATUS_LABELS.disabled, tone: 'neutral' },
];

/**
 * Desktop body of the vehicle card ("תיק רכב"). The desktop record uses
 * a compact control-room layout: identity and safe actions in the header,
 * operational signals directly below, then an editable data grid. It is
 * intentionally distinct from the phone's tabbed card flow; no mobile
 * bottom navigation is rendered in this desktop component. Every value shown is backed by a
 * real field — the handoff's "תוקף רישוי" status and its standalone
 * "רישוי" documents-tab entries both map onto the app's existing
 * `vehicle_license` compliance item, and its "היסטוריית נסיעות" tab was
 * dropped: this app has no odometer/service history log to back it
 * (only the single current `odometer` value), so recreating it would mean
 * showing fabricated numbers. Documents and drivers sections still embed
 * the existing shared ComplianceSection / VehicleDriversEditor widgets —
 * they own their own data fetching on the phone app too.
 */

// Kept only so this component's props stay compatible with the shared
// VehicleDetailScreen (the phone app still tab-switches between these).
// The desktop view itself no longer branches on it — every section renders.
export type VehicleTab = 'general' | 'drivers' | 'documents' | 'maintenance' | 'licensing';

export type VehicleDocumentFolder = {
  category: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  requiresExpiry: boolean;
};

const VEHICLE_TYPE_OPTIONS: DesktopSelectOption<VehicleType>[] = Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => ({
  value: value as VehicleType,
  label,
}));

const ACQUISITION_TYPE_OPTIONS: DesktopSelectOption<AcquisitionType>[] = Object.entries(ACQUISITION_TYPE_LABELS).map(([value, label]) => ({
  value: value as AcquisitionType,
  label,
}));

function licensingCard(compliance: ComplianceItem[], itemType: string, label: string) {
  const def = findComplianceDef('vehicle', itemType);
  const item = compliance.find((c) => c.item_type === itemType) ?? null;
  const state = def ? complianceBadgeState(def, item) : expiryState(item?.expiry_date);
  const dateLabel = def ? complianceBadgeLabel(def, item) : item?.expiry_date ? formatDate(item.expiry_date) : 'חסר';
  return { itemType, label, state, tone: EXPIRY_TONE_MAP[state], statusLabel: STATE_LABEL[state], dateLabel };
}

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
  onOpenDocumentFolder,
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
  onOpenDocumentFolder: (folder: VehicleDocumentFolder) => void;
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
}) {
  const name = [vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') || formatPlate(vehicle.plate_number);
  const nextServiceKm = nextServiceKmOf(vehicle);
  const serviceRemaining = nextServiceKm == null ? null : nextServiceKm - vehicle.odometer;
  const serviceState: ExpiryState = serviceRemaining == null ? 'missing' : serviceRemaining <= 0 ? 'expired' : serviceRemaining <= 1000 ? 'soon' : 'ok';
  const serviceTone = DESKTOP_TONES[EXPIRY_TONE_MAP[serviceState]];
  const serviceSpan = vehicle.service_interval_km && vehicle.service_interval_km > 0
    ? vehicle.service_interval_km
    : nextServiceKm != null && nextServiceKm > vehicle.last_service_km ? nextServiceKm - vehicle.last_service_km : null;
  const serviceUsed = Math.max(0, vehicle.odometer - vehicle.last_service_km);
  const servicePct = serviceSpan ? Math.min(100, (serviceUsed / serviceSpan) * 100) : 0;
  const serviceMainLabel = serviceSpan ? `${serviceUsed.toLocaleString()} מתוך ${serviceSpan.toLocaleString()} ק״מ` : 'לא הוגדר';
  const serviceSubLabel = serviceRemaining == null
    ? null
    : serviceRemaining <= 0 ? `חריגה של ${Math.abs(serviceRemaining).toLocaleString()} ק״מ` : `נותרו ${serviceRemaining.toLocaleString()} ק״מ`;

  const complianceRows = [
    licensingCard(compliance, 'vehicle_license', 'רישיון רכב'),
    licensingCard(compliance, 'insurance_mandatory', 'ביטוח חובה'),
    licensingCard(compliance, 'insurance_comprehensive', 'ביטוח מקיף'),
  ];
  const alerts = complianceRows.filter((row) => row.state === 'expired' || row.state === 'soon');
  const alertTone: DesktopTone = alerts.some((row) => row.state === 'expired') ? 'bad' : 'warn';

  const isArchived = vehicle.status === 'archived';
  const statusTone: DesktopTone = STATUS_OPTIONS.find((o) => o.value === vehicle.status)?.tone ?? 'neutral';

  const [plateEditing, setPlateEditing] = React.useState(false);
  const [intervalDraft, setIntervalDraft] = React.useState<number | null>(null);
  const [lastServiceDraft, setLastServiceDraft] = React.useState<number | null>(null);
  // Live preview while either input is being edited; the saved value follows the same rule.
  const previewNextServiceKm = deriveNextServiceKm(lastServiceDraft ?? vehicle.last_service_km, intervalDraft ?? vehicle.service_interval_km);
  const [driversModalOpen, setDriversModalOpen] = React.useState(false);
  const [folderRequest, setFolderRequest] = React.useState<{ itemType: string; nonce: number } | null>(null);
  const openComplianceFolder = (itemType: string) => setFolderRequest((prev) => ({ itemType, nonce: (prev?.nonce ?? 0) + 1 }));
  const [documentFolderRequest, setDocumentFolderRequest] = React.useState<string | null>(null);

  useEffect(() => {
    if (!openFolder) return;
    const folder = vehicleFolderByKey(openFolder);
    if (folder?.source === 'compliance') setFolderRequest((prev) => ({ itemType: folder.folderKey, nonce: (prev?.nonce ?? 0) + 1 }));
    else if (folder?.source === 'document') setDocumentFolderRequest(folder.folderKey);
    onFolderOpened?.();
  }, [openFolder, onFolderOpened]);

  const manufacturerOptions: DesktopSelectOption<string>[] = React.useMemo(() => {
    const names = ISRAEL_COMMON_MANUFACTURERS.map((m) => m.he);
    if (vehicle.manufacturer && !names.includes(vehicle.manufacturer)) names.push(vehicle.manufacturer);
    return names.sort((a, b) => a.localeCompare(b, 'he')).map((he) => ({ value: he, label: he }));
  }, [vehicle.manufacturer]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.recordHeader}>
        <View style={styles.recordIdentity}>
          <View style={styles.avatar}>
            <Ionicons name="bus-outline" size={23} color={DESKTOP_COLORS.brand} />
          </View>
          <View style={styles.recordTitleBlock}>
            <View style={styles.recordTitleRow}>
              <DText weight="bold" style={styles.vehicleName} numberOfLines={1}>{name}</DText>
              {isArchived ? (
                <StatusPill tone={statusTone} label={VEHICLE_STATUS_LABELS[vehicle.status] ?? vehicle.status} />
              ) : (
                <StatusPicker
                  value={vehicle.status}
                  options={STATUS_OPTIONS}
                  onChange={(status) => onSaveField({ status })}
                />
              )}
            </View>
            <View style={styles.recordMeta}>
              <PlateBadge plate={formatPlate(vehicle.plate_number)} />
              <DText style={styles.recordType}>{VEHICLE_TYPE_LABELS[vehicle.vehicle_type] ?? vehicle.vehicle_type}</DText>
              {department ? <><DText style={styles.metaDivider}>•</DText><DText style={styles.recordType}>{department}</DText></> : null}
            </View>
          </View>
        </View>
        <View style={styles.headerActions}>
          {isArchived ? (
            <HoverPressable style={styles.secondaryAction} hoverStyle={styles.rowHover} pressStyle={styles.pressDown} onPress={onRestore}>
              <Ionicons name="arrow-undo-outline" size={15} color={DESKTOP_COLORS.brand} />
              <DText weight="semiBold" style={[styles.actionText, { color: DESKTOP_COLORS.brand }]}>הסר מהארכיון</DText>
            </HoverPressable>
          ) : (
            <HoverPressable style={styles.secondaryAction} hoverStyle={styles.rowHover} pressStyle={styles.pressDown} onPress={onArchive}>
              <Ionicons name="archive-outline" size={15} color={DESKTOP_COLORS.inkMuted} />
              <DText weight="semiBold" style={styles.actionText}>העברה לארכיון</DText>
            </HoverPressable>
          )}
          <OverflowMenu items={[{ label: 'מחיקת רכב', icon: 'trash-outline', onPress: onDelete, danger: true }]} />
        </View>
      </View>

      {alerts.length > 0 && (
        <View style={[styles.alertBanner, { backgroundColor: DESKTOP_TONES[alertTone].bg }]}>
          <Ionicons name="alert-circle" size={17} color={DESKTOP_TONES[alertTone].fg} />
          <DText weight="bold" style={[styles.alertTitle, { color: DESKTOP_TONES[alertTone].fg }]}>דרוש טיפול</DText>
          <View style={styles.alertItems}>
            {alerts.map((row) => (
              <HoverPressable
                key={row.itemType}
                style={styles.alertItem}
                hoverStyle={styles.alertItemHover}
                pressStyle={styles.pressDown}
                onPress={() => openComplianceFolder(row.itemType)}
                accessibilityLabel={`פתיחת תיקיית ${row.label}`}
              >
                <View style={[styles.dot, { backgroundColor: DESKTOP_TONES[row.tone].fg }]} />
                <DText weight="semiBold" style={styles.alertItemText}>{row.label}</DText>
                <DText style={styles.alertItemDetail}>{row.state === 'expired' ? 'פג תוקף' : 'יפוג'} {row.dateLabel}</DText>
                <Ionicons name="chevron-back" size={12} color={DESKTOP_COLORS.inkFaint} />
              </HoverPressable>
            ))}
          </View>
        </View>
      )}

      <View style={styles.columns}>
        <View style={styles.mainColumn}>
          <Section title="כללי">
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <DText weight="bold" style={styles.cardTitle}>פרטי רכב ורישוי</DText>
                <HoverPressable
                  style={styles.lookupIconBtn}
                  hoverStyle={styles.rowHover}
                  onPress={onLookupPlate}
                  disabled={lookupLoading || plateEditing}
                  accessibilityLabel="עדכן פרטים לפי מספר רכב"
                >
                  <Ionicons name="search-outline" size={13} color={DESKTOP_COLORS.brand} />
                  <DText weight="semiBold" style={styles.editMaintText}>{lookupLoading ? 'מעדכן…' : 'עדכן פרטים לפי מספר רכב'}</DText>
                </HoverPressable>
              </View>
              {plateEditing && <DText style={styles.lookupMessage}>יש לשמור או לבטל את עריכת מספר הרישוי לפני עדכון הפרטים</DText>}
              {!plateEditing && !!lookupMessage && <DText style={styles.lookupMessage}>{lookupMessage}</DText>}

              <View style={styles.fieldGrid}>
                <EditableTextField
                  label="מספר רישוי"
                  value={formatPlate(vehicle.plate_number)}
                  raw={vehicle.plate_number}
                  ltr
                  plate
                  parse={(v) => v.replace(/\D/g, '').slice(0, 8)}
                  format={formatPlate}
                  validate={(v) => (/^\d{7,8}$/.test(v) ? null : 'מספר רישוי חייב להכיל 7-8 ספרות')}
                  onSave={(v) => onSaveField({ plate_number: v })}
                  onEditingChange={setPlateEditing}
                />
                <EditableSelectField
                  label="יצרן"
                  value={vehicle.manufacturer || '—'}
                  raw={vehicle.manufacturer}
                  options={manufacturerOptions}
                  allowClear
                  placeholder="בחר יצרן"
                  onSave={(v) => onSaveField({ manufacturer: v })}
                />
                <EditableTextField label="דגם" value={vehicle.model || '—'} raw={vehicle.model ?? ''} onSave={(v) => onSaveField({ model: v.trim() || null })} />
                <EditableSelectField
                  label="סוג רכב"
                  value={VEHICLE_TYPE_LABELS[vehicle.vehicle_type]}
                  raw={vehicle.vehicle_type}
                  options={VEHICLE_TYPE_OPTIONS}
                  onSave={(v) => onSaveField({ vehicle_type: (v ?? vehicle.vehicle_type) as VehicleType })}
                />
                <EditableYearMonthField
                  label="שנת ייצור"
                  value={vehicle.production_year ? `${vehicle.production_month ? `${vehicle.production_month}/` : ''}${vehicle.production_year}` : '—'}
                  rawYear={vehicle.production_year ? String(vehicle.production_year) : ''}
                  rawMonth={vehicle.production_month ? String(vehicle.production_month).padStart(2, '0') : ''}
                  onSave={(month, year) => onSaveField({ production_month: month ? Number(month) : null, production_year: year ? Number(year) : null })}
                />
                <EditableTextField label="צבע" value={vehicle.color || '—'} raw={vehicle.color ?? ''} onSave={(v) => onSaveField({ color: v.trim() || null })} />
                <EditableDateField
                  label="עליה לכביש"
                  value={vehicle.road_registration_date ? formatDate(vehicle.road_registration_date) : '—'}
                  raw={vehicle.road_registration_date}
                  onSave={(v) => onSaveField({ road_registration_date: v })}
                />
                <EditableTextField label="ייעוד לשימוש" value={vehicle.usage_type || '—'} raw={vehicle.usage_type ?? ''} onSave={(v) => onSaveField({ usage_type: v.trim() || null })} />
                <EditableTextField
                  label="מספר שילדה"
                  value={vehicle.vin || '—'}
                  raw={vehicle.vin ?? ''}
                  ltr
                  parse={(v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17)}
                  validate={(v) => (!v || /^[A-HJ-NPR-Z0-9]{17}$/.test(v) ? null : 'VIN חייב להכיל 17 תווים ללא I/O/Q')}
                  onSave={(v) => onSaveField({ vin: v || null })}
                />
                <EditableTextField label="קוד פנימי" value={vehicle.internal_code || '—'} raw={vehicle.internal_code ?? ''} ltr onSave={(v) => onSaveField({ internal_code: v.trim() || null })} />
                <EditableSelectField
                  label="מחלקה"
                  value={department || '—'}
                  raw={vehicle.department_id}
                  options={departmentOptions}
                  allowClear
                  placeholder="לא נבחרה"
                  onSave={(v) => onSaveField({ department_id: v })}
                />
                <EditableSelectField
                  label="סוג עסקה"
                  value={vehicle.acquisition_type ? ACQUISITION_TYPE_LABELS[vehicle.acquisition_type] ?? vehicle.acquisition_type : '—'}
                  raw={vehicle.acquisition_type}
                  options={ACQUISITION_TYPE_OPTIONS}
                  allowClear
                  placeholder="לא נבחר"
                  onSave={(v) => onSaveField({ acquisition_type: v as AcquisitionType | null })}
                />
              </View>
            </View>
          </Section>

          <Section title="תחזוקה וטיפולים">
            <View style={styles.card}>
              <DText weight="bold" style={styles.cardTitle}>פרטי תחזוקה</DText>
              <View style={styles.maintenanceGrid}>
                <EditableTextField
                  label="מד אוץ נוכחי"
                  value={`${vehicle.odometer.toLocaleString()} ק״מ`}
                  raw={String(vehicle.odometer ?? '')}
                  ltr
                  compact
                  keyboardType="number-pad"
                  parse={(v) => v.replace(/\D/g, '')}
                  onSave={(v) => onSaveField({ odometer: v ? Number(v) : 0 })}
                />
                <Field label="עודכן לאחרונה" value={vehicle.odometer_updated_at ? formatDate(vehicle.odometer_updated_at) : '—'} ltr compact />
                <EditableTextField
                  label="ק״מ בטיפול האחרון"
                  value={`${vehicle.last_service_km.toLocaleString()} ק״מ`}
                  raw={String(vehicle.last_service_km ?? '')}
                  ltr
                  compact
                  keyboardType="number-pad"
                  parse={(v) => v.replace(/\D/g, '')}
                  onDraftChange={(v) => setLastServiceDraft(v ? Number(v) : 0)}
                  onSave={(v) => {
                    const last = v ? Number(v) : 0;
                    const next = deriveNextServiceKm(last, vehicle.service_interval_km);
                    return onSaveField(next != null ? { last_service_km: last, next_service_km: next } : { last_service_km: last });
                  }}
                />
                <EditableTextField
                  label="טווח ק״מ בין טיפולים"
                  value={vehicle.service_interval_km ? `${vehicle.service_interval_km.toLocaleString()} ק״מ` : '—'}
                  raw={vehicle.service_interval_km ? String(vehicle.service_interval_km) : ''}
                  ltr
                  compact
                  keyboardType="number-pad"
                  parse={(v) => v.replace(/\D/g, '')}
                  onDraftChange={(v) => setIntervalDraft(v ? Number(v) : null)}
                  onSave={(v) => {
                    const interval = v ? Number(v) : null;
                    const next = deriveNextServiceKm(vehicle.last_service_km, interval);
                    return onSaveField(next != null ? { service_interval_km: interval, next_service_km: next } : { service_interval_km: interval });
                  }}
                />
                {previewNextServiceKm != null ? (
                  <Field label="ק״מ לטיפול הבא" value={`${previewNextServiceKm.toLocaleString()} ק״מ`} ltr compact />
                ) : (
                  <EditableTextField
                    label="ק״מ לטיפול הבא"
                    value={vehicle.next_service_km ? `${vehicle.next_service_km.toLocaleString()} ק״מ` : '—'}
                    raw={vehicle.next_service_km ? String(vehicle.next_service_km) : ''}
                    ltr
                    compact
                    keyboardType="number-pad"
                    parse={(v) => v.replace(/\D/g, '')}
                    onSave={(v) => onSaveField({ next_service_km: v ? Number(v) : null })}
                  />
                )}
              </View>
            </View>
          </Section>

          <Section title="מסמכים">
            <ComplianceSection
              companyId={companyId}
              ownerType="vehicle"
              ownerId={vehicleId}
              focusItemType={focusItem}
              openRequest={folderRequest}
              folderAppearance
              desktopModal
              hiddenItemTypes={['annual_test']}
              extraFolderTiles={
                <DocumentFolderGrid
                  companyId={companyId}
                  vehicleId={vehicleId}
                  documentFolders={documentFolders}
                  openCategory={documentFolderRequest}
                  onOpenedCategory={() => setDocumentFolderRequest(null)}
                />
              }
            />
          </Section>
        </View>

        <View style={styles.sideColumn}>
          <View style={styles.panel}>
            <DText weight="bold" style={styles.panelTitle}>רישוי וביטוח</DText>
            {complianceRows.map((row, index) => (
              <HoverPressable
                key={row.itemType}
                style={[styles.complianceRow, index < complianceRows.length - 1 && styles.rowBorder]}
                hoverStyle={styles.rowHover}
                onPress={() => openComplianceFolder(row.itemType)}
                accessibilityLabel={`פתיחת תיקיית ${row.label}`}
              >
                <View style={[styles.dot, row.tone !== 'neutral' && { backgroundColor: DESKTOP_TONES[row.tone].fg }]} />
                <View style={styles.complianceRowText}>
                  <DText weight="semiBold" style={styles.complianceLabel}>{row.label}</DText>
                  <DLtrText style={styles.complianceDate}>{row.state === 'missing' ? 'לא הוזן' : row.dateLabel}</DLtrText>
                </View>
                <DText weight="bold" style={[styles.complianceStatus, row.tone !== 'neutral' && { color: DESKTOP_TONES[row.tone].fg }]}>{row.statusLabel}</DText>
              </HoverPressable>
            ))}
          </View>

          <View style={styles.panel}>
            <DText weight="bold" style={styles.panelTitle}>עד לטיפול הבא</DText>
            <DText weight="bold" style={[styles.serviceMain, serviceSpan != null && { color: serviceTone.fg }]}>{serviceMainLabel}</DText>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: serviceTone.fg, transform: [{ scaleX: servicePct / 100 }] },
                  !prefersReducedMotion() && styles.progressFillEnter,
                ]}
              />
            </View>
            {serviceSubLabel && <DText style={styles.serviceSub}>{serviceSubLabel}</DText>}
          </View>

          <AssignedDriversPanel
            drivers={drivers}
            onManage={() => setDriversModalOpen(true)}
            onOpenDriver={onOpenDriver}
          />
        </View>
      </View>

      <DesktopModal visible={driversModalOpen} title="נהגים משויכים" onClose={() => setDriversModalOpen(false)} maxWidth={480}>
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

function AssignedDriversPanel({
  drivers,
  onManage,
  onOpenDriver,
}: {
  drivers: VehicleDriverWithProfile[];
  onManage: () => void;
  onOpenDriver: (driverId: string) => void;
}) {
  const compactDrivers = drivers.slice(0, 2);

  return (
    <View style={styles.panel}>
      <View style={styles.assignedDriversHeaderRow}>
        <DText weight="bold" style={styles.panelTitle}>נהגים משויכים</DText>
        <HoverPressable style={styles.editIconBtn} hoverStyle={styles.showMoreDriversHover} pressStyle={styles.pressDown} onPress={onManage} accessibilityLabel="עריכת הנהגים המשויכים">
          <Ionicons name={drivers.length >= 3 ? 'chevron-back' : 'create-outline'} size={13} color={DESKTOP_COLORS.brand} />
        </HoverPressable>
      </View>
      {drivers.length === 0 ? (
        <DText weight="semiBold" style={styles.noDriversValue}>אין נהגים משויכים</DText>
      ) : (
        <>
          <View style={styles.assignedDriverCountRow}>
            <DText weight="bold" style={styles.statValue}>{drivers.length}</DText>
            {drivers.length === 1 && (
              <HoverPressable
                style={[styles.driverNameButton, styles.singleDriverNameButton]}
                hoverStyle={styles.driverNameButtonHover}
                pressStyle={styles.pressDown}
                onPress={() => onOpenDriver(drivers[0].driver_id)}
                accessibilityLabel={`פתיחת פרטי הנהג ${drivers[0].full_name ?? 'ללא שם'}`}
              >
                <DText weight="semiBold" style={styles.singleDriverName} numberOfLines={1}>{drivers[0].full_name ?? 'ללא שם'}</DText>
              </HoverPressable>
            )}
          </View>
          {drivers.length >= 2 && (
            <View style={styles.driverNamesList}>
              {compactDrivers.map((driver) => (
                <HoverPressable
                  key={driver.id}
                  style={styles.driverNameButton}
                  hoverStyle={styles.driverNameButtonHover}
                  pressStyle={styles.pressDown}
                  onPress={() => onOpenDriver(driver.driver_id)}
                  accessibilityLabel={`פתיחת פרטי הנהג ${driver.full_name ?? 'ללא שם'}`}
                >
                  <DText style={styles.driverName} numberOfLines={1}>{driver.full_name ?? 'ללא שם'}</DText>
                </HoverPressable>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}


function EditableYearMonthField({
  label,
  value,
  rawYear,
  rawMonth,
  onSave,
}: {
  label: string;
  value: string;
  rawYear: string;
  rawMonth: string;
  onSave: (month: string, year: string) => Promise<string | null>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [month, setMonth] = React.useState(rawMonth);
  const [year, setYear] = React.useState(rawYear);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedNonce, setSavedNonce] = React.useState(0);

  const start = () => { setMonth(rawMonth); setYear(rawYear); setError(null); setEditing(true); };
  const cancel = () => setEditing(false);
  const confirm = async () => {
    setSaving(true);
    const err = await onSave(month, year);
    setSaving(false);
    if (err) { setError(err); return; }
    setSavedNonce((n) => n + 1);
    setEditing(false);
  };

  return (
    <EditableFieldShell label={label} displayValue={value} ltr editing={editing} onStartEdit={start} onCancel={cancel} onConfirm={confirm} saving={saving} error={error} savedNonce={savedNonce}>
      <View style={styles.yearMonthRow}>
        <DesktopInput value={month} onChangeText={(v) => setMonth(v.replace(/\D/g, '').slice(0, 2))} placeholder="חודש" ltr style={styles.monthInput} />
        <DesktopInput value={year} onChangeText={(v) => setYear(v.replace(/\D/g, '').slice(0, 4))} placeholder="שנה" ltr style={styles.yearInput} />
      </View>
    </EditableFieldShell>
  );
}

function DocumentFolderGrid({
  companyId,
  vehicleId,
  documentFolders,
  openCategory,
  onOpenedCategory,
}: {
  companyId: string;
  vehicleId: string;
  documentFolders: readonly VehicleDocumentFolder[];
  /** Opens this folder's modal from outside (a notification deep link). */
  openCategory?: string | null;
  onOpenedCategory?: () => void;
}) {
  const { docs: allDocs, thumbnails, reload: load } = useOwnerDocuments('vehicle', vehicleId);
  const [openFolder, setOpenFolder] = useState<VehicleDocumentFolder | null>(null);

  useEffect(() => {
    if (!openCategory) return;
    const folder = documentFolders.find((f) => f.category === openCategory);
    if (folder) setOpenFolder(folder);
    onOpenedCategory?.();
  }, [openCategory, documentFolders, onOpenedCategory]);

  const counts: Record<string, number> = {};
  for (const doc of allDocs) counts[doc.category] = (counts[doc.category] ?? 0) + 1;

  return (
    <>
      {documentFolders.map((folder) => {
        const count = counts[folder.category] ?? 0;
        const latestExpiry = latestDocumentOf(allDocs, folder.category)?.expiry_date ?? null;
        return (
          <FolderTile
            key={folder.category}
            title={folder.title}
            icon={folder.icon}
            thumbnail={thumbnails[folder.category]}
            signedVisual
            onPress={() => setOpenFolder(folder)}
            meta={count > 0 ? <ExpiryBadge state={expiryState(latestExpiry)} label={latestExpiry ? formatDate(latestExpiry) : 'חסר תוקף'} /> : <DText style={styles.folderTileCount}>אין מסמכים</DText>}
          />
        );
      })}

      {openFolder && (
        <DocumentFolderUploadModal
          companyId={companyId}
          ownerType="vehicle"
          ownerId={vehicleId}
          folder={openFolder}
          docs={allDocs}
          onClose={() => setOpenFolder(null)}
          onChanged={load}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  ...recordStyles,
  serviceMain: { fontSize: 15, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  serviceSub: { fontSize: 12, color: DESKTOP_COLORS.inkMuted, marginTop: 7, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },

  vehicleName: { fontSize: 17, letterSpacing: -0.15 },
  recordType: { fontSize: 12, color: DESKTOP_COLORS.inkFaint },
  statValue: { fontSize: 18, marginTop: 2, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  noDriversValue: { fontSize: 13, marginTop: 7, color: DESKTOP_COLORS.inkMuted },
  assignedDriverCountRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  singleDriverName: { flex: 1, fontSize: 13.5, marginTop: 4 },
  driverNamesList: { gap: 2, marginTop: 4 },
  driverName: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  driverNameButton: { alignSelf: 'flex-end', maxWidth: '100%', borderRadius: 4, paddingHorizontal: 3, marginHorizontal: -3 },
  singleDriverNameButton: { flex: 1 },
  driverNameButtonHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  assignedDriversHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  editIconBtn: { width: 20, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  showMoreDriversHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  driversModalContent: { paddingHorizontal: 18, paddingVertical: 14 },

  progressTrack: { height: 7, borderRadius: 4, backgroundColor: DESKTOP_COLORS.borderSoft, marginTop: 10, overflow: 'hidden' },
  // Fills from the right (RTL), like the dashboard bars. Animated via scaleX, never width.
  progressFill: { width: '100%', height: '100%', ...webOnly({ transformOrigin: 'right center', transition: `transform 500ms ${EASE_OUT}` }) },
  progressFillEnter: webOnly({
    animationKeyframes: { from: { transform: [{ scaleX: 0 }] } },
    animationDuration: '600ms',
    animationTimingFunction: EASE_OUT,
    animationDelay: '120ms',
    animationFillMode: 'backwards',
  }),

  lookupIconBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 10, borderRadius: 7, borderWidth: 1, borderColor: DESKTOP_COLORS.borderInput, ...webOnly({ transition: 'background-color 150ms ease' }) },
  yearMonthRow: { flexDirection: 'row-reverse', gap: 6 },
  monthInput: { width: 56 },
  yearInput: { width: 68 },
  lookupMessage: { fontSize: 11.5, color: DESKTOP_COLORS.inkMuted, marginTop: -4 },

  editMaintText: { fontSize: 12.5, color: DESKTOP_COLORS.brand },

  folderRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 46, ...webOnly({ transition: 'background-color 150ms ease' }) },
  folderIcon: { width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  folderLabel: { flex: 1, fontSize: 12.5 },
});
