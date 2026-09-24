import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { DetailRow, Fact, FieldEditDialog, GroupLabel, digitsOnly, pageStyles, type FieldEditor } from './record/RecordPage';
import { DESKTOP_COLORS, DESKTOP_TONES, DesktopTone, webOnly } from './desktopTheme';

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

const VEHICLE_TYPE_OPTIONS: DesktopSelectOption<VehicleType>[] = Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => ({
  value: value as VehicleType,
  label,
}));

const ACQUISITION_TYPE_OPTIONS: DesktopSelectOption<AcquisitionType>[] = Object.entries(ACQUISITION_TYPE_LABELS).map(([value, label]) => ({
  value: value as AcquisitionType,
  label,
}));

/** Compliance items that can raise the attention notice. */
const ALERT_COMPLIANCE_TYPES = [
  { itemType: 'vehicle_license', label: 'רישיון רכב' },
  { itemType: 'operating_license', label: 'רישיון הפעלה' },
  { itemType: 'insurance_mandatory', label: 'ביטוח חובה' },
  { itemType: 'insurance_comprehensive', label: 'ביטוח מקיף' },
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
        style={[styles.plate, tiltable && (hovered ? styles.plateFlat : styles.plateTilted)]}
        accessibilityRole="image"
        accessibilityLabel={`מספר רכב ${plate}`}
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

  const manufacturerOptions: DesktopSelectOption<string>[] = React.useMemo(() => {
    const names = ISRAEL_COMMON_MANUFACTURERS.map((m) => m.he);
    if (vehicle.manufacturer && !names.includes(vehicle.manufacturer)) names.push(vehicle.manufacturer);
    return names.sort((a, b) => a.localeCompare(b, 'he')).map((he) => ({ value: he, label: he }));
  }, [vehicle.manufacturer]);

  const kmEditor = (label: string, raw: number | null, onSave: (value: number | null) => Promise<string | null>, hint?: string): FieldEditor => ({
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
    vehicle.production_year ? `שנת ${vehicle.production_year}` : null,
    vehicle.color,
  ].filter(Boolean) as string[];

  const menuItems = [
    ...(isArchived ? [] : [{ label: 'העברה לארכיון', icon: 'archive-outline' as const, onPress: onArchive }]),
    { label: 'מחיקת הרכב', icon: 'trash-outline' as const, onPress: onDelete, danger: true },
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
          <Fact label="מד אוץ" value={km(vehicle.odometer)} unit="ק״מ" />
          <Fact
            label="טיפול הבא בעוד"
            value={serviceRemaining == null ? 'לא הוגדר' : serviceRemaining <= 0 ? `חריגה ${km(Math.abs(serviceRemaining))}` : km(serviceRemaining)}
            unit={serviceRemaining == null ? undefined : 'ק״מ'}
            color={serviceState === 'expired' ? DESKTOP_TONES.bad.fg : serviceState === 'soon' ? DESKTOP_TONES.warn.fg : undefined}
            muted={serviceRemaining == null}
          />
          <Fact label="נהגים משויכים" value={String(drivers.length)} />
        </View>

        <LicensePlate plate={formatPlate(vehicle.plate_number)} />
        <View style={styles.heroMenu}>
          <OverflowMenu items={menuItems} />
        </View>
      </View>

      {isArchived && (
        <View style={styles.archivedBanner}>
          <Ionicons name="archive-outline" size={18} color={DESKTOP_COLORS.inkMuted} />
          <View style={styles.flex}>
            <DText weight="bold" style={styles.archivedTitle}>הרכב נמצא בארכיון</DText>
            <DText style={styles.archivedText}>הוא לא מופיע ברשימת הרכבים, אבל כל הנתונים והמסמכים שמורים.</DText>
          </View>
          <HoverPressable style={styles.softBtn} hoverStyle={styles.softBtnHover} pressStyle={styles.pressDown} onPress={onRestore}>
            <Ionicons name="arrow-undo-outline" size={16} color={DESKTOP_COLORS.brand} />
            <DText weight="semiBold" style={styles.softBtnText}>החזרה מהארכיון</DText>
          </HoverPressable>
        </View>
      )}

      {/* Attention notice */}
      {!isArchived && alerts.length > 0 && (
        <View style={[styles.attention, !reduceMotion && styles.enter]}>
          <Ionicons name="warning-outline" size={18} color={DESKTOP_TONES.warn.fg} style={styles.attentionIcon} />
          <View style={styles.flex}>
            <DText weight="bold" style={styles.attentionTitle}>
              {alerts.length === 1 ? 'מסמך אחד דורש טיפול' : `${alerts.length} מסמכים דורשים טיפול`}
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
                    <DText style={styles.attentionText}>{alert.state === 'expired' ? ', מאז ' : ', עד '}</DText>
                    <DLtrText style={styles.attentionText}>{formatDate(alert.date)}</DLtrText>
                  </>
                )}
                <HoverPressable style={styles.linkBtn} hoverStyle={styles.softBtnHover} onPress={alert.open} accessibilityLabel={`פתיחת ${alert.label}`}>
                  <DText weight="semiBold" style={styles.linkText}>פתיחה</DText>
                  <Ionicons name="chevron-back" size={14} color={DESKTOP_COLORS.brand} />
                </HoverPressable>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Details + maintenance, then usage + drivers — two rows whose cells line up */}
      <View style={styles.gridRow}>
        <View style={styles.mainCell}>
          <GroupLabel>רכב</GroupLabel>
          <View style={styles.card}>
            <DetailRow
              first
              label="מספר רישוי"
              value={formatPlate(vehicle.plate_number)}
              ltr
              onPress={() => setEditor({
                kind: 'text',
                label: 'מספר רישוי',
                raw: vehicle.plate_number,
                ltr: true,
                numeric: true,
                hint: '7 או 8 ספרות. המקפים נוספים לבד.',
                parse: (v) => digitsOnly(v).slice(0, 8),
                format: formatPlate,
                validate: (v) => (/^\d{7,8}$/.test(v) ? null : 'מספר רישוי צריך 7 או 8 ספרות'),
                onSave: (v) => onSaveField({ plate_number: v }),
              })}
              accessory={
                <HoverPressable
                  style={[styles.lookupPill, lookupLoading && styles.disabled]}
                  hoverStyle={styles.softBtnHover}
                  pressStyle={styles.pressDown}
                  onPress={onLookupPlate}
                  disabled={lookupLoading}
                  accessibilityLabel="מילוי אוטומטי של יצרן, דגם, צבע ושנת ייצור לפי מספר הרכב"
                >
                  {lookupLoading ? <ActivityIndicator size="small" color={DESKTOP_COLORS.brand} style={styles.lookupSpinner} /> : <Ionicons name="search-outline" size={13} color={DESKTOP_COLORS.brand} />}
                  <DText weight="semiBold" style={styles.lookupText}>{lookupLoading ? 'מחפש…' : 'מילוי אוטומטי'}</DText>
                </HoverPressable>
              }
            />
            {!!lookupMessage && (
              <View style={styles.lookupNote}>
                <DText style={styles.lookupNoteText}>{lookupMessage}</DText>
              </View>
            )}
            <DetailRow first={!!lookupMessage} label="יצרן" value={vehicle.manufacturer} onPress={() => setEditor({ kind: 'select', label: 'יצרן', raw: vehicle.manufacturer, options: manufacturerOptions, allowClear: true, placeholder: 'בחירת יצרן', onSave: (v) => onSaveField({ manufacturer: v }) })} />
            <DetailRow label="דגם" value={vehicle.model} onPress={() => setEditor({ kind: 'text', label: 'דגם', raw: vehicle.model ?? '', onSave: (v) => onSaveField({ model: v.trim() || null }) })} />
            <DetailRow label="סוג רכב" value={VEHICLE_TYPE_LABELS[vehicle.vehicle_type] ?? vehicle.vehicle_type} onPress={() => setEditor({ kind: 'select', label: 'סוג רכב', raw: vehicle.vehicle_type, options: VEHICLE_TYPE_OPTIONS, onSave: (v) => onSaveField({ vehicle_type: (v ?? vehicle.vehicle_type) as VehicleType }) })} />
            <DetailRow
              label="שנת ייצור"
              value={productionLabel}
              ltr
              onPress={() => setEditor({
                kind: 'monthYear',
                label: 'שנת ייצור',
                month: vehicle.production_month ? String(vehicle.production_month) : '',
                year: vehicle.production_year ? String(vehicle.production_year) : '',
                onSave: (month, year) => onSaveField({ production_month: month ? Number(month) : null, production_year: year ? Number(year) : null }),
              })}
            />
            <DetailRow label="צבע" value={vehicle.color} onPress={() => setEditor({ kind: 'text', label: 'צבע', raw: vehicle.color ?? '', onSave: (v) => onSaveField({ color: v.trim() || null }) })} />
            <DetailRow label="עלייה לכביש" value={vehicle.road_registration_date ? formatDate(vehicle.road_registration_date) : null} ltr onPress={() => setEditor({ kind: 'date', label: 'עלייה לכביש', raw: vehicle.road_registration_date, onSave: (v) => onSaveField({ road_registration_date: v }) })} />
            <DetailRow
              label="מספר שלדה"
              value={vehicle.vin}
              ltr
              onPress={() => setEditor({
                kind: 'text',
                label: 'מספר שלדה',
                raw: vehicle.vin ?? '',
                ltr: true,
                hint: '17 תווים: אותיות באנגלית ומספרים.',
                parse: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17),
                validate: (v) => (!v || /^[A-HJ-NPR-Z0-9]{17}$/.test(v) ? null : 'מספר שלדה צריך 17 תווים, בלי האותיות I, O, Q'),
                onSave: (v) => onSaveField({ vin: v || null }),
              })}
            />
          </View>
        </View>

        <View style={styles.sideCell}>
          <GroupLabel>תחזוקה</GroupLabel>
          <View style={[styles.card, styles.maintCard]}>
            <View style={styles.maintTop}>
              <View style={styles.odoRow}>
                <DLtrText weight="bold" style={styles.odoValue}>{km(vehicle.odometer)}</DLtrText>
                <DText style={styles.odoUnit}>ק״מ</DText>
              </View>
              <View style={styles.inlineMeta}>
                <DText style={styles.mutedText}>{vehicle.odometer_updated_at ? 'מד אוץ, עודכן ב־' : 'מד אוץ · עוד לא עודכן'}</DText>
                {!!vehicle.odometer_updated_at && <DLtrText style={styles.mutedText}>{formatDate(vehicle.odometer_updated_at)}</DLtrText>}
              </View>

              {serviceSpan == null && (
                <View style={styles.serviceHint}>
                  <Ionicons name="construct-outline" size={16} color={DESKTOP_COLORS.inkMuted} style={styles.serviceHintIcon} />
                  <DText style={[styles.mutedText, styles.flex]}>
                    כדי לדעת מתי הטיפול הבא, מזינים למטה את הק״מ בטיפול האחרון ואת טווח הק״מ בין טיפולים. החישוב נעשה לבד.
                  </DText>
                </View>
              )}
              {serviceSpan != null && (
                <View style={styles.progressBlock}>
                  <View style={styles.progressLabels}>
                    <DText style={styles.mutedText}>מאז הטיפול האחרון</DText>
                    <DText weight="semiBold" style={styles.progressValue}>{km(serviceUsed)} מתוך {km(serviceSpan)}</DText>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { backgroundColor: serviceColor, transform: [{ scaleX: servicePct / 100 }] }, !reduceMotion && styles.progressFillEnter]} />
                  </View>
                  {serviceRemaining != null && (
                    <DText style={[styles.mutedText, serviceState !== 'ok' && { color: serviceColor }]}>
                      {serviceRemaining <= 0 ? `חריגה של ${km(Math.abs(serviceRemaining))} ק״מ מהטיפול` : `נותרו ${km(serviceRemaining)} ק״מ לטיפול`}
                    </DText>
                  )}
                </View>
              )}
            </View>

            <View style={styles.maintRows}>
              <DetailRow
                first
                compact
                label="בטיפול האחרון"
                value={`${km(vehicle.last_service_km)} ק״מ`}
                onPress={() => setEditor(kmEditor('ק״מ בטיפול האחרון', vehicle.last_service_km, (value) => {
                  const last = value ?? 0;
                  const next = deriveNextServiceKm(last, vehicle.service_interval_km);
                  return onSaveField(next != null ? { last_service_km: last, next_service_km: next } : { last_service_km: last });
                }, 'מה הראה מד האוץ בטיפול האחרון? הטיפול הבא יחושב לבד.'))}
              />
              <DetailRow
                compact
                label="טיפול כל"
                value={vehicle.service_interval_km ? `${km(vehicle.service_interval_km)} ק״מ` : null}
                onPress={() => setEditor(kmEditor('טווח ק״מ בין טיפולים', vehicle.service_interval_km, (interval) => {
                  const next = deriveNextServiceKm(vehicle.last_service_km, interval);
                  return onSaveField(next != null ? { service_interval_km: interval, next_service_km: next } : { service_interval_km: interval });
                }, 'כל כמה ק״מ הרכב צריך טיפול? הטיפול הבא יחושב לבד.'))}
              />
              <DetailRow
                compact
                label="הטיפול הבא ב־"
                value={nextServiceKm != null ? `${km(nextServiceKm)} ק״מ` : null}
                onPress={derivedNextServiceKm != null ? undefined : () => setEditor(kmEditor('ק״מ לטיפול הבא', vehicle.next_service_km, (v) => onSaveField({ next_service_km: v })))}
              />
            </View>

            <HoverPressable
              style={[styles.primaryBtn, styles.maintButton]}
              hoverStyle={styles.primaryBtnHover}
              pressStyle={styles.pressDown}
              onPress={() => setEditor(kmEditor('מד אוץ נוכחי', vehicle.odometer, (v) => onSaveField({ odometer: v ?? 0 }), 'כמה ק״מ מראה מד האוץ עכשיו?'))}
            >
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <DText weight="semiBold" style={styles.primaryBtnText}>עדכון מד אוץ</DText>
            </HoverPressable>
          </View>
        </View>
      </View>

      <View style={styles.gridRow}>
        <View style={styles.mainCell}>
          <GroupLabel>שימוש בחברה</GroupLabel>
          <View style={styles.card}>
            <DetailRow first label="מחלקה" value={department} onPress={() => setEditor({ kind: 'select', label: 'מחלקה', raw: vehicle.department_id, options: departmentOptions, allowClear: true, placeholder: 'ללא מחלקה', onSave: (v) => onSaveField({ department_id: v }) })} />
            <DetailRow label="ייעוד לשימוש" value={vehicle.usage_type} onPress={() => setEditor({ kind: 'text', label: 'ייעוד לשימוש', raw: vehicle.usage_type ?? '', onSave: (v) => onSaveField({ usage_type: v.trim() || null }) })} />
            <DetailRow
              label="סוג עסקה"
              value={vehicle.acquisition_type ? ACQUISITION_TYPE_LABELS[vehicle.acquisition_type] ?? vehicle.acquisition_type : null}
              onPress={() => setEditor({ kind: 'select', label: 'סוג עסקה', raw: vehicle.acquisition_type, options: ACQUISITION_TYPE_OPTIONS, allowClear: true, placeholder: 'לא נבחר', onSave: (v) => onSaveField({ acquisition_type: v as AcquisitionType | null }) })}
            />
            <DetailRow label="קוד פנימי" value={vehicle.internal_code} ltr onPress={() => setEditor({ kind: 'text', label: 'קוד פנימי', raw: vehicle.internal_code ?? '', ltr: true, onSave: (v) => onSaveField({ internal_code: v.trim() || null }) })} />
          </View>
        </View>

        <View style={styles.sideCell}>
          <GroupLabel
            action={
              <HoverPressable style={styles.linkBtn} hoverStyle={styles.softBtnHover} onPress={() => setDriversModalOpen(true)} accessibilityLabel="שינוי הנהגים המשויכים">
                <DText weight="semiBold" style={styles.linkText}>שינוי</DText>
              </HoverPressable>
            }
          >
            נהגים משויכים
          </GroupLabel>
          <View style={[styles.card, styles.driversCard]}>
            {drivers.length === 0 ? (
              <View style={styles.driversEmpty}>
                <DText style={styles.mutedText}>אין נהגים משויכים לרכב הזה</DText>
                <HoverPressable style={styles.softBtn} hoverStyle={styles.softBtnHover} pressStyle={styles.pressDown} onPress={() => setDriversModalOpen(true)}>
                  <Ionicons name="person-add-outline" size={16} color={DESKTOP_COLORS.brand} />
                  <DText weight="semiBold" style={styles.softBtnText}>שיוך נהג</DText>
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
        <DText weight="bold" style={styles.docsTitle}>מסמכים ותוקפים</DText>
        <DText style={styles.mutedText}>לחיצה על מסמך פותחת אותו, ושם אפשר להעלות גרסה חדשה</DText>
      </View>
      <View style={styles.gridRow}>
        <View style={styles.halfCell}>
          <GroupLabel>רישוי וביטוח</GroupLabel>
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
          <GroupLabel>בדיקות ובטיחות</GroupLabel>
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

function DriverRow({ driver, first, onPress }: { driver: VehicleDriverWithProfile; first: boolean; onPress: () => void }) {
  const fullName = driver.full_name ?? 'ללא שם';
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
  const license = driver.license_expiry ? expiryState(driver.license_expiry) : null;
  const licenseColor = license === 'expired' ? DESKTOP_TONES.bad.fg : license === 'soon' ? DESKTOP_TONES.warn.fg : DESKTOP_COLORS.inkMuted;

  return (
    <HoverPressable style={[styles.driverRow, !first && styles.rowDivider]} hoverStyle={styles.rowHover} onPress={onPress} accessibilityLabel={`פתיחת כרטיס הנהג ${fullName}`}>
      <View style={styles.avatar}>
        <DText weight="bold" style={styles.avatarText}>{initials}</DText>
      </View>
      <View style={styles.flex}>
        <DText weight="semiBold" style={styles.driverName} numberOfLines={1}>{fullName}</DText>
        {!!driver.phone && <DLtrText style={styles.mutedText}>{driver.phone}</DLtrText>}
        {license && (
          <View style={styles.inlineMeta}>
            <DText style={[styles.driverLicense, { color: licenseColor }]} weight={license === 'ok' ? 'regular' : 'semiBold'}>
              {license === 'expired' ? 'רישיון נהיגה פג ב־' : license === 'soon' ? 'רישיון נהיגה יפוג ב־' : 'רישיון נהיגה בתוקף עד '}
            </DText>
            <DLtrText style={[styles.driverLicense, { color: licenseColor }]} weight={license === 'ok' ? 'regular' : 'semiBold'}>{formatDate(driver.license_expiry)}</DLtrText>
          </View>
        )}
      </View>
      <Ionicons name="chevron-back" size={15} color={DESKTOP_COLORS.inkFaint} />
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
