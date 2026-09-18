import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  AcquisitionType,
  ComplianceItem,
  DocumentRow,
  Vehicle,
  VehicleDriverWithProfile,
  VehicleType,
} from '../../lib/adminApi';
import { ComplianceSection } from '../ComplianceSection';
import { DocumentFolderModal } from '../documents/DocumentFolderModal';
import { getDocumentUrl, listDocuments, uploadDocument } from '../../lib/documents';
import { chooseDocumentSource, pickDocumentSource, type DocumentSource } from '../../lib/documentActions';
import { showAlert } from '../../lib/platformAlert';
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
import { ISRAEL_COMMON_MANUFACTURERS } from '../../lib/manufacturers';
import { DesktopDateField, DesktopInput, DesktopSelect, DesktopSelectOption, DLtrText, DText, HoverPressable, StatusPill } from './primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, DesktopTone, webOnly } from './desktopTheme';

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

const EXPIRY_TONE_MAP: Record<ExpiryState, DesktopTone> = { ok: 'ok', soon: 'warn', expired: 'bad', missing: 'neutral', optional: 'neutral' };

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
  return { label, state, tone: EXPIRY_TONE_MAP[state], statusLabel: STATE_LABEL[state], detail: state === 'missing' ? 'לא הוזן' : `עד ${dateLabel}` };
}

const STATE_LABEL: Record<ExpiryState, string> = { ok: 'בתוקף', soon: 'קרוב לפוג', expired: 'פג תוקף', missing: 'חסר', optional: 'תקין' };

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
}) {
  const name = [vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') || formatPlate(vehicle.plate_number);
  const serviceRemaining = vehicle.next_service_km == null ? null : vehicle.next_service_km - vehicle.odometer;
  const serviceState: ExpiryState = serviceRemaining == null ? 'missing' : serviceRemaining <= 0 ? 'expired' : serviceRemaining <= 1000 ? 'soon' : 'ok';
  const serviceLabel = serviceRemaining == null ? 'לא הוגדר' : serviceRemaining <= 0 ? `חריגה ${Math.abs(serviceRemaining).toLocaleString()} קמ` : `${serviceRemaining.toLocaleString()} קמ נותרו`;
  const serviceTone = DESKTOP_TONES[EXPIRY_TONE_MAP[serviceState]];
  const serviceSpan = vehicle.next_service_km != null && vehicle.next_service_km > vehicle.last_service_km ? vehicle.next_service_km - vehicle.last_service_km : null;
  const servicePct = serviceSpan ? Math.min(100, Math.max(0, ((vehicle.odometer - vehicle.last_service_km) / serviceSpan) * 100)) : 100;

  const licenseCard = licensingCard(compliance, 'vehicle_license', 'רישיון רכב');
  const insuranceMandatoryCard = licensingCard(compliance, 'insurance_mandatory', 'ביטוח חובה');
  const insuranceComprehensiveCard = licensingCard(compliance, 'insurance_comprehensive', 'ביטוח מקיף');

  const isArchived = vehicle.status === 'archived';
  const statusTone: DesktopTone = isArchived ? 'neutral' : vehicle.status === 'active' ? 'ok' : 'warn';

  const [plateEditing, setPlateEditing] = React.useState(false);
  const [intervalDraft, setIntervalDraft] = React.useState<number | null>(null);
  const [driversModalOpen, setDriversModalOpen] = React.useState(false);

  const manufacturerOptions: DesktopSelectOption<string>[] = React.useMemo(() => {
    const names = ISRAEL_COMMON_MANUFACTURERS.map((m) => m.he);
    if (vehicle.manufacturer && !names.includes(vehicle.manufacturer)) names.push(vehicle.manufacturer);
    return names.sort((a, b) => a.localeCompare(b, 'he')).map((he) => ({ value: he, label: he }));
  }, [vehicle.manufacturer]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.columns}>
        <View style={styles.mainColumn}>
          <View style={styles.recordHeader}>
            <View style={styles.recordIdentity}>
              <View style={styles.avatar}>
                <Ionicons name="bus-outline" size={23} color={DESKTOP_COLORS.brand} />
              </View>
              <View style={styles.recordTitleBlock}>
                <View style={styles.recordTitleRow}>
                  <DText weight="bold" style={styles.vehicleName} numberOfLines={1}>{name}</DText>
                  <StatusPill tone={statusTone} label={VEHICLE_STATUS_LABELS[vehicle.status] ?? vehicle.status} />
                </View>
                <View style={styles.recordMeta}>
                  <DLtrText weight="semiBold" style={styles.plate}>{formatPlate(vehicle.plate_number)}</DLtrText>
                  <DText style={styles.metaDivider}>•</DText>
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
              <HoverPressable style={styles.deleteAction} hoverStyle={styles.deleteActionHover} pressStyle={styles.pressDown} onPress={onDelete}>
                <Ionicons name="trash-outline" size={15} color={DESKTOP_TONES.bad.fg} />
                <DText weight="semiBold" style={[styles.actionText, { color: DESKTOP_TONES.bad.fg }]}>מחיקת רכב</DText>
              </HoverPressable>
            </View>
          </View>

          <View style={styles.statusStrip}>
            <View style={styles.statCard}>
              <DText style={styles.statLabel}>ק״מ נוכחי</DText>
              <DText weight="bold" style={styles.statValue}>{vehicle.odometer.toLocaleString()}</DText>
            </View>
            <View style={styles.statCard}>
              <DText style={styles.statLabel}>תוקף רישוי</DText>
              <DText weight="bold" style={[styles.statValue, licenseCard.tone !== 'neutral' && { color: DESKTOP_TONES[licenseCard.tone].fg }]} numberOfLines={1}>
                {licenseCard.detail === 'לא הוזן' ? 'חסר' : licenseCard.detail.replace('עד ', '')}
              </DText>
            </View>
            <View style={[styles.statCard, styles.statCardWide]}>
              <View style={styles.progressHeader}>
                <DText style={styles.statLabel}>עד לטיפול הבא</DText>
                <DText weight="bold" style={[styles.progressValue, { color: serviceTone.fg }]}>{serviceLabel}</DText>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${servicePct}%`, backgroundColor: serviceTone.fg }]} />
              </View>
            </View>
            <AssignedDriversStat drivers={drivers} onManage={() => setDriversModalOpen(true)} />
          </View>

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

          <Section title="רישוי, ביטוח וטסט">
            <View style={styles.licensingGrid}>
              <LicensingCard {...licenseCard} />
              <LicensingCard {...insuranceMandatoryCard} />
              <LicensingCard {...insuranceComprehensiveCard} />
            </View>
          </Section>

          <Section title="תחזוקה וטיפולים">
            <View style={styles.embedWrap}>
              <View style={styles.card}>
                <DText weight="bold" style={styles.cardTitle}>פרטי תחזוקה</DText>
                <View style={styles.maintenanceGrid}>
                  <EditableTextField
                    label="מד אוץ נוכחי"
                    value={`${vehicle.odometer.toLocaleString()} קמ`}
                    raw={String(vehicle.odometer ?? '')}
                    ltr
                    compact
                    keyboardType="number-pad"
                    parse={(v) => v.replace(/\D/g, '')}
                    onSave={(v) => onSaveField({ odometer: v ? Number(v) : 0 })}
                  />
                  <Field label="עודכן לאחרונה" value={vehicle.odometer_updated_at ? formatDate(vehicle.odometer_updated_at) : '—'} ltr compact />
                  <EditableTextField
                    label="קמ בטיפול האחרון"
                    value={`${vehicle.last_service_km.toLocaleString()} קמ`}
                    raw={String(vehicle.last_service_km ?? '')}
                    ltr
                    compact
                    keyboardType="number-pad"
                    parse={(v) => v.replace(/\D/g, '')}
                    onSave={(v) => onSaveField({ last_service_km: v ? Number(v) : 0 })}
                  />
                  <EditableTextField
                    label="טווח קמ בין טיפולים"
                    value={vehicle.service_interval_km ? `${vehicle.service_interval_km.toLocaleString()} קמ` : '—'}
                    raw={vehicle.service_interval_km ? String(vehicle.service_interval_km) : ''}
                    ltr
                    compact
                    keyboardType="number-pad"
                    parse={(v) => v.replace(/\D/g, '')}
                    onDraftChange={(v) => setIntervalDraft(v ? Number(v) : null)}
                    onSave={(v) => {
                      const interval = v ? Number(v) : null;
                      return onSaveField(
                        interval != null ? { service_interval_km: interval, next_service_km: vehicle.odometer + interval } : { service_interval_km: null }
                      );
                    }}
                  />
                  <EditableTextField
                    label="קמ לטיפול הבא"
                    value={
                      intervalDraft != null
                        ? `${(vehicle.odometer + intervalDraft).toLocaleString()} קמ`
                        : vehicle.next_service_km ? `${vehicle.next_service_km.toLocaleString()} קמ` : '—'
                    }
                    raw={vehicle.next_service_km ? String(vehicle.next_service_km) : ''}
                    ltr
                    compact
                    keyboardType="number-pad"
                    parse={(v) => v.replace(/\D/g, '')}
                    onSave={(v) => onSaveField({ next_service_km: v ? Number(v) : null })}
                  />
                </View>
              </View>
            </View>
          </Section>

          <Section title="מסמכים">
            <View style={styles.embedWrap}>
              <ComplianceSection
                companyId={companyId}
                ownerType="vehicle"
                ownerId={vehicleId}
                focusItemType={focusItem}
                spacious
                folderAppearance
                desktopModal
                hiddenItemTypes={['insurance_mandatory', 'insurance_comprehensive', 'annual_test']}
                extraFolderTiles={<DocumentFolderGrid companyId={companyId} vehicleId={vehicleId} documentFolders={documentFolders} />}
              />
            </View>
          </Section>

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

function AssignedDriversStat({ drivers, onManage }: { drivers: VehicleDriverWithProfile[]; onManage: () => void }) {
  const names = drivers.map((driver) => driver.full_name ?? 'ללא שם');
  const compactNames = names.slice(0, 2);

  return (
    <View style={[styles.statCard, styles.assignedDriversStat]}>
      <View style={styles.assignedDriversHeaderRow}>
        <DText style={styles.statLabel}>נהגים משויכים</DText>
        <HoverPressable style={styles.editIconBtn} hoverStyle={styles.showMoreDriversHover} pressStyle={styles.pressDown} onPress={onManage} accessibilityLabel="עריכת הנהגים המשויכים">
          <Ionicons name={names.length >= 3 ? 'chevron-back' : 'create-outline'} size={13} color={DESKTOP_COLORS.brand} />
        </HoverPressable>
      </View>
      {names.length === 0 ? (
        <DText weight="semiBold" style={styles.noDriversValue}>אין נהגים משויכים</DText>
      ) : (
        <>
          <View style={styles.assignedDriverCountRow}>
            <DText weight="bold" style={styles.statValue}>{names.length}</DText>
            {names.length === 1 && <DText weight="semiBold" style={styles.singleDriverName} numberOfLines={1}>{names[0]}</DText>}
          </View>
          {names.length >= 2 && (
            <View style={styles.driverNamesList}>
              {compactNames.map((name, index) => <DText key={`${name}-${index}`} style={styles.driverName} numberOfLines={1}>{name}</DText>)}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <DText weight="bold" style={styles.sectionTitle}>{title}</DText>
      {children}
    </View>
  );
}

function Field({ label, value, ltr, compact }: { label: string; value: string; ltr?: boolean; compact?: boolean }) {
  const TextComponent = ltr ? DLtrText : DText;
  return (
    <View style={[styles.field, compact && styles.maintenanceField]}>
      <DText style={styles.fieldGridLabel}>{label}</DText>
      <TextComponent weight="semiBold" style={styles.fieldGridValue} numberOfLines={1}>{value}</TextComponent>
    </View>
  );
}

/**
 * Shell shared by every per-field editor below — a single field in
 * {@link Field}'s read layout that can be clicked into an inline editor with
 * its own confirm/cancel, so editing one value never puts a whole section's
 * worth of other fields into edit mode at once.
 */
function EditableFieldShell({
  label,
  displayValue,
  ltr,
  plate,
  editing,
  onStartEdit,
  onCancel,
  onConfirm,
  saving,
  error,
  compact,
  children,
}: {
  label: string;
  displayValue: string;
  ltr?: boolean;
  plate?: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  saving: boolean;
  error: string | null;
  compact?: boolean;
  children: React.ReactNode;
}) {
  const ValueText = ltr ? DLtrText : DText;

  if (!editing) {
    return (
      <View style={[styles.field, compact && styles.maintenanceField]}>
        <DText style={styles.fieldGridLabel}>{label}</DText>
        <View style={styles.readFieldRow}>
          {plate ? (
            <View style={styles.plateBadge}>
              <View style={styles.plateBadgeFlag}>
                <DText weight="bold" style={styles.plateBadgeFlagText}>IL</DText>
              </View>
              <DLtrText weight="bold" style={styles.plateBadgeText} numberOfLines={1}>{displayValue}</DLtrText>
            </View>
          ) : (
            <ValueText weight="semiBold" style={styles.fieldGridValue} numberOfLines={1}>{displayValue}</ValueText>
          )}
          <HoverPressable hoverStyle={styles.rowHover} onPress={onStartEdit} accessibilityLabel={`עריכת ${label}`}>
            <Ionicons name="create-outline" size={12} color={DESKTOP_COLORS.inkFaint} />
          </HoverPressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.field, compact && styles.maintenanceField, styles.fieldEditing]}>
      <DText style={styles.fieldGridLabel}>{label}</DText>
      <View style={styles.inlineEditRow}>
        <View style={styles.inlineEditControl}>{children}</View>
        <HoverPressable style={[styles.inlineConfirmBtn, saving && styles.disabled]} hoverStyle={styles.saveChipHover} pressStyle={styles.pressDown} onPress={onConfirm} disabled={saving}>
          <Ionicons name="checkmark" size={13} color="#FFFFFF" />
        </HoverPressable>
        <HoverPressable style={styles.inlineCancelBtn} hoverStyle={styles.rowHover} onPress={onCancel}>
          <Ionicons name="close" size={13} color={DESKTOP_COLORS.inkMuted} />
        </HoverPressable>
      </View>
      {!!error && <DText style={styles.fieldError}>{error}</DText>}
    </View>
  );
}

function EditableTextField({
  label,
  value,
  raw,
  ltr,
  plate,
  keyboardType,
  parse = (v: string) => v,
  format,
  validate,
  onSave,
  onEditingChange,
  onDraftChange,
  compact,
}: {
  label: string;
  value: string;
  raw: string;
  ltr?: boolean;
  plate?: boolean;
  keyboardType?: 'default' | 'number-pad';
  parse?: (v: string) => string;
  format?: (v: string) => string;
  validate?: (v: string) => string | null;
  onSave: (v: string) => Promise<string | null>;
  onEditingChange?: (editing: boolean) => void;
  /** Fired on every keystroke (with the parsed draft), before save — for fields whose live value drives a preview elsewhere on the screen. */
  onDraftChange?: (v: string) => void;
  compact?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(raw);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const start = () => { setDraft(raw); setError(null); setEditing(true); onEditingChange?.(true); onDraftChange?.(raw); };
  const cancel = () => { setEditing(false); onEditingChange?.(false); onDraftChange?.(raw); };
  const confirm = async () => {
    const validationError = validate?.(draft) ?? null;
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    const err = await onSave(draft);
    setSaving(false);
    if (err) { setError(err); return; }
    setEditing(false);
    onEditingChange?.(false);
  };

  return (
    <EditableFieldShell label={label} displayValue={value} ltr={ltr} plate={plate} compact={compact} editing={editing} onStartEdit={start} onCancel={cancel} onConfirm={confirm} saving={saving} error={error}>
      <DesktopInput
        value={format ? format(draft) : draft}
        onChangeText={(v) => {
          const parsed = parse(v);
          setDraft(parsed);
          onDraftChange?.(parsed);
        }}
        ltr={ltr}
        keyboardType={keyboardType}
        hasError={!!error}
      />
    </EditableFieldShell>
  );
}

function EditableSelectField<T extends string>({
  label,
  value,
  raw,
  options,
  allowClear,
  placeholder,
  onSave,
}: {
  label: string;
  value: string;
  raw: T | null;
  options: DesktopSelectOption<T>[];
  allowClear?: boolean;
  placeholder?: string;
  onSave: (v: T | null) => Promise<string | null>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<T | null>(raw);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const start = () => { setDraft(raw); setError(null); setEditing(true); };
  const cancel = () => setEditing(false);
  const confirm = async () => {
    setSaving(true);
    const err = await onSave(draft);
    setSaving(false);
    if (err) { setError(err); return; }
    setEditing(false);
  };

  return (
    <EditableFieldShell label={label} displayValue={value} editing={editing} onStartEdit={start} onCancel={cancel} onConfirm={confirm} saving={saving} error={error}>
      <DesktopSelect value={draft} onChange={setDraft} options={options} allowClear={allowClear} placeholder={placeholder} hasError={!!error} />
    </EditableFieldShell>
  );
}

function EditableDateField({
  label,
  value,
  raw,
  onSave,
}: {
  label: string;
  value: string;
  raw: string | null;
  onSave: (v: string | null) => Promise<string | null>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<string | null>(raw);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const start = () => { setDraft(raw); setError(null); setEditing(true); };
  const cancel = () => setEditing(false);
  const confirm = async () => {
    setSaving(true);
    const err = await onSave(draft);
    setSaving(false);
    if (err) { setError(err); return; }
    setEditing(false);
  };

  return (
    <EditableFieldShell label={label} displayValue={value} ltr editing={editing} onStartEdit={start} onCancel={cancel} onConfirm={confirm} saving={saving} error={error}>
      <DesktopDateField value={draft} onChange={setDraft} hasError={!!error} />
    </EditableFieldShell>
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

  const start = () => { setMonth(rawMonth); setYear(rawYear); setError(null); setEditing(true); };
  const cancel = () => setEditing(false);
  const confirm = async () => {
    setSaving(true);
    const err = await onSave(month, year);
    setSaving(false);
    if (err) { setError(err); return; }
    setEditing(false);
  };

  return (
    <EditableFieldShell label={label} displayValue={value} ltr editing={editing} onStartEdit={start} onCancel={cancel} onConfirm={confirm} saving={saving} error={error}>
      <View style={styles.yearMonthRow}>
        <DesktopInput value={month} onChangeText={(v) => setMonth(v.replace(/\D/g, '').slice(0, 2))} placeholder="חודש" ltr style={styles.monthInput} />
        <DesktopInput value={year} onChangeText={(v) => setYear(v.replace(/\D/g, '').slice(0, 4))} placeholder="שנה" ltr style={styles.yearInput} />
      </View>
    </EditableFieldShell>
  );
}

function LicensingCard({ label, tone, statusLabel, detail }: { label: string; tone: DesktopTone; statusLabel: string; detail: string }) {
  const toneColors = DESKTOP_TONES[tone];
  return (
    <View style={styles.licensingCard}>
      <View style={styles.licensingCardHeader}>
        <DText style={styles.statLabel}>{label}</DText>
        <View style={[styles.dot, tone !== 'neutral' && { backgroundColor: toneColors.fg }]} />
      </View>
      <DText weight="bold" style={[styles.licensingStatus, tone !== 'neutral' && { color: toneColors.fg }]}>{statusLabel}</DText>
      <DText style={styles.licensingDetail}>{detail}</DText>
    </View>
  );
}

function DocumentFolderGrid({
  companyId,
  vehicleId,
  documentFolders,
}: {
  companyId: string;
  vehicleId: string;
  documentFolders: readonly VehicleDocumentFolder[];
}) {
  const [allDocs, setAllDocs] = useState<DocumentRow[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [openFolder, setOpenFolder] = useState<VehicleDocumentFolder | null>(null);
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = React.useCallback(async () => {
    const docs = await listDocuments('vehicle', vehicleId).catch(() => []);
    setAllDocs(docs);

    const byCategory = new Map<string, typeof docs>();
    for (const doc of docs) byCategory.set(doc.category, [...(byCategory.get(doc.category) ?? []), doc]);

    const entries = await Promise.all(
      Array.from(byCategory.entries()).map(async ([category, list]) => {
        const image = list.find((d) => d.mime_type?.startsWith('image/'));
        if (!image) return [category, null] as const;
        const url = await getDocumentUrl(image).catch(() => null);
        return [category, url] as const;
      })
    );
    const nextThumbs: Record<string, string> = {};
    for (const [category, url] of entries) if (url) nextThumbs[category] = url;
    setThumbnails(nextThumbs);
  }, [vehicleId]);

  useEffect(() => {
    load();
  }, [load]);

  const counts: Record<string, number> = {};
  for (const doc of allDocs) counts[doc.category] = (counts[doc.category] ?? 0) + 1;

  const addDocument = async () => {
    if (!openFolder) return;
    if (openFolder.requiresExpiry && !expiryDate) {
      showAlert('חסר תוקף', 'יש לבחור תאריך תוקף למסמך לפני ההעלאה');
      return;
    }
    chooseDocumentSource(openFolder.title, async (source: DocumentSource) => {
      setUploading(true);
      try {
        const file = await pickDocumentSource(source);
        if (!file) return;
        await uploadDocument({
          companyId,
          ownerType: 'vehicle',
          ownerId: vehicleId,
          category: openFolder.category,
          title: openFolder.title,
          file,
          expiryDate: openFolder.requiresExpiry ? expiryDate : null,
        });
        if (openFolder.requiresExpiry) setExpiryDate(null);
        await load();
      } catch (err: any) {
        showAlert('העלאה נכשלה', err?.message ?? 'נסה שוב');
      } finally {
        setUploading(false);
      }
    });
  };

  return (
    <>
      {documentFolders.map((folder) => {
        const thumbnail = thumbnails[folder.category];
        const count = counts[folder.category] ?? 0;
        return (
          <HoverPressable key={folder.category} style={styles.folderTile} hoverStyle={styles.folderTileHover} pressStyle={styles.pressDown} onPress={() => setOpenFolder(folder)}>
            {thumbnail ? (
              <Image source={{ uri: thumbnail }} style={styles.folderTileThumb} resizeMode="cover" />
            ) : (
              <View style={[styles.folderTileThumb, styles.folderTileIconWrap, { backgroundColor: `${folder.color}1F` }]}>
                <Ionicons name={folder.icon} size={24} color={folder.color} />
              </View>
            )}
            <DText weight="semiBold" style={styles.folderTileLabel} numberOfLines={1}>{folder.title}</DText>
            <DText style={styles.folderTileCount}>{count > 0 ? `${count} מסמכים` : 'אין מסמכים'}</DText>
          </HoverPressable>
        );
      })}

      {openFolder && (
        <DocumentFolderModal
          visible
          title={openFolder.title}
          docs={allDocs.filter((d) => d.category === openFolder.category)}
          onClose={() => setOpenFolder(null)}
          onDeleted={load}
          footer={
            <View style={styles.folderUploadRow}>
              {openFolder.requiresExpiry && (
                <View style={styles.folderExpiryField}>
                  <DesktopDateField value={expiryDate} onChange={setExpiryDate} placeholder="תוקף המסמך" />
                </View>
              )}
              <HoverPressable style={styles.folderUploadBtn} hoverStyle={styles.folderUploadBtnHover} pressStyle={styles.pressDown} onPress={addDocument} disabled={uploading}>
                <Ionicons name="cloud-upload-outline" size={13} color={DESKTOP_COLORS.brand} />
                <DText weight="semiBold" style={styles.folderUploadText}>{uploading ? 'מעלה…' : 'העלה מסמך'}</DText>
              </HoverPressable>
            </View>
          }
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  pressDown: { transform: [{ scale: 0.97 }] },
  root: { flex: 1 },
  content: { padding: 22, paddingBottom: 48, maxWidth: 1440, width: '100%', alignSelf: 'center' },
  columns: { width: '100%' },
  mainColumn: { flex: 1, gap: 14, minWidth: 0 },

  recordHeader: { minHeight: 76, backgroundColor: DESKTOP_COLORS.surface, borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.border, paddingHorizontal: 18, paddingVertical: 13, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 18 },
  recordIdentity: { flexDirection: 'row-reverse', alignItems: 'center', flex: 1, minWidth: 0, gap: 11 },
  avatar: { width: 44, height: 44, borderRadius: 10, backgroundColor: DESKTOP_COLORS.brandFocusRing, alignItems: 'center', justifyContent: 'center' },
  recordTitleBlock: { minWidth: 0, gap: 4 },
  recordTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  vehicleName: { fontSize: 17, letterSpacing: -0.15 },
  recordMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  plate: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  recordType: { fontSize: 12, color: DESKTOP_COLORS.inkFaint },
  metaDivider: { fontSize: 12, color: DESKTOP_COLORS.borderInput },
  headerActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexShrink: 0 },
  secondaryAction: { height: 32, paddingHorizontal: 10, borderWidth: 1, borderColor: DESKTOP_COLORS.borderInput, borderRadius: 7, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, ...webOnly({ transition: 'background-color 150ms ease, border-color 150ms ease' }) },
  deleteAction: { height: 32, paddingHorizontal: 10, borderWidth: 1, borderColor: 'rgba(213,37,28,0.22)', borderRadius: 7, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, ...webOnly({ transition: 'background-color 150ms ease' }) },
  deleteActionHover: { backgroundColor: DESKTOP_TONES.bad.bg },
  actionText: { fontSize: 12, color: DESKTOP_COLORS.inkMuted },

  statusStrip: { flexDirection: 'row-reverse', gap: 1, backgroundColor: DESKTOP_COLORS.border },
  statCard: { flex: 1, backgroundColor: DESKTOP_COLORS.surface, paddingHorizontal: 16, paddingVertical: 13, minHeight: 72 },
  statCardWide: { flex: 2.1 },
  assignedDriversStat: { minWidth: 190 },
  statLabel: { fontSize: 12, color: DESKTOP_COLORS.inkFaint },
  statValue: { fontSize: 18, marginTop: 4 },
  noDriversValue: { fontSize: 13, marginTop: 7, color: DESKTOP_COLORS.inkMuted },
  assignedDriverCountRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  singleDriverName: { flex: 1, fontSize: 13.5, marginTop: 4 },
  driverNamesList: { gap: 2, marginTop: 4 },
  driverName: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  assignedDriversHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  editIconBtn: { width: 20, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease' }) },
  showMoreDriversHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  driversModalContent: { paddingHorizontal: 18, paddingVertical: 14 },

  progressHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'baseline' },
  progressValue: { fontSize: 12.5 },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: DESKTOP_COLORS.surfaceMuted, marginTop: 9, overflow: 'hidden' },
  progressTrackLarge: { height: 9, marginTop: 12 },
  progressFill: { height: '100%', borderRadius: 4, ...webOnly({ transition: 'width 300ms ease' }) },
  progressFooter: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 8 },

  section: { gap: 8, marginTop: 4 },
  sectionTitle: { fontSize: 12, color: DESKTOP_COLORS.inkFaint, letterSpacing: 0.2 },

  card: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 10, padding: 18, gap: 10 },
  cardTitle: { fontSize: 14 },
  cardHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  saveChipHover: { opacity: 0.88 },

  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 4 },
  field: { width: '31.7%', minWidth: 150, gap: 4, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  maintenanceGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12, marginTop: 2 },
  maintenanceField: { flexGrow: 1, flexBasis: 150, width: 'auto', minWidth: 150, paddingBottom: 8 },
  fieldEditing: { position: 'relative', zIndex: 100, elevation: 100 },
  fieldGridLabel: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint },
  fieldGridValue: { fontSize: 13.5 },
  fieldError: { fontSize: 11, color: DESKTOP_TONES.bad.fg, marginTop: 3 },

  readFieldRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginHorizontal: -6, paddingHorizontal: 6, borderRadius: 5, ...webOnly({ transition: 'background-color 150ms ease' }) },
  plateBadge: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 24,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#0F1114',
    backgroundColor: '#F7CB27',
    overflow: 'hidden',
  },
  plateBadgeFlag: { width: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1C4FA0' },
  plateBadgeFlagText: { fontSize: 7, color: '#FFFFFF' },
  plateBadgeText: { fontSize: 13.5, color: '#0F1114', paddingHorizontal: 8, letterSpacing: 0.5 },
  inlineEditRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  inlineEditControl: { flex: 1 },
  inlineConfirmBtn: { width: 26, height: 26, borderRadius: 6, backgroundColor: DESKTOP_COLORS.brand, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'opacity 150ms ease' }) },
  inlineCancelBtn: { width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: DESKTOP_COLORS.borderInput, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease' }) },

  lookupIconBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 10, borderRadius: 7, borderWidth: 1, borderColor: DESKTOP_COLORS.borderInput, ...webOnly({ transition: 'background-color 150ms ease' }) },
  yearMonthRow: { flexDirection: 'row-reverse', gap: 6 },
  monthInput: { width: 56 },
  yearInput: { width: 68 },
  lookupMessage: { fontSize: 11.5, color: DESKTOP_COLORS.inkMuted, marginTop: -4 },

  rowBorder: { borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },

  editMaintText: { fontSize: 12.5, color: DESKTOP_COLORS.brand },

  disabled: { opacity: 0.5 },

  embedWrap: { gap: 14 },
  folderRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 46, ...webOnly({ transition: 'background-color 150ms ease' }) },
  folderIcon: { width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  folderLabel: { flex: 1, fontSize: 12.5 },
  folderGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  folderTile: {
    width: 150,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderSoft,
    borderRadius: 8,
    padding: 8,
    gap: 6,
    ...webOnly({ transition: 'background-color 150ms ease, border-color 150ms ease' }),
  },
  folderTileHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  folderTileThumb: { width: '100%', height: 64, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  folderTileIconWrap: {},
  folderTileLabel: { fontSize: 12.5 },
  folderTileCount: { fontSize: 11, color: DESKTOP_COLORS.inkFaint },
  folderUploadRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  folderExpiryField: { width: 150 },
  folderUploadBtn: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    ...webOnly({ transition: 'background-color 150ms ease' }),
  },
  folderUploadBtnHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  folderUploadText: { fontSize: 12.5, color: DESKTOP_COLORS.brand },

  licensingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  licensingCard: { flexBasis: 220, flexGrow: 1, backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 10, padding: 15 },
  licensingCardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: DESKTOP_COLORS.borderInput, marginTop: 3 },
  licensingStatus: { fontSize: 16, marginTop: 9 },
  licensingDetail: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint, marginTop: 3 },
});
