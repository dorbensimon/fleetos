// תיק נהג - תצוגת מחשב
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DriverDetails, DriverRow } from '../../lib/adminApi';
import type { LicenseUpdateRequest } from '../../lib/licenseUpdate';
import { signingFolderStatus } from '../../lib/signingFolders';
import { maskNationalId } from '../driverCard/buildDriverDetailGroups';
import { ExpiryState, expiryState, formatDate, parseDateValue } from '../../lib/theme';
import { isValidIsraeliPhone } from '../../lib/phone';
import { dateOnlyIsoFromLocalDate, isValidIsraeliNationalId } from '../../lib/driverFormValidation';
import { isValidEmail } from '../../lib/validation';
import {
  EDUCATION_OPTIONS,
  storedValueLabel,
  joinLicenseClasses,
  LICENSE_CLASS_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  optionsWithCurrent,
  splitLicenseClasses,
} from '../../lib/driverFields';
import { DLtrText, DText, HoverPressable, prefersReducedMotion, StatusPill } from './primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, DesktopTone, webOnly } from './desktopTheme';
import { DocumentFolderUploadModal, EASE_OUT, OverflowMenu, useOwnerDocuments, type RecordDocumentFolder } from './record/RecordKit';
import { expiryStatusText, FolderListRow } from './record/FolderDocuments';
import { DetailRow, EditableSection, Fact, FieldEditDialog, GroupLabel, NIGHT_TONES, pageStyles, type FieldEditor, type TextFieldEditor } from './record/RecordPage';
import { DriverLicenseModal } from './driver/DriverLicenseModal';
import { LICENSE_SIDE_STORED_TITLE } from '../../lib/licenseSides';
import { DRIVER_DOCUMENT_GROUPS, type DriverDocumentFolder } from '../../lib/driverDocumentFolders';
import { PROCEDURE_6_CATEGORY } from '../../lib/procedure6Report';
import { TRAFFIC_REPORTS_CATEGORY } from '../../lib/trafficReports';
import { folderCategory, isCompanyFolderCategory, useCompanyFolders } from '../../lib/companyFolders';
import { DriverVehiclesCard, MiniPlate } from './driver/DriverVehiclesCard';
import { DesktopModal } from './DesktopModal';
import { formatPlate } from '../../lib/plate';
import { DriverVehicleHistoryButton } from './driver/DriverVehicleHistory';
import { NewFormButton, DriverSigningList, useDriverSigningFolders, type SigningSessionTarget } from './driver/DriverSigningSection';
import { t, dirIcon } from '../../lib/i18n';

/**
 * Desktop body of the driver card ("תיק נהג"), built like the vehicle card
 * (VehicleDetailDesktopView) so an office admin meets one page pattern:
 *
 * 1. A compact header — status, name, the three things people ask about
 *    (licence expiry, licence classes, years in the company) and a "⋯" actions menu.
 * 2. One amber notice for anything that needs the admin: an expiring
 *    licence, a licence update to approve, a form waiting for a signature.
 * 3. Personal details as tappable rows (each opens a small edit window) next
 *    to the driving licence — drawn as a licence card that opens the licence
 *    photos — then work details next to the assigned vehicles.
 * 4. Forms to sign and the document folders, as calm lists.
 *
 * Every value appears once. Calling / messaging the driver is left to the
 * phone app. The phone keeps its own driver card; this component is desktop-only.
 */

type DriverPatch = Partial<DriverDetails> & { full_name?: string | null; phone?: string | null };

// תיקיית תמונות הרישיון
const LICENSE_FOLDER = 'license_docs';

// תיקיות המסמכים של הנהג
/** Every driver folder asks for a valid-until date; some only optionally (lib/driverDocumentFolders.ts). */
const recordFolder = (folder: DriverDocumentFolder): RecordDocumentFolder => ({
  ...folder,
  requiresExpiry: folder.expiry === 'required',
  optionalExpiry: folder.expiry === 'optional',
});
const DOCUMENT_FOLDERS = (): RecordDocumentFolder[] => DRIVER_DOCUMENT_GROUPS.flatMap((group) => group.folders.map(recordFolder));
// Dated folders show the current file and its history; procedure 6 lists each event.
const folderLayout = (folder: RecordDocumentFolder) => (folder.category === PROCEDURE_6_CATEGORY || folder.category === TRAFFIC_REPORTS_CATEGORY ? 'records' : folder.requiresExpiry ? 'versions' : 'gallery');
// קבוצות התיקיות
// The two short groups sit last, so the three columns end as evenly as possible.
const DOCUMENT_GROUPS = [...DRIVER_DOCUMENT_GROUPS].sort((a, b) => b.folders.length - a.folders.length);

// דרגות הרישיון לבחירה בחלון העריכה
// The form's labels carry full weight/passenger limits; the edit window shows only the class and its name.
const LICENSE_CLASS_SELECT = () => LICENSE_CLASS_OPTIONS.map((option) => ({ value: option.value, label: option.label.split(',')[0].trim() }));

// צבע לפי מצב תוקף
const EXPIRY_COLOR: Partial<Record<ExpiryState, string>> = {
  expired: DESKTOP_TONES.bad.fg,
  soon: DESKTOP_TONES.warn.fg,
};

// כמה חודשים עברו מתאריך
/** Whole months from a date until today. */
function monthsSince(date: string): number {
  const from = parseDateValue(date);
  const now = new Date();
  let months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  if (now.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

// כמה זמן עבר, במילים
/** "7.5 שנים", "8 חודשים" — how long ago a date was, in plain words. */
function tenure(date: string | null | undefined): { value: string; unit: string } | null {
  if (!date) return null;
  const months = monthsSince(date);
  if (months < 12) return { value: String(months), unit: months === 1 ? t('date.month') : t('common.months') };
  const years = Math.floor((months / 12) * 2) / 2;
  return { value: Number.isInteger(years) ? String(years) : years.toFixed(1), unit: years === 1 ? t('date.year') : t('common.years') };
}

// ראשי תיבות
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || '?';

// התיק: כותרת, פרטים, רישיון, רכבים, מסמכים וטפסים
export function DriverDetailDesktopView({
  driverId,
  companyId,
  driver,
  departmentName,
  departmentOptions,
  isArchived,
  pendingActivation,
  pendingActivationDays,
  pendingLicenseRequest,
  reviewingLicense,
  onReviewLicense,
  canSendSigning,
  onSaveField,
  onSaveEmail,
  onOpenVehicle,
  onVehiclesChanged,
  onOpenSigningSession,
  openFolder: openFolderRequest,
  onFolderOpened,
  onResetPassword,
  onExportReport,
  exportingReport,
  archiving,
  restoring,
  onArchive,
  onRestore,
}: {
  driverId: string;
  companyId: string;
  driver: DriverRow | null;
  departmentName: string | null;
  departmentOptions: { value: string; label: string }[];
  isArchived: boolean;
  pendingActivation: boolean;
  pendingActivationDays: number | null;
  pendingLicenseRequest: LicenseUpdateRequest | null;
  reviewingLicense: boolean;
  onReviewLicense: (approve: boolean) => void;
  canSendSigning: boolean;
  /** Saves one field; resolves to an error message or null. */
  onSaveField: (patch: DriverPatch) => Promise<string | null>;
  onSaveEmail: (email: string) => Promise<string | null>;
  onOpenVehicle: (vehicleId: string) => void;
  /** A vehicle was linked or unlinked on this page. */
  onVehiclesChanged?: () => void;
  onOpenSigningSession: (target: SigningSessionTarget) => void;
  /** A document category to open on arrival (from a notification); `license_docs` opens the license. */
  openFolder?: string | null;
  onFolderOpened?: () => void;
  /** Kept for the shared screen; every field is edited in place on desktop. */
  onEdit?: () => void;
  onResetPassword: () => void;
  /** Kept for the shared screen; calling and messaging are done from the phone. */
  onCall?: () => void;
  onMessage?: () => void;
  onExportReport: () => void;
  exportingReport: boolean;
  archiving: boolean;
  restoring: boolean;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const name = driver?.full_name?.trim() || t('common.unnamed');
  const statusTone: DesktopTone = isArchived ? 'neutral' : pendingActivation ? 'warn' : 'ok';
  const statusLabel = isArchived ? t('common.archived') : pendingActivation ? t('driver.awaitingFirstLogin') : t('driver.activeInApp');

  const { docs, loaded: docsLoaded, reload: reloadDocs } = useOwnerDocuments('driver', driverId);
  const signing = useDriverSigningFolders(companyId, driverId);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [vehiclesOpen, setVehiclesOpen] = useState(false);
  const [openFolder, setOpenFolder] = useState<RecordDocumentFolder | null>(null);
  // The folders the owner added to this company's driver files.
  const { folders: companyFolders } = useCompanyFolders(companyId, 'driver');
  const extraFolders: RecordDocumentFolder[] = companyFolders.map((folder) => ({
    category: folderCategory(folder),
    title: folder.title,
    icon: 'folder-outline',
    requiresExpiry: folder.tracks_expiry,
  }));
  const [signingRequest, setSigningRequest] = useState<string | null>(null);
  const [editor, setEditor] = useState<FieldEditor | null>(null);
  const [showNationalId, setShowNationalId] = useState(false);

  useEffect(() => {
    if (!openFolderRequest) return;
    if (openFolderRequest === LICENSE_FOLDER) setLicenseOpen(true);
    else {
      const folder = [...DOCUMENT_FOLDERS(), ...extraFolders].find((f) => f.category === openFolderRequest);
      // The owner's folders arrive a moment later: wait for them.
      if (!folder && isCompanyFolderCategory(openFolderRequest)) return;
      if (folder) setOpenFolder(folder);
    }
    onFolderOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFolderRequest, onFolderOpened, companyFolders]);

  const licenseExpiry = driver?.license_expiry ?? null;
  const licenseState = expiryState(licenseExpiry);
  const licenseColor = EXPIRY_COLOR[licenseState];
  const licensePhotos = docs.filter((doc) => doc.category === LICENSE_FOLDER);
  const hasSide = (side: 'front' | 'back') => licensePhotos.some((doc) => doc.title === LICENSE_SIDE_STORED_TITLE[side]);
  const license = splitLicenseClasses(driver?.license_classes);
  const classesLabel = joinLicenseClasses(license.primary, license.secondary);
  const vehicles = driver?.vehicles ?? [];
  const inCompany = tenure(driver?.employment_start_date);
  const age = driver?.birth_date ? Math.floor(monthsSince(driver.birth_date) / 12) : null;

  // "דרוש טיפול": an expired or expiring licence, and the two things only an
  // admin can move forward here.
  type Alert = { key: string; tag: string; tone: 'warn' | 'bad'; text: string; date?: string | null; open: () => void };
  const alerts: Alert[] = [];
  if (licenseState === 'expired' || licenseState === 'soon') {
    alerts.push({
      key: 'license',
      tag: expiryStatusText(licenseState, licenseExpiry),
      tone: licenseState === 'expired' ? 'bad' : 'warn',
      text: licenseState === 'expired' ? t('driver.licenseExpiredOnPrefix') : t('driver.licenseWillExpireOn'),
      date: licenseExpiry,
      open: () => setLicenseOpen(true),
    });
  }
  if (!driver?.employment_end_date || driver.employment_end_date >= dateOnlyIsoFromLocalDate(new Date())) {
    for (const [key, label, value] of [
      ['work_at_height_expiry', t('driver.workAtHeightExpiry'), driver?.work_at_height_expiry],
      ['port_entry_expiry', t('driver.portEntryExpiry'), driver?.port_entry_expiry],
      ['forklift_refresher_expiry', t('driver.forkliftRefresherExpiry'), driver?.forklift_refresher_expiry],
      ['hazmat_permit_expiry', t('driver.hazmatPermitExpiry'), driver?.hazmat_approved ? driver.hazmat_permit_expiry : null],
    ] as const) {
      const state = expiryState(value);
      if (state !== 'expired' && state !== 'soon') continue;
      alerts.push({ key, tag: expiryStatusText(state, value ?? null), tone: state === 'expired' ? 'bad' : 'warn', text: label, date: value, open: () => setEditor(dateEditor(label, value ?? null, (v) => onSaveField({ [key]: v }))) });
    }
  }
  if (pendingLicenseRequest) {
    alerts.push({ key: 'license-request', tag: t('common.awaitingApproval'), tone: 'warn', text: t('driver.sentRenewedLicense'), open: () => setLicenseOpen(true) });
  }
  for (const folder of signing.folders) {
    const status = signingFolderStatus(folder);
    if (status !== 'pending' && status !== 'failed') continue;
    alerts.push({
      key: `signing-${folder.id}`,
      tag: status === 'pending' ? t('signing.pendingSignature') : t('signing.sendFailed'),
      tone: status === 'pending' ? 'warn' : 'bad',
      text: folder.title,
      open: () => setSigningRequest(folder.id),
    });
  }

  const subParts = [
    departmentName,
    driver?.employee_number ? t('driver.employeeNo', { employee_number: driver.employee_number }) : null,
    driver?.phone ?? null,
  ].filter(Boolean) as string[];

  const menuItems = [
    { label: t('driver.newPassword'), icon: 'key-outline' as const, onPress: onResetPassword },
    { label: exportingReport ? t('driver.preparingReport') : t('driver.downloadReport'), icon: 'download-outline' as const, onPress: onExportReport, disabled: exportingReport },
    ...(isArchived ? [] : [{ label: archiving ? t('common.archiving') : t('common.moveToArchive'), icon: 'archive-outline' as const, onPress: onArchive, disabled: archiving }]),
  ];

  const textEditor = (label: string, raw: string | null | undefined, onSave: (v: string) => Promise<string | null>, extra?: Partial<TextFieldEditor>): TextFieldEditor => ({
    kind: 'text',
    label,
    raw: raw ?? '',
    onSave,
    ...extra,
  });
  const dateEditor = (label: string, raw: string | null | undefined, onSave: (v: string | null) => Promise<string | null>): FieldEditor => ({ kind: 'date', label, raw: raw ?? null, onSave });

  // A permit date row, coloured when it has run out or is about to.
  const expiryRow = (
    label: string,
    key: 'work_at_height_expiry' | 'port_entry_expiry' | 'forklift_refresher_expiry' | 'hazmat_permit_expiry',
    first?: boolean,
  ) => {
    const value = driver?.[key] ?? null;
    return (
      <DetailRow
        first={first} label={label} focusId={key}
        value={value ? formatDate(value) : null}
        ltr
        valueColor={EXPIRY_COLOR[expiryState(value)]}
        field={dateEditor(label, value, (v) => onSaveField({ [key]: v }))}
      />
    );
  };
  // A yes/no row, edited from a two-option list.
  const yesNoRow = (label: string, key: string, on: boolean, save: (on: boolean) => Promise<string | null>) => (
    <DetailRow
      label={label} focusId={key}
      value={on ? t('driver.yes') : t('driver.no')}
      field={{
        kind: 'select', label, raw: on ? 'yes' : 'no',
        options: [{ value: 'yes', label: t('driver.yes') }, { value: 'no', label: t('driver.no') }],
        onSave: (v) => save(v === 'yes'),
      }}
    />
  );

  const reduceMotion = prefersReducedMotion();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={[styles.hero, styles.heroNight, !reduceMotion && styles.enter]}>
        <View style={[styles.heroGlow, styles.heroGlowBlue, { pointerEvents: 'none' }]} />
        <View style={[styles.heroGlow, styles.heroGlowCyan, { pointerEvents: 'none' }]} />
        <View style={[styles.heroIdentity, styles.heroWho]}>
          <View style={[styles.portrait, isArchived && styles.portraitMuted]}>
            <View style={styles.portraitInner}>
              <DText weight="bold" style={styles.portraitText}>{initialsOf(name)}</DText>
            </View>
            <View style={[styles.portraitDot, { backgroundColor: DESKTOP_TONES[statusTone].fg }]} />
          </View>
          <View style={styles.flex}>
            <View style={styles.heroStatusRow}>
              <View style={styles.pillOnDark}><StatusPill tone={statusTone} label={statusLabel} /></View>
              <OverflowMenu items={menuItems} />
            </View>
            <DText weight="bold" style={[styles.heroName, styles.heroNameOnDark]} numberOfLines={1}>{name}</DText>
            <View style={styles.heroSub}>
              {subParts.map((part, index) => (
                <React.Fragment key={`${part}-${index}`}>
                  {index > 0 && <DText style={[styles.heroSubDot, styles.heroSubDotOnDark]}>·</DText>}
                  {part === driver?.phone ? <DLtrText style={[styles.heroSubText, styles.heroSubTextOnDark]}>{part}</DLtrText> : <DText style={[styles.heroSubText, styles.heroSubTextOnDark]}>{part}</DText>}
                </React.Fragment>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.facts}>
          {/* Assigned vehicles, right of the licence; more vehicles add further right. */}
          <HoverPressable
            style={styles.heroVehiclesEdit}
            hoverStyle={styles.heroVehiclesEditHover}
            onPress={() => setVehiclesOpen(true)}
            accessibilityLabel={t('driver.assignedVehicles')}
            {...webOnly({ title: t('driver.assignedVehicles') })}
          >
            <Ionicons name={vehicles.length ? 'create-outline' : 'add'} size={16} color="#FFFFFF" />
            {!vehicles.length && <DText weight="semiBold" style={styles.heroVehiclesEditText}>{t('driver.addVehicle')}</DText>}
          </HoverPressable>
          {[...vehicles].sort((x, y) => Number(x.is_primary) - Number(y.is_primary)).map((vehicle) => (
            <HoverPressable
              key={vehicle.id}
              style={[styles.fact, styles.factOnDark, styles.heroVehicle]}
              hoverStyle={styles.heroVehicleHover}
              onPress={() => onOpenVehicle(vehicle.id)}
              accessibilityLabel={t('vehicle.openFile', { plate: formatPlate(vehicle.plate_number) })}
            >
              <DText style={[styles.factLabel, styles.factLabelOnDark]}>{vehicle.is_primary ? t('driver.primaryInVehicle') : t('driver.secondaryInVehicle')}</DText>
              <MiniPlate plate={formatPlate(vehicle.plate_number)} />
            </HoverPressable>
          ))}
          <Fact onDark label={t('driver.licenseValidUntilLabel')} value={licenseExpiry ? formatDate(licenseExpiry) : t('common.notEntered')} color={licenseState === 'expired' ? NIGHT_TONES.bad : licenseState === 'soon' ? NIGHT_TONES.warn : undefined} muted={!licenseExpiry} />
          <Fact onDark label={t('driver.classes')} value={classesLabel ? classesLabel.replace(',', ', ') : t('common.notEnteredPl')} muted={!classesLabel} />
          <Fact onDark label={t('driver.tenure')} value={inCompany?.value ?? t('common.notEntered')} unit={inCompany?.unit} muted={!inCompany} />
        </View>

      </View>

      {isArchived && (
        <View style={styles.archivedBanner}>
          <Ionicons name="archive-outline" size={18} color={DESKTOP_COLORS.inkMuted} />
          <View style={styles.flex}>
            <DText weight="bold" style={styles.archivedTitle}>{t('driver.inArchive')}</DText>
            <DText style={styles.archivedText}>{t('driver.inArchiveDetail')}</DText>
          </View>
          <HoverPressable style={[styles.softBtn, restoring && styles.disabled]} hoverStyle={styles.softBtnHover} pressStyle={styles.pressDown} onPress={onRestore} disabled={restoring}>
            <Ionicons name="arrow-undo-outline" size={16} color={DESKTOP_COLORS.brand} />
            <DText weight="semiBold" style={styles.softBtnText}>{restoring ? t('common.restoringBack') : t('common.restoreFromArchive')}</DText>
          </HoverPressable>
        </View>
      )}

      {pendingActivation && !isArchived && (
        <View style={styles.archivedBanner}>
          <Ionicons name="time-outline" size={18} color={DESKTOP_COLORS.inkMuted} />
          <DText style={[styles.archivedText, styles.flex]}>
            {t('driver.notActivated') +
              (pendingActivationDays === null
                ? '.'
                : pendingActivationDays === 0
                ? t('driver.tempSentToday')
                : t('driver.tempSentAgo', { v1: pendingActivationDays === 1 ? t('common.dayWord') : t('driver.pendingDays', { pendingActivationDays }) }))}
          </DText>
        </View>
      )}

      {/* Attention notice */}
      {!isArchived && alerts.length > 0 && (
        <View style={[styles.attention, !reduceMotion && styles.enter]}>
          <Ionicons name="warning-outline" size={18} color={DESKTOP_TONES.warn.fg} style={styles.attentionIcon} />
          <View style={styles.flex}>
            <DText weight="bold" style={styles.attentionTitle}>
              {alerts.length === 1 ? t('driver.oneThingNeedsAttention') : t('driver.thingsNeedAttention', { length: alerts.length })}
            </DText>
            {alerts.map((alert) => (
              <View key={alert.key} style={styles.attentionRow}>
                <View style={styles.attentionTag}>
                  <DText weight="bold" style={[styles.attentionTagText, { color: DESKTOP_TONES[alert.tone].fg }]}>{alert.tag}</DText>
                </View>
                <DText style={styles.attentionText}>{alert.text}</DText>
                {!!alert.date && <DLtrText style={styles.attentionText}>{formatDate(alert.date)}</DLtrText>}
                <HoverPressable style={styles.linkBtn} hoverStyle={styles.softBtnHover} onPress={alert.open} accessibilityLabel={t('common.openText', { text: alert.text })}>
                  <DText weight="semiBold" style={styles.linkText}>{t('common.open')}</DText>
                  <Ionicons name={dirIcon('chevron-back')} size={14} color={DESKTOP_COLORS.brand} />
                </HoverPressable>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Three columns: personal details, licence, work and permits */}
      <View style={styles.gridRow}>
        <View style={styles.cell3Wide}>
          <EditableSection title={t('driver.personalDetails')}>
            <DetailRow
              first
              label={t('common.fullName')} focusId="full_name"
              value={driver?.full_name?.trim() || null}
              field={textEditor(t('common.fullName'), driver?.full_name, (v) => onSaveField({ full_name: v.trim() }), { validate: (v) => (v.trim() ? null : t('validation.thisRequired')) })}
            />
            <DetailRow
              label={t('common.mobilePhone')} focusId="phone"
              value={driver?.phone || null}
              ltr
              accessory={driver?.phone ? <DText style={styles.rowNote} numberOfLines={1}>{t('driver.alsoUsername')}</DText> : undefined}
              field={textEditor(t('common.mobilePhone'), driver?.phone, (v) => onSaveField({ phone: v.trim() }), {
                ltr: true,
                numeric: true,
                hint: t('driver.signsInWithNumber'),
                validate: (v) => (!v.trim() ? t('validation.thisRequired') : isValidIsraeliPhone(v) ? null : t('validation.invalidPhone')),
              })}
            />
            <DetailRow
              label={t('common.emailAddress')}
              value={driver?.email || null}
              ltr
              field={textEditor(t('common.emailAddress'), driver?.email, (v) => onSaveEmail(v.trim().toLowerCase()), {
                ltr: true,
                validate: (v) => (isValidEmail(v.trim()) ? null : t('validation.invalidEmail')),
              })}
            />
            <DetailRow
              label={t('field.nationalId')} focusId="national_id"
              value={driver?.national_id ? (showNationalId ? driver.national_id : maskNationalId(driver.national_id)) : null}
              ltr
              accessory={driver?.national_id ? (
                <HoverPressable
                  style={styles.revealPill}
                  hoverStyle={styles.softBtnHover}
                  onPress={() => setShowNationalId((v) => !v)}
                  accessibilityLabel={showNationalId ? t('driver.hideNationalId') : t('driver.showNationalId')}
                >
                  <DText weight="semiBold" style={styles.revealText}>{showNationalId ? t('common.hide') : t('common.show')}</DText>
                </HoverPressable>
              ) : undefined}
              field={textEditor(t('field.nationalId'), driver?.national_id, (v) => onSaveField({ national_id: v || null }), {
                ltr: true,
                numeric: true,
                hint: t('driver.nationalIdHintDot'),
                parse: (v) => v.replace(/\D/g, '').slice(0, 9),
                validate: (v) => (!v || isValidIsraeliNationalId(v) ? null : t('validation.invalidNationalId')),
              })}
            />
            <DetailRow
              label={t('driver.birthDate')} focusId="birth_date"
              value={driver?.birth_date ? formatDate(driver.birth_date) : null}
              ltr
              accessory={age != null ? <DText style={styles.rowNote}>{t('driver.age')} {age}</DText> : undefined}
              field={dateEditor(t('driver.birthDate'), driver?.birth_date, (v) => onSaveField({ birth_date: v }))}
            />
            <DetailRow label={t('common.address')} focusId="address" value={driver?.address || null} field={textEditor(t('common.address'), driver?.address, (v) => onSaveField({ address: v.trim() || null }))} />
            <DetailRow
              label={t('driver.homePhone')} focusId="home_phone"
              value={driver?.home_phone || null}
              ltr
              field={textEditor(t('driver.homePhone'), driver?.home_phone, (v) => onSaveField({ home_phone: v.trim() || null }), {
                ltr: true,
                numeric: true,
                validate: (v) => (!v.trim() || isValidIsraeliPhone(v) ? null : t('validation.invalidPhone')),
              })}
            />
            <DetailRow
              label={t('driver.maritalStatus')} focusId="marital_status"
              value={storedValueLabel(driver?.marital_status)}
              field={{ kind: 'select', label: t('driver.maritalStatus'), raw: driver?.marital_status || null, options: optionsWithCurrent(MARITAL_STATUS_OPTIONS, driver?.marital_status), allowClear: true, placeholder: t('common.notSelected'), onSave: (v) => onSaveField({ marital_status: v }) }}
            />
            <DetailRow
              label={t('driver.education')} focusId="education"
              value={storedValueLabel(driver?.education)}
              field={{ kind: 'select', label: t('driver.education'), raw: driver?.education || null, options: optionsWithCurrent(EDUCATION_OPTIONS, driver?.education), allowClear: true, placeholder: t('common.notSelectedF'), onSave: (v) => onSaveField({ education: v }) }}
            />
          </EditableSection>
        </View>

        <View style={styles.cell3}>
          <EditableSection title={t('driver.drivingLicense')}>
            <View style={styles.licenceArea}>
              <LicenceCard
                name={name}
                number={driver?.license_number ?? null}
                issued={driver?.license_issue_date ?? null}
                classes={[license.primary, license.secondary].filter(Boolean)}
                expiry={licenseExpiry}
                expiryState={licenseState}
                onPress={() => setLicenseOpen(true)}
              />
            </View>
            <HoverPressable style={[styles.photosRow, styles.rowDivider]} hoverStyle={styles.rowHover} onPress={() => setLicenseOpen(true)} accessibilityLabel={t('driver.licensePhotosLabel')}>
              <DText style={[styles.rowLabel, styles.rowLabelCompact]}>{t('driver.licensePhotos')}</DText>
              {(['front', 'back'] as const).map((side) => (
                <View key={side} style={[styles.sideChip, !hasSide(side) && styles.sideChipMissing]}>
                  <Ionicons name={hasSide(side) ? 'checkmark' : 'remove'} size={12} color={hasSide(side) ? DESKTOP_TONES.ok.fg : DESKTOP_COLORS.inkMuted} />
                  <DText weight="semiBold" style={[styles.sideChipText, !hasSide(side) && styles.sideChipTextMissing]}>{side === 'front' ? t('driver.front') : t('driver.back')}</DText>
                </View>
              ))}
              <Ionicons name={dirIcon('chevron-back')} size={13} color={DESKTOP_COLORS.inkFaint} />
            </HoverPressable>
            <DetailRow
              compact
              label={t('field.licenseNumber')} focusId="license_number"
              value={driver?.license_number || null}
              ltr
              field={textEditor(t('field.licenseNumber'), driver?.license_number, (v) => onSaveField({ license_number: v.trim() || null }), { ltr: true, numeric: true })}
            />
            <DetailRow
              compact
              label={t('driver.classes')} focusId="license_classes"
              value={classesLabel ? classesLabel.replace(',', ', ') : null}
              ltr
              field={{
                kind: 'selectPair',
                label: t('driver.licenseClasses'),
                hint: t('driver.upToTwoClasses'),
                labels: [t('driver.mainClass'), t('driver.additionalClass')],
                raw: [license.primary || null, license.secondary || null],
                options: LICENSE_CLASS_SELECT(),
                placeholders: [t('driver.chooseClass'), t('common.noneShort')],
                validate: (first, second) => (first && second && first === second ? t('driver.chooseTwoDifferent') : null),
                onSave: (first, second) => onSaveField({ license_classes: joinLicenseClasses(first ?? '', second ?? '') || null }),
              }}
            />
            <DetailRow compact label={t('driver.issueDate')} focusId="license_issue_date" value={driver?.license_issue_date ? formatDate(driver.license_issue_date) : null} ltr field={dateEditor(t('driver.issueDate'), driver?.license_issue_date, (v) => onSaveField({ license_issue_date: v }))} />
            <DetailRow compact label={t('documents.validUntil')} focusId="license_expiry" value={licenseExpiry ? formatDate(licenseExpiry) : null} ltr valueColor={licenseColor} field={dateEditor(t('license.expiry'), licenseExpiry, (v) => onSaveField({ license_expiry: v }))} />
          </EditableSection>
        </View>
        <View style={[styles.cell3, styles.stack]}>
          <View style={styles.stackItem}>
            <EditableSection title={t('driver.work')}>
              <DetailRow first label={t('driver.employeeNumber')} focusId="employee_number" value={driver?.employee_number || null} ltr field={textEditor(t('driver.employeeNumber'), driver?.employee_number, (v) => onSaveField({ employee_number: v.trim() || null }), { ltr: true })} />
              <DetailRow
                label={t('common.department')} focusId="department_id"
                value={departmentName}
                field={{ kind: 'select', label: t('common.department'), raw: driver?.department_id ?? null, options: departmentOptions, allowClear: true, placeholder: t('common.noDepartment'), onSave: (v) => onSaveField({ department_id: v }) }}
              />
              <DetailRow
                label={t('driver.employmentStart')} focusId="employment_start_date"
                value={driver?.employment_start_date ? formatDate(driver.employment_start_date) : null}
                ltr
                accessory={inCompany ? <DText style={styles.rowNote}>{`${inCompany.value} ${inCompany.unit}`}</DText> : undefined}
                field={dateEditor(t('driver.employmentStart'), driver?.employment_start_date, (v) => onSaveField({ employment_start_date: v }))}
              />
              <DetailRow
                label={t('driver.employmentEnd')} focusId="employment_end_date"
                value={driver?.employment_end_date ? formatDate(driver.employment_end_date) : null}
                ltr
                field={dateEditor(t('driver.employmentEnd'), driver?.employment_end_date, async (v) => {
                  if (v && driver?.employment_start_date && v < driver.employment_start_date) return t('driver.employmentEndBeforeStart');
                  return onSaveField({ employment_end_date: v });
                })}
              />
            </EditableSection>
          </View>
          <View style={styles.stackItem}>
            <EditableSection title={t('driver.permitsGroup')}>
              {expiryRow(t('driver.workAtHeightExpiry'), 'work_at_height_expiry', true)}
              {expiryRow(t('driver.portEntryExpiry'), 'port_entry_expiry')}
              {expiryRow(t('driver.forkliftRefresherExpiry'), 'forklift_refresher_expiry')}
              {yesNoRow(t('driver.hazmatApproved'), 'hazmat_approved', !!driver?.hazmat_approved, (on) => onSaveField(on ? { hazmat_approved: true } : { hazmat_approved: false, hazmat_permit_expiry: null }))}
              <View style={driver?.hazmat_approved ? undefined : styles.rowOff} pointerEvents={driver?.hazmat_approved ? 'auto' : 'none'}>
                {expiryRow(t('driver.hazmatPermitExpiry'), 'hazmat_permit_expiry')}
              </View>
              {yesNoRow(t('driver.previouslyDisqualified'), 'previously_disqualified', !!driver?.previously_disqualified, (on) => onSaveField({ previously_disqualified: on }))}
            </EditableSection>
          </View>
        </View>
      </View>

      {/* Documents and forms to sign; a narrow screen puts the forms under the documents. */}
      <View style={styles.gridRow}>
        <View style={styles.docsCell}>
        <View style={styles.docsHead}>
          <DText weight="bold" style={styles.docsTitle}>{t('common.documents')}</DText>
          <DText style={styles.mutedText}>{t('driver.foldersHint')}</DText>
        </View>
        <View style={styles.docsStack}>
          {DOCUMENT_GROUPS.map((group) => (
            <View key={group.title} style={styles.docsGroup}>
              <GroupLabel>{group.title}</GroupLabel>
              <View style={[styles.card, styles.listCard]}>
                {group.folders.map((folder, index) => (
                  <FolderListRow
                    key={folder.category}
                    title={folder.title}
                    icon={folder.icon}
                    docs={docs.filter((d) => d.category === folder.category)}
                    onPress={() => setOpenFolder(recordFolder(folder))}
                    first={index === 0}
                    loading={!docsLoaded}
                    plain={folder.expiry !== 'required'}
                  />
                ))}
              </View>
            </View>
          ))}
          {extraFolders.length > 0 && (
            <View style={styles.docsGroup}>
              <GroupLabel>{t('companyFolders.moreFolders')}</GroupLabel>
              <View style={[styles.card, styles.listCard]}>
                {extraFolders.map((folder, index) => (
                  <FolderListRow
                    key={folder.category}
                    title={folder.title}
                    icon={folder.icon}
                    docs={docs.filter((d) => d.category === folder.category)}
                    onPress={() => setOpenFolder(folder)}
                    first={index === 0}
                    loading={!docsLoaded}
                    plain={!folder.requiresExpiry}
                  />
                ))}
              </View>
            </View>
          )}
        </View>
        </View>
        <View style={styles.cell3}>
          <GroupLabel>{t('signing.formsToSign')}</GroupLabel>
          <View style={styles.pinnedArea}>
            <View style={[StyleSheet.absoluteFill, styles.card]}>
              <ScrollView style={styles.pinnedScroll}>
                <DriverSigningList
                  companyId={companyId}
                  driverId={driverId}
                  vehicleId={(vehicles.find((v) => v.is_primary) ?? vehicles[0])?.id ?? null}
                  canSend={canSendSigning}
                  folders={signing.folders}
                  loading={signing.loading}
                  error={signing.error}
                  onChanged={signing.reload}
                  openFolderId={signingRequest}
                  onFolderOpened={() => setSigningRequest(null)}
                  onOpenSession={onOpenSigningSession}
                />
              </ScrollView>
              {canSendSigning && (
                <View style={[styles.pinnedFooter, styles.rowDivider]}>
                  <NewFormButton companyId={companyId} takenTitles={signing.folders.filter((folder) => folder.template).map((folder) => folder.title)} onChanged={() => void signing.reload()} />
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {!!driver?.created_at && (
        <View style={styles.footer}>
          <DText style={styles.footerText}>{t('driver.joinedAppOn')}</DText>
          <DLtrText style={styles.footerText}>{formatDate(driver.created_at)}</DLtrText>
          {!!driver.updated_at && (
            <>
              <DText style={styles.footerText}> {t('driver.lastUpdatedOn')}</DText>
              <DLtrText style={styles.footerText}>{formatDate(driver.updated_at)}</DLtrText>
            </>
          )}
        </View>
      )}

      <FieldEditDialog editor={editor} onClose={() => setEditor(null)} />

      <DesktopModal visible={vehiclesOpen} title={t('driver.assignedVehicles')} onClose={() => setVehiclesOpen(false)} maxWidth={520}>
        <View style={styles.vehiclesModal}>
          <View style={styles.vehiclesModalHistory}>
            <DriverVehicleHistoryButton driverId={driverId} refreshKey={vehicles.map((v) => v.id).join(',')} />
          </View>
          <View style={styles.vehiclesModalCard}>
            <DriverVehiclesCard
              companyId={companyId}
              driverId={driverId}
              initialVehicles={vehicles}
              canEdit={!isArchived}
              onOpenVehicle={(id) => { setVehiclesOpen(false); onOpenVehicle(id); }}
              onChanged={onVehiclesChanged}
            />
          </View>
        </View>
      </DesktopModal>

      <DriverLicenseModal
        visible={licenseOpen}
        onClose={() => setLicenseOpen(false)}
        companyId={companyId}
        driverId={driverId}
        driver={driver}
        pendingRequest={pendingLicenseRequest}
        reviewing={reviewingLicense}
        onReview={onReviewLicense}
        onSaveExpiry={(date) => onSaveField({ license_expiry: date })}
        onPhotosChanged={() => void reloadDocs()}
      />

      {openFolder && (
        <DocumentFolderUploadModal
          companyId={companyId}
          ownerType="driver"
          ownerId={driverId}
          folder={openFolder}
          docs={docs}
          layout={folderLayout(openFolder)}
          defaultVehicleId={(vehicles.find((v) => v.is_primary) ?? vehicles[0])?.id ?? null}
          onClose={() => setOpenFolder(null)}
          onChanged={reloadDocs}
        />
      )}
    </ScrollView>
  );
}

// הרישיון מצויר ככרטיס קטן
/**
 * The driving licence drawn as a small card — the driver page's counterpart
 * of the vehicle page's licence plate. Tapping it opens the licence photos.
 */
function LicenceCard({
  name,
  number,
  issued,
  classes,
  expiry,
  expiryState: state,
  onPress,
}: {
  name: string;
  number: string | null;
  issued: string | null;
  classes: string[];
  expiry: string | null;
  expiryState: ExpiryState;
  onPress: () => void;
}) {
  const expiryColor = EXPIRY_COLOR[state] ?? DESKTOP_TONES.ok.fg;
  return (
    <HoverPressable
      style={styles.licence}
      hoverMotionStyle={styles.licenceHover}
      pressStyle={styles.pressDown}
      onPress={onPress}
      accessibilityLabel={t('driver.licenseOpenPhotos')}
    >
      {/* Positions follow the front of the Israeli licence (percent of the card) */}
      <View style={styles.licenceTop}>
        <View style={styles.licenceTitleRow}>
          <DLtrText weight="extraBold" style={styles.licenceTitleEn}>DRIVING LICENCE</DLtrText>
          <DText weight="extraBold" style={styles.licenceTitle}>{t('driver.licenceCardTitle')}</DText>
        </View>
        <View style={styles.licenceTitleRow}>
          <DLtrText weight="semiBold" style={styles.licenceStateEn}>STATE OF ISRAEL</DLtrText>
          <DText weight="semiBold" style={styles.licenceState}>{t('driver.licenceCardState')}</DText>
        </View>
      </View>
      <View style={styles.licencePhoto}>
        <DText weight="bold" style={styles.licencePhotoText}>{initialsOf(name)}</DText>
      </View>
      <View style={styles.licenceGhost}>
        <DText weight="bold" style={styles.licenceGhostText}>{initialsOf(name)}</DText>
      </View>
      <View style={styles.licenceMain}>
        <LicenceField code="1." value={name} strong />
        <LicenceField
          code="4b."
          value={expiry ? formatDate(expiry) : t('driver.noExpiry')}
          ltr={!!expiry}
          color={expiryColor}
        />
      </View>
      <View style={styles.licenceSide}>
        <LicenceField code="4a." value={issued ? formatDate(issued) : '—'} ltr />
        <LicenceField code="4d." value={number || '—'} ltr />
      </View>
      <View style={styles.licenceFoot}>
        <DLtrText weight="bold" style={styles.licenceCode}>9.</DLtrText>
        <DLtrText weight="extraBold" style={styles.licenceClassText}>{classes.length ? classes.join(' ') : '—'}</DLtrText>
      </View>
    </HoverPressable>
  );
}

// שדה ממוספר ברישיון
/** One numbered line of the licence card, like "4d. 1234567". */
function LicenceField({ code, value, ltr, strong, color }: { code: string; value: string; ltr?: boolean; strong?: boolean; color?: string }) {
  const Value = ltr ? DLtrText : DText;
  return (
    <View style={styles.licenceField}>
      <DLtrText weight="bold" style={styles.licenceCode}>{code}</DLtrText>
      <Value weight="bold" numberOfLines={1} style={[strong ? styles.licenceName : styles.licenceLine, color ? { color } : null]}>{value}</Value>
    </View>
  );
}

// צבעי הרישיון
const LICENCE_INK = '#1A2433';
const LICENCE_BLUE = '#1B3F8B';
// An original fine-line rosette and wave pattern (decorative, not the real security print).
const LICENCE_PATTERN = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22400%22%20height%3D%22172%22%20viewBox%3D%220%200%20400%20172%22%3E%3Cg%20fill%3D%22none%22%20stroke%3D%22%230E7490%22%20stroke-opacity%3D%220.13%22%20stroke-width%3D%220.6%22%3E%3Cpolyline%20points%3D%22165.0%2C150.0%20166.8%2C151.3%20168.5%2C152.6%20169.8%2C153.9%20170.5%2C155.3%20170.7%2C156.6%20170.3%2C157.9%20169.3%2C159.1%20167.8%2C160.2%20166.0%2C161.2%20163.9%2C162.2%20161.9%2C163.0%20160.0%2C163.8%20158.5%2C164.7%20157.4%2C165.6%20156.8%2C166.6%20156.8%2C167.7%20157.3%2C169.0%20158.2%2C170.5%20159.4%2C172.2%20160.8%2C173.9%20162.1%2C175.8%20163.2%2C177.5%20163.9%2C179.2%20164.2%2C180.8%20163.9%2C182.1%20163.0%2C183.2%20161.7%2C184.0%20159.9%2C184.5%20157.8%2C184.8%20155.6%2C185.0%20153.4%2C185.1%20151.4%2C185.2%20149.6%2C185.5%20148.3%2C186.0%20147.4%2C186.7%20147.0%2C187.8%20147.0%2C189.2%20147.4%2C190.9%20148.0%2C192.9%20148.6%2C195.0%20149.2%2C197.1%20149.6%2C199.2%20149.7%2C201.1%20149.5%2C202.6%20148.7%2C203.7%20147.6%2C204.5%20146.1%2C204.7%20144.2%2C204.6%20142.1%2C204.2%20140.0%2C203.6%20137.9%2C203.0%20135.9%2C202.4%20134.2%2C202.0%20132.8%2C202.0%20131.7%2C202.4%20131.0%2C203.3%20130.5%2C204.6%20130.2%2C206.4%20130.1%2C208.4%20130.0%2C210.6%20129.8%2C212.8%20129.5%2C214.9%20129.0%2C216.7%20128.2%2C218.0%20127.1%2C218.9%20125.8%2C219.2%20124.2%2C218.9%20122.5%2C218.2%20120.8%2C217.1%20118.9%2C215.8%20117.2%2C214.4%20115.5%2C213.2%20114.0%2C212.3%20112.7%2C211.8%20111.6%2C211.8%20110.6%2C212.4%20109.7%2C213.5%20108.8%2C215.0%20108.0%2C216.9%20107.2%2C218.9%20106.2%2C221.0%20105.2%2C222.8%20104.1%2C224.3%20102.9%2C225.3%20101.6%2C225.7%20100.3%2C225.5%2098.9%2C224.8%2097.6%2C223.5%2096.3%2C221.8%2095.0%2C220.0%2093.8%2C218.1%2092.7%2C216.4%2091.6%2C215.1%2090.5%2C214.1%2089.4%2C213.8%2088.3%2C213.9%2087.1%2C214.7%2085.7%2C215.8%2084.3%2C217.3%2082.8%2C218.9%2081.3%2C220.5%2079.7%2C221.9%2078.2%2C222.9%2076.7%2C223.5%2075.3%2C223.4%2074.1%2C222.8%2073.1%2C221.6%2072.3%2C219.9%2071.6%2C217.9%2071.1%2C215.8%2070.6%2C213.6%2070.1%2C211.6%2069.5%2C210.0%2068.8%2C208.7%2068.0%2C208.0%2066.8%2C207.8%2065.4%2C208.0%2063.8%2C208.7%2062.0%2C209.6%2060.0%2C210.6%2058.0%2C211.6%2056.0%2C212.4%2054.2%2C212.8%2052.7%2C212.8%2051.4%2C212.3%2050.5%2C211.2%2050.0%2C209.8%2049.7%2C207.9%2049.8%2C205.8%2050.0%2C203.6%2050.3%2C201.4%2050.5%2C199.4%2050.6%2C197.6%2050.3%2C196.2%2049.7%2C195.3%2048.8%2C194.7%2047.4%2C194.4%2045.6%2C194.5%2043.6%2C194.7%2041.4%2C195.0%2039.2%2C195.2%2037.1%2C195.3%2035.2%2C195.0%2033.8%2C194.5%2032.7%2C193.6%2032.2%2C192.3%2032.2%2C190.8%2032.6%2C189.0%2033.4%2C187.0%2034.4%2C185.0%2035.4%2C183.0%2036.3%2C181.2%2037.0%2C179.6%2037.2%2C178.2%2037.0%2C177.0%2036.3%2C176.2%2035.0%2C175.5%2033.4%2C174.9%2031.4%2C174.4%2029.2%2C173.9%2027.1%2C173.4%2025.1%2C172.7%2023.4%2C171.9%2022.2%2C170.9%2021.6%2C169.7%2021.5%2C168.3%2022.1%2C166.8%2023.1%2C165.3%2024.5%2C163.7%2026.1%2C162.2%2027.7%2C160.7%2029.2%2C159.3%2030.3%2C157.9%2031.1%2C156.7%2031.2%2C155.6%2030.9%2C154.5%2029.9%2C153.4%2028.6%2C152.3%2026.9%2C151.2%2025.0%2C150.0%2023.2%2C148.7%2021.5%2C147.4%2020.2%2C146.1%2019.5%2C144.7%2019.3%2C143.4%2019.7%2C142.1%2020.7%2C140.9%2022.2%2C139.8%2024.0%2C138.8%2026.1%2C137.8%2028.1%2C137.0%2030.0%2C136.2%2031.5%2C135.3%2032.6%2C134.4%2033.2%2C133.4%2033.2%2C132.3%2032.7%2C131.0%2031.8%2C129.5%2030.6%2C127.8%2029.2%2C126.1%2027.9%2C124.2%2026.8%2C122.5%2026.1%2C120.8%2025.8%2C119.2%2026.1%2C117.9%2027.0%2C116.8%2028.3%2C116.0%2030.1%2C115.5%2032.2%2C115.2%2034.4%2C115.0%2036.6%2C114.9%2038.6%2C114.8%2040.4%2C114.5%2041.7%2C114.0%2042.6%2C113.3%2043.0%2C112.2%2043.0%2C110.8%2042.6%2C109.1%2042.0%2C107.1%2041.4%2C105.0%2040.8%2C102.9%2040.4%2C100.8%2040.3%2C98.9%2040.5%2C97.4%2041.3%2C96.3%2042.4%2C95.5%2043.9%2C95.3%2045.8%2C95.4%2047.9%2C95.8%2050.0%2C96.4%2052.1%2C97.0%2054.1%2C97.6%2055.8%2C98.0%2057.2%2C98.0%2058.3%2C97.6%2059.0%2C96.7%2059.5%2C95.4%2059.8%2C93.6%2059.9%2C91.6%2060.0%2C89.4%2060.2%2C87.2%2060.5%2C85.1%2061.0%2C83.3%2061.8%2C82.0%2062.9%2C81.1%2064.2%2C80.8%2065.8%2C81.1%2067.5%2C81.8%2069.2%2C82.9%2071.1%2C84.2%2072.8%2C85.6%2074.5%2C86.8%2076.0%2C87.7%2077.3%2C88.2%2078.4%2C88.2%2079.4%2C87.6%2080.3%2C86.5%2081.2%2C85.0%2082.0%2C83.1%2082.8%2C81.1%2083.8%2C79.0%2084.8%2C77.2%2085.9%2C75.7%2087.1%2C74.7%2088.4%2C74.3%2089.7%2C74.5%2091.1%2C75.2%2092.4%2C76.5%2093.7%2C78.2%2095.0%2C80.0%2096.2%2C81.9%2097.3%2C83.6%2098.4%2C84.9%2099.5%2C85.9%20100.6%2C86.2%20101.7%2C86.1%20102.9%2C85.3%20104.3%2C84.2%20105.7%2C82.7%20107.2%2C81.1%20108.7%2C79.5%20110.3%2C78.1%20111.8%2C77.1%20113.3%2C76.5%20114.7%2C76.6%20115.9%2C77.2%20116.9%2C78.4%20117.7%2C80.1%20118.4%2C82.1%20118.9%2C84.2%20119.4%2C86.4%20119.9%2C88.4%20120.5%2C90.0%20121.2%2C91.3%20122.0%2C92.0%20123.2%2C92.2%20124.6%2C92.0%20126.2%2C91.3%20128.0%2C90.4%20130.0%2C89.4%20132.0%2C88.4%20134.0%2C87.6%20135.8%2C87.2%20137.3%2C87.2%20138.6%2C87.7%20139.5%2C88.8%20140.0%2C90.2%20140.3%2C92.1%20140.2%2C94.2%20140.0%2C96.4%20139.7%2C98.6%20139.5%2C100.6%20139.4%2C102.4%20139.7%2C103.8%20140.3%2C104.7%20141.2%2C105.3%20142.6%2C105.6%20144.4%2C105.5%20146.4%2C105.3%20148.6%2C105.0%20150.8%2C104.8%20152.9%2C104.7%20154.8%2C105.0%20156.2%2C105.5%20157.3%2C106.4%20157.8%2C107.7%20157.8%2C109.2%20157.4%2C111.0%20156.6%2C113.0%20155.6%2C115.0%20154.6%2C117.0%20153.7%2C118.8%20153.0%2C120.4%20152.8%2C121.8%20153.0%2C123.0%20153.7%2C123.8%20155.0%2C124.5%20156.6%2C125.1%20158.6%2C125.6%20160.8%2C126.1%20162.9%2C126.6%20164.9%2C127.3%20166.6%2C128.1%20167.8%2C129.1%20168.4%2C130.3%20168.5%2C131.7%20167.9%2C133.2%20166.9%2C134.7%20165.5%2C136.3%20163.9%2C137.8%20162.3%2C139.3%20160.8%2C140.7%20159.7%2C142.1%20158.9%2C143.3%20158.8%2C144.4%20159.1%2C145.5%20160.1%2C146.6%20161.4%2C147.7%20163.1%2C148.8%20165.0%2C150.0%22%20/%3E%3Cpolyline%20points%3D%22179.0%2C150.0%20179.8%2C151.5%20179.9%2C153.0%20179.5%2C154.4%20178.4%2C155.8%20176.9%2C157.2%20175.1%2C158.4%20173.1%2C159.6%20171.1%2C160.7%20169.3%2C161.8%20167.8%2C162.8%20166.9%2C164.0%20166.4%2C165.2%20166.5%2C166.5%20167.1%2C168.0%20168.2%2C169.6%20169.5%2C171.4%20170.9%2C173.2%20172.2%2C175.1%20173.3%2C177.0%20174.0%2C178.7%20174.2%2C180.4%20173.8%2C181.8%20172.9%2C183.1%20171.4%2C184.0%20169.5%2C184.8%20167.4%2C185.3%20165.1%2C185.7%20162.8%2C186.1%20160.8%2C186.5%20159.0%2C187.0%20157.7%2C187.7%20156.9%2C188.7%20156.6%2C190.0%20156.6%2C191.6%20157.1%2C193.5%20157.7%2C195.5%20158.4%2C197.8%20159.0%2C200.0%20159.3%2C202.1%20159.4%2C204.0%20159.0%2C205.6%20158.2%2C206.9%20156.9%2C207.7%20155.2%2C208.1%20153.2%2C208.2%20150.9%2C207.9%20148.6%2C207.5%20146.4%2C207.1%20144.3%2C206.8%20142.5%2C206.6%20141.1%2C206.9%20139.9%2C207.5%20139.2%2C208.6%20138.7%2C210.2%20138.5%2C212.1%20138.3%2C214.2%20138.2%2C216.5%20138.0%2C218.8%20137.6%2C221.0%20137.0%2C222.8%20136.1%2C224.2%20134.9%2C225.0%20133.4%2C225.4%20131.7%2C225.2%20129.8%2C224.5%20127.8%2C223.6%20125.7%2C222.4%20123.8%2C221.2%20121.9%2C220.2%20120.3%2C219.5%20118.8%2C219.2%20117.6%2C219.4%20116.5%2C220.2%20115.5%2C221.5%20114.6%2C223.2%20113.7%2C225.2%20112.8%2C227.3%20111.9%2C229.4%20110.8%2C231.3%20109.6%2C232.8%20108.3%2C233.8%20106.8%2C234.2%20105.3%2C234.0%20103.7%2C233.2%20102.2%2C231.9%20100.6%2C230.3%2099.1%2C228.5%2097.7%2C226.8%2096.3%2C225.2%2095.0%2C224.0%2093.7%2C223.2%2092.5%2C223.0%2091.2%2C223.3%2089.8%2C224.2%2088.4%2C225.5%2086.9%2C227.1%2085.3%2C228.8%2083.7%2C230.4%2082.0%2C231.8%2080.4%2C232.8%2078.8%2C233.2%2077.3%2C233.1%2076.0%2C232.4%2074.8%2C231.2%2073.7%2C229.4%2072.8%2C227.4%2072.0%2C225.2%2071.3%2C223.1%2070.5%2C221.1%2069.7%2C219.5%2068.8%2C218.3%2067.7%2C217.7%2066.3%2C217.6%2064.8%2C217.9%2063.0%2C218.7%2061.0%2C219.6%2059.0%2C220.7%2056.9%2C221.7%2054.9%2C222.4%2053.0%2C222.8%2051.3%2C222.7%2050.0%2C222.1%2048.9%2C220.9%2048.2%2C219.3%2047.8%2C217.4%2047.7%2C215.1%2047.7%2C212.8%2047.7%2C210.5%2047.7%2C208.4%2047.5%2C206.6%2047.0%2C205.2%2046.1%2C204.3%2044.9%2C203.7%2043.3%2C203.5%2041.4%2C203.6%2039.3%2C203.8%2037.0%2C204.1%2034.7%2C204.3%2032.5%2C204.3%2030.6%2C204.0%2029.1%2C203.4%2028.0%2C202.3%2027.4%2C200.9%2027.3%2C199.2%2027.6%2C197.2%2028.2%2C195.0%2029.0%2C192.8%2029.9%2C190.7%2030.5%2C188.7%2031.0%2C187.0%2031.0%2C185.5%2030.5%2C184.3%2029.6%2C183.3%2028.2%2C182.6%2026.3%2C182.0%2024.2%2C181.5%2022.0%2C181.0%2019.7%2C180.4%2017.7%2C179.7%2016.0%2C178.7%2014.8%2C177.6%2014.2%2C176.3%2014.1%2C174.7%2014.6%2C173.1%2015.6%2C171.3%2016.9%2C169.5%2018.4%2C167.7%2019.9%2C166.0%2021.2%2C164.3%2022.2%2C162.8%2022.7%2C161.5%2022.7%2C160.2%2022.1%2C158.9%2021.1%2C157.8%2019.5%2C156.6%2017.7%2C155.4%2015.8%2C154.2%2013.9%2C152.8%2012.2%2C151.4%2011.0%2C150.0%2010.2%2C148.5%2010.1%2C147.0%2010.5%2C145.6%2011.6%2C144.2%2013.1%2C142.8%2014.9%2C141.6%2016.9%2C140.4%2018.9%2C139.3%2020.7%2C138.2%2022.2%2C137.2%2023.1%2C136.0%2023.6%2C134.8%2023.5%2C133.5%2022.9%2C132.0%2021.8%2C130.4%2020.5%2C128.6%2019.1%2C126.8%2017.8%2C124.9%2016.7%2C123.0%2016.0%2C121.3%2015.8%2C119.6%2016.2%2C118.2%2017.1%2C116.9%2018.6%2C116.0%2020.5%2C115.2%2022.6%2C114.7%2024.9%2C114.3%2027.2%2C113.9%2029.2%2C113.5%2031.0%2C113.0%2032.3%2C112.3%2033.1%2C111.3%2033.4%2C110.0%2033.4%2C108.4%2032.9%2C106.5%2032.3%2C104.5%2031.6%2C102.2%2031.0%2C100.0%2030.7%2C97.9%2030.6%2C96.0%2031.0%2C94.4%2031.8%2C93.1%2033.1%2C92.3%2034.8%2C91.9%2036.8%2C91.8%2039.1%2C92.1%2041.4%2C92.5%2043.6%2C92.9%2045.7%2C93.2%2047.5%2C93.4%2048.9%2C93.1%2050.1%2C92.5%2050.8%2C91.4%2051.3%2C89.8%2051.5%2C87.9%2051.7%2C85.8%2051.8%2C83.5%2052.0%2C81.2%2052.4%2C79.0%2053.0%2C77.2%2053.9%2C75.8%2055.1%2C75.0%2056.6%2C74.6%2058.3%2C74.8%2060.2%2C75.5%2062.2%2C76.4%2064.3%2C77.6%2066.2%2C78.8%2068.1%2C79.8%2069.7%2C80.5%2071.2%2C80.8%2072.4%2C80.6%2073.5%2C79.8%2074.5%2C78.5%2075.4%2C76.8%2076.3%2C74.8%2077.2%2C72.7%2078.1%2C70.6%2079.2%2C68.7%2080.4%2C67.2%2081.7%2C66.2%2083.2%2C65.8%2084.7%2C66.0%2086.3%2C66.8%2087.8%2C68.1%2089.4%2C69.7%2090.9%2C71.5%2092.3%2C73.2%2093.7%2C74.8%2095.0%2C76.0%2096.3%2C76.8%2097.5%2C77.0%2098.8%2C76.7%20100.2%2C75.8%20101.6%2C74.5%20103.1%2C72.9%20104.7%2C71.2%20106.3%2C69.6%20108.0%2C68.2%20109.6%2C67.2%20111.2%2C66.8%20112.7%2C66.9%20114.0%2C67.6%20115.2%2C68.8%20116.3%2C70.6%20117.2%2C72.6%20118.0%2C74.8%20118.7%2C76.9%20119.5%2C78.9%20120.3%2C80.5%20121.2%2C81.7%20122.3%2C82.3%20123.7%2C82.4%20125.2%2C82.1%20127.0%2C81.3%20129.0%2C80.4%20131.0%2C79.3%20133.1%2C78.3%20135.1%2C77.6%20137.0%2C77.2%20138.7%2C77.3%20140.0%2C77.9%20141.1%2C79.1%20141.8%2C80.7%20142.2%2C82.6%20142.3%2C84.9%20142.3%2C87.2%20142.3%2C89.5%20142.3%2C91.6%20142.5%2C93.4%20143.0%2C94.8%20143.9%2C95.7%20145.1%2C96.3%20146.7%2C96.5%20148.6%2C96.4%20150.7%2C96.2%20153.0%2C95.9%20155.3%2C95.7%20157.5%2C95.7%20159.4%2C96.0%20160.9%2C96.6%20162.0%2C97.7%20162.6%2C99.1%20162.7%2C100.8%20162.4%2C102.8%20161.8%2C105.0%20161.0%2C107.2%20160.1%2C109.3%20159.5%2C111.3%20159.0%2C113.0%20159.0%2C114.5%20159.5%2C115.7%20160.4%2C116.7%20161.8%2C117.4%20163.7%2C118.0%20165.8%2C118.5%20168.0%2C119.0%20170.3%2C119.6%20172.3%2C120.3%20174.0%2C121.3%20175.2%2C122.4%20175.8%2C123.7%20175.9%2C125.3%20175.4%2C126.9%20174.4%2C128.7%20173.1%2C130.5%20171.6%2C132.3%20170.1%2C134.0%20168.8%2C135.7%20167.8%2C137.2%20167.3%2C138.5%20167.3%2C139.8%20167.9%2C141.1%20168.9%2C142.2%20170.5%2C143.4%20172.3%2C144.6%20174.2%2C145.8%20176.1%2C147.2%20177.8%2C148.6%20179.0%2C150.0%22%20/%3E%3Cpolyline%20points%3D%22188.5%2C150.0%20187.4%2C151.6%20185.9%2C153.2%20184.1%2C154.7%20182.1%2C156.1%20180.2%2C157.5%20178.5%2C158.8%20177.2%2C160.1%20176.3%2C161.4%20176.0%2C162.8%20176.3%2C164.3%20177.0%2C165.9%20178.2%2C167.7%20179.6%2C169.5%20181.1%2C171.5%20182.4%2C173.4%20183.5%2C175.4%20184.2%2C177.3%20184.3%2C179.0%20183.8%2C180.6%20182.8%2C182.0%20181.3%2C183.1%20179.3%2C184.1%20177.1%2C184.8%20174.8%2C185.5%20172.5%2C186.1%20170.4%2C186.8%20168.8%2C187.6%20167.5%2C188.6%20166.8%2C189.8%20166.5%2C191.3%20166.6%2C193.0%20167.1%2C195.1%20167.8%2C197.3%20168.5%2C199.6%20169.1%2C201.9%20169.5%2C204.1%20169.5%2C206.1%20169.0%2C207.8%20168.0%2C209.1%20166.6%2C210.1%20164.7%2C210.6%20162.6%2C210.9%20160.2%2C210.8%20157.8%2C210.7%20155.5%2C210.5%20153.3%2C210.4%20151.5%2C210.5%20149.9%2C211.0%20148.8%2C211.9%20148.1%2C213.2%20147.6%2C215.0%20147.4%2C217.0%20147.2%2C219.3%20147.1%2C221.8%20146.9%2C224.1%20146.5%2C226.3%20145.8%2C228.2%20144.7%2C229.6%20143.4%2C230.5%20141.7%2C230.9%20139.8%2C230.8%20137.7%2C230.3%20135.5%2C229.5%20133.3%2C228.5%20131.1%2C227.5%20129.1%2C226.7%20127.3%2C226.2%20125.8%2C226.1%20124.4%2C226.6%20123.2%2C227.6%20122.2%2C229.0%20121.3%2C230.9%20120.4%2C233.0%20119.4%2C235.3%20118.4%2C237.4%20117.3%2C239.3%20116.0%2C240.8%20114.5%2C241.8%20112.9%2C242.2%20111.2%2C242.0%20109.5%2C241.3%20107.7%2C240.1%20105.9%2C238.5%20104.1%2C236.8%20102.5%2C235.2%20100.9%2C233.7%2099.3%2C232.7%2097.9%2C232.1%2096.4%2C232.0%2095.0%2C232.5%2093.5%2C233.6%2092.0%2C235.0%2090.5%2C236.7%2088.8%2C238.5%2087.1%2C240.2%2085.4%2C241.6%2083.6%2C242.5%2081.9%2C243.0%2080.3%2C242.8%2078.8%2C242.0%2077.4%2C240.7%2076.1%2C239.0%2074.9%2C236.9%2073.9%2C234.7%2072.9%2C232.6%2071.9%2C230.7%2070.8%2C229.2%2069.6%2C228.1%2068.3%2C227.6%2066.8%2C227.6%2065.0%2C228.0%2063.1%2C228.9%2061.1%2C229.9%2058.9%2C231.0%2056.8%2C232.0%2054.6%2C232.7%2052.7%2C233.1%2050.9%2C232.9%2049.4%2C232.2%2048.3%2C230.9%2047.4%2C229.2%2046.8%2C227.1%2046.4%2C224.8%2046.2%2C222.4%2046.0%2C220.0%2045.7%2C217.9%2045.2%2C216.1%2044.4%2C214.7%2043.4%2C213.8%2041.9%2C213.2%2040.2%2C213.1%2038.1%2C213.2%2035.8%2C213.5%2033.4%2C213.8%2031.0%2C214.0%2028.8%2C214.0%2026.8%2C213.6%2025.2%2C212.8%2024.1%2C211.6%2023.4%2C210.1%2023.2%2C208.2%2023.3%2C206.0%2023.8%2C203.7%2024.4%2C201.3%2025.0%2C199.0%2025.4%2C196.9%2025.6%2C195.1%2025.4%2C193.5%2024.7%2C192.3%2023.5%2C191.3%2021.9%2C190.5%2019.9%2C189.9%2017.6%2C189.4%2015.3%2C188.9%2013.0%2C188.2%2010.9%2C187.4%209.2%2C186.4%208.0%2C185.2%207.3%2C183.7%207.2%2C182.0%207.6%2C180.1%208.5%2C178.1%209.7%2C176.1%2011.1%2C174.1%2012.4%2C172.1%2013.6%2C170.3%2014.3%2C168.6%2014.7%2C167.1%2014.5%2C165.7%2013.7%2C164.3%2012.4%2C163.1%2010.8%2C161.8%208.8%2C160.6%206.8%2C159.3%204.8%2C157.9%203.2%2C156.4%201.9%2C154.9%201.2%2C153.3%201.1%2C151.6%201.5%2C150.0%202.6%2C148.4%204.1%2C146.8%205.9%2C145.3%207.9%2C143.9%209.8%2C142.5%2011.5%2C141.2%2012.8%2C139.9%2013.7%2C138.6%2014.0%2C137.2%2013.7%2C135.7%2013.0%2C134.1%2011.8%2C132.3%2010.4%2C130.5%208.9%2C128.5%207.6%2C126.6%206.5%2C124.6%205.8%2C122.7%205.7%2C121.0%206.2%2C119.4%207.2%2C118.0%208.7%2C116.9%2010.7%2C115.9%2012.9%2C115.2%2015.2%2C114.5%2017.5%2C113.9%2019.6%2C113.2%2021.2%2C112.4%2022.5%2C111.4%2023.2%2C110.2%2023.5%2C108.7%2023.4%2C107.0%2022.9%2C104.9%2022.2%2C102.7%2021.5%2C100.4%2020.9%2C98.1%2020.5%2C95.9%2020.5%2C93.9%2021.0%2C92.2%2022.0%2C90.9%2023.4%2C89.9%2025.3%2C89.4%2027.4%2C89.1%2029.8%2C89.2%2032.2%2C89.3%2034.5%2C89.5%2036.7%2C89.6%2038.5%2C89.5%2040.1%2C89.0%2041.2%2C88.1%2041.9%2C86.8%2042.4%2C85.0%2042.6%2C83.0%2042.8%2C80.7%2042.9%2C78.2%2043.1%2C75.9%2043.5%2C73.7%2044.2%2C71.8%2045.3%2C70.4%2046.6%2C69.5%2048.3%2C69.1%2050.2%2C69.2%2052.3%2C69.7%2054.5%2C70.5%2056.7%2C71.5%2058.9%2C72.5%2060.9%2C73.3%2062.7%2C73.8%2064.2%2C73.9%2065.6%2C73.4%2066.8%2C72.4%2067.8%2C71.0%2068.7%2C69.1%2069.6%2C67.0%2070.6%2C64.7%2071.6%2C62.6%2072.7%2C60.7%2074.0%2C59.2%2075.5%2C58.2%2077.1%2C57.8%2078.8%2C58.0%2080.5%2C58.7%2082.3%2C59.9%2084.1%2C61.5%2085.9%2C63.2%2087.5%2C64.8%2089.1%2C66.3%2090.7%2C67.3%2092.1%2C67.9%2093.6%2C68.0%2095.0%2C67.5%2096.5%2C66.4%2098.0%2C65.0%2099.5%2C63.3%20101.2%2C61.5%20102.9%2C59.8%20104.6%2C58.4%20106.4%2C57.5%20108.1%2C57.0%20109.7%2C57.2%20111.2%2C58.0%20112.6%2C59.3%20113.9%2C61.0%20115.1%2C63.1%20116.1%2C65.3%20117.1%2C67.4%20118.1%2C69.3%20119.2%2C70.8%20120.4%2C71.9%20121.7%2C72.4%20123.2%2C72.4%20125.0%2C72.0%20126.9%2C71.1%20128.9%2C70.1%20131.1%2C69.0%20133.2%2C68.0%20135.4%2C67.3%20137.3%2C66.9%20139.1%2C67.1%20140.6%2C67.8%20141.7%2C69.1%20142.6%2C70.8%20143.2%2C72.9%20143.6%2C75.2%20143.8%2C77.6%20144.0%2C80.0%20144.3%2C82.1%20144.8%2C83.9%20145.6%2C85.3%20146.6%2C86.2%20148.1%2C86.8%20149.8%2C86.9%20151.9%2C86.8%20154.2%2C86.5%20156.6%2C86.2%20159.0%2C86.0%20161.2%2C86.0%20163.2%2C86.4%20164.8%2C87.2%20165.9%2C88.4%20166.6%2C89.9%20166.8%2C91.8%20166.7%2C94.0%20166.2%2C96.3%20165.6%2C98.7%20165.0%2C101.0%20164.6%2C103.1%20164.4%2C104.9%20164.6%2C106.5%20165.3%2C107.7%20166.5%2C108.7%20168.1%2C109.5%20170.1%2C110.1%20172.4%2C110.6%20174.7%2C111.1%20177.0%2C111.8%20179.1%2C112.6%20180.8%2C113.6%20182.0%2C114.8%20182.7%2C116.3%20182.8%2C118.0%20182.4%2C119.9%20181.5%2C121.9%20180.3%2C123.9%20178.9%2C125.9%20177.6%2C127.9%20176.4%2C129.7%20175.7%2C131.4%20175.3%2C132.9%20175.5%2C134.3%20176.3%2C135.7%20177.6%2C136.9%20179.2%2C138.2%20181.2%2C139.4%20183.2%2C140.7%20185.2%2C142.1%20186.8%2C143.6%20188.1%2C145.1%20188.8%2C146.7%20188.9%2C148.4%20188.5%2C150.0%22%20/%3E%3Cpolyline%20points%3D%22192.8%2C150.0%20191.0%2C151.7%20189.1%2C153.3%20187.6%2C154.9%20186.4%2C156.4%20185.7%2C157.9%20185.6%2C159.5%20186.0%2C161.2%20186.9%2C162.9%20188.2%2C164.8%20189.7%2C166.7%20191.2%2C168.7%20192.6%2C170.8%20193.7%2C172.8%20194.3%2C174.8%20194.4%2C176.6%20193.9%2C178.4%20192.8%2C179.9%20191.2%2C181.3%20189.2%2C182.4%20186.9%2C183.5%20184.6%2C184.4%20182.3%2C185.3%20180.3%2C186.2%20178.7%2C187.3%20177.5%2C188.5%20176.9%2C189.9%20176.7%2C191.6%20177.0%2C193.6%20177.5%2C195.7%20178.3%2C198.1%20179.0%2C200.5%20179.6%2C202.9%20180.0%2C205.2%20179.9%2C207.3%20179.3%2C209.0%20178.3%2C210.5%20176.7%2C211.6%20174.7%2C212.3%20172.4%2C212.7%20170.0%2C212.9%20167.4%2C213.0%20165.0%2C213.0%20162.8%2C213.2%20160.9%2C213.6%20159.4%2C214.4%20158.3%2C215.5%20157.5%2C217.1%20157.1%2C219.0%20156.9%2C221.2%20156.8%2C223.7%20156.7%2C226.2%20156.4%2C228.6%20156.0%2C230.9%20155.2%2C232.8%20154.0%2C234.3%20152.5%2C235.3%20150.7%2C235.8%20148.6%2C235.8%20146.3%2C235.4%20143.9%2C234.7%20141.5%2C233.9%20139.2%2C233.2%20137.1%2C232.6%20135.2%2C232.3%20133.5%2C232.5%20132.0%2C233.2%20130.8%2C234.4%20129.8%2C236.1%20128.8%2C238.1%20127.9%2C240.4%20126.9%2C242.7%20125.8%2C244.9%20124.6%2C246.9%20123.2%2C248.4%20121.6%2C249.4%20119.9%2C249.9%20118.0%2C249.7%20116.0%2C249.0%20114.0%2C247.8%20112.0%2C246.4%20110.0%2C244.8%20108.1%2C243.3%20106.3%2C242.0%20104.6%2C241.1%20102.9%2C240.7%20101.4%2C240.9%2099.8%2C241.6%2098.2%2C242.8%2096.6%2C244.3%2095.0%2C246.2%2093.3%2C248.0%2091.5%2C249.7%2089.7%2C251.2%2087.9%2C252.1%2086.0%2C252.5%2084.2%2C252.3%2082.5%2C251.5%2080.9%2C250.2%2079.4%2C248.4%2078.0%2C246.4%2076.7%2C244.2%2075.4%2C242.1%2074.1%2C240.3%2072.8%2C238.9%2071.4%2C238.0%2069.9%2C237.6%2068.2%2C237.7%2066.3%2C238.3%2064.3%2C239.2%2062.1%2C240.4%2059.9%2C241.5%2057.6%2C242.5%2055.4%2C243.3%2053.4%2C243.5%2051.5%2C243.3%2049.9%2C242.5%2048.6%2C241.2%2047.5%2C239.3%2046.7%2C237.1%2046.1%2C234.7%2045.6%2C232.3%2045.1%2C229.9%2044.5%2C227.7%2043.8%2C226.0%2042.8%2C224.6%2041.5%2C223.7%2039.8%2C223.2%2037.9%2C223.1%2035.6%2C223.3%2033.2%2C223.7%2030.7%2C224.0%2028.2%2C224.2%2025.9%2C224.1%2023.9%2C223.7%2022.2%2C222.8%2021.0%2C221.5%2020.2%2C219.8%2019.8%2C217.7%2019.8%2C215.4%2020.0%2C212.9%2020.4%2C210.4%2020.8%2C208.0%2021.0%2C205.8%2020.9%2C203.8%2020.4%2C202.2%2019.5%2C200.9%2018.1%2C199.9%2016.3%2C199.2%2014.1%2C198.6%2011.7%2C198.1%209.3%2C197.5%206.9%2C196.9%204.7%2C196.0%203.0%2C194.9%201.7%2C193.5%201.0%2C191.9%200.8%2C190.0%201.2%2C187.9%202.0%2C185.7%203.1%2C183.5%204.3%2C181.2%205.4%2C179.1%206.4%2C177.1%206.9%2C175.3%207.0%2C173.6%206.6%2C172.0%205.7%2C170.6%204.2%2C169.3%202.4%2C168.0%200.3%2C166.7%20-1.8%2C165.3%20-3.8%2C163.9%20-5.6%2C162.3%20-6.8%2C160.7%20-7.5%2C159.0%20-7.7%2C157.2%20-7.2%2C155.4%20-6.1%2C153.5%20-4.6%2C151.7%20-2.8%2C150.0%20-1.0%2C148.3%200.9%2C146.7%202.4%2C145.1%203.6%2C143.6%204.3%2C142.1%204.4%2C140.5%204.0%2C138.8%203.1%2C137.1%201.8%2C135.2%200.3%2C133.3%20-1.2%2C131.3%20-2.6%2C129.2%20-3.7%2C127.2%20-4.3%2C125.2%20-4.4%2C123.4%20-3.9%2C121.6%20-2.8%2C120.1%20-1.2%2C118.7%200.8%2C117.6%203.1%2C116.5%205.4%2C115.6%207.7%2C114.7%209.7%2C113.8%2011.3%2C112.7%2012.5%2C111.5%2013.1%2C110.1%2013.3%2C108.4%2013.0%2C106.4%2012.5%2C104.3%2011.7%2C101.9%2011.0%2C99.5%2010.4%2C97.1%2010.0%2C94.8%2010.1%2C92.7%2010.7%2C91.0%2011.7%2C89.5%2013.3%2C88.4%2015.3%2C87.7%2017.6%2C87.3%2020.0%2C87.1%2022.6%2C87.0%2025.0%2C87.0%2027.2%2C86.8%2029.1%2C86.4%2030.6%2C85.6%2031.7%2C84.5%2032.5%2C82.9%2032.9%2C81.0%2033.1%2C78.8%2033.2%2C76.3%2033.3%2C73.8%2033.6%2C71.4%2034.0%2C69.1%2034.8%2C67.2%2036.0%2C65.7%2037.5%2C64.7%2039.3%2C64.2%2041.4%2C64.2%2043.7%2C64.6%2046.1%2C65.3%2048.5%2C66.1%2050.8%2C66.8%2052.9%2C67.4%2054.8%2C67.7%2056.5%2C67.5%2058.0%2C66.8%2059.2%2C65.6%2060.2%2C63.9%2061.2%2C61.9%2062.1%2C59.6%2063.1%2C57.3%2064.2%2C55.1%2065.4%2C53.1%2066.8%2C51.6%2068.4%2C50.6%2070.1%2C50.1%2072.0%2C50.3%2074.0%2C51.0%2076.0%2C52.2%2078.0%2C53.6%2080.0%2C55.2%2081.9%2C56.7%2083.7%2C58.0%2085.4%2C58.9%2087.1%2C59.3%2088.6%2C59.1%2090.2%2C58.4%2091.8%2C57.2%2093.4%2C55.7%2095.0%2C53.8%2096.7%2C52.0%2098.5%2C50.3%20100.3%2C48.8%20102.1%2C47.9%20104.0%2C47.5%20105.8%2C47.7%20107.5%2C48.5%20109.1%2C49.8%20110.6%2C51.6%20112.0%2C53.6%20113.3%2C55.8%20114.6%2C57.9%20115.9%2C59.7%20117.2%2C61.1%20118.6%2C62.0%20120.1%2C62.4%20121.8%2C62.3%20123.7%2C61.7%20125.7%2C60.8%20127.9%2C59.6%20130.1%2C58.5%20132.4%2C57.5%20134.6%2C56.7%20136.6%2C56.5%20138.5%2C56.7%20140.1%2C57.5%20141.4%2C58.8%20142.5%2C60.7%20143.3%2C62.9%20143.9%2C65.3%20144.4%2C67.7%20144.9%2C70.1%20145.5%2C72.3%20146.2%2C74.0%20147.2%2C75.4%20148.5%2C76.3%20150.2%2C76.8%20152.1%2C76.9%20154.4%2C76.7%20156.8%2C76.3%20159.3%2C76.0%20161.8%2C75.8%20164.1%2C75.9%20166.1%2C76.3%20167.8%2C77.2%20169.0%2C78.5%20169.8%2C80.2%20170.2%2C82.3%20170.2%2C84.6%20170.0%2C87.1%20169.6%2C89.6%20169.2%2C92.0%20169.0%2C94.2%20169.1%2C96.2%20169.6%2C97.8%20170.5%2C99.1%20171.9%2C100.1%20173.7%2C100.8%20175.9%2C101.4%20178.3%2C101.9%20180.7%2C102.5%20183.1%2C103.1%20185.3%2C104.0%20187.0%2C105.1%20188.3%2C106.5%20189.0%2C108.1%20189.2%2C110.0%20188.8%2C112.1%20188.0%2C114.3%20186.9%2C116.5%20185.7%2C118.8%20184.6%2C120.9%20183.6%2C122.9%20183.1%2C124.7%20183.0%2C126.4%20183.4%2C128.0%20184.3%2C129.4%20185.8%2C130.7%20187.6%2C132.0%20189.7%2C133.3%20191.8%2C134.7%20193.8%2C136.1%20195.6%2C137.7%20196.8%2C139.3%20197.5%2C141.0%20197.7%2C142.8%20197.2%2C144.6%20196.1%2C146.5%20194.6%2C148.3%20192.8%2C150.0%22%20/%3E%3Cpolyline%20points%3D%22196.5%2C150.0%20195.5%2C151.8%20195.0%2C153.5%20195.0%2C155.2%20195.6%2C157.0%20196.7%2C158.9%20198.1%2C160.8%20199.7%2C162.9%20201.3%2C164.9%20202.8%2C167.1%20203.9%2C169.2%20204.5%2C171.3%20204.5%2C173.3%20204.0%2C175.2%20202.8%2C176.9%20201.2%2C178.4%20199.1%2C179.9%20196.9%2C181.1%20194.5%2C182.3%20192.3%2C183.5%20190.3%2C184.7%20188.8%2C186.0%20187.7%2C187.5%20187.2%2C189.1%20187.1%2C191.0%20187.5%2C193.1%20188.2%2C195.4%20189.0%2C197.9%20189.8%2C200.4%20190.4%2C202.9%20190.7%2C205.3%20190.6%2C207.4%20190.0%2C209.3%20188.8%2C210.9%20187.1%2C212.1%20185.0%2C213.0%20182.6%2C213.7%20180.1%2C214.1%20177.5%2C214.4%20175.0%2C214.8%20172.7%2C215.2%20170.8%2C215.9%20169.3%2C216.9%20168.3%2C218.3%20167.6%2C220.1%20167.2%2C222.2%20167.0%2C224.6%20166.9%2C227.2%20166.8%2C229.8%20166.6%2C232.3%20166.1%2C234.7%20165.2%2C236.7%20163.9%2C238.2%20162.3%2C239.3%20160.3%2C239.9%20158.0%2C240.0%20155.6%2C239.8%20153.0%2C239.3%20150.4%2C238.7%20148.0%2C238.2%20145.7%2C237.9%20143.7%2C237.9%20142.0%2C238.3%20140.5%2C239.2%20139.2%2C240.7%20138.1%2C242.5%20137.2%2C244.7%20136.2%2C247.1%20135.2%2C249.6%20134.1%2C251.9%20132.8%2C253.9%20131.3%2C255.5%20129.6%2C256.5%20127.7%2C257.0%20125.6%2C256.8%20123.4%2C256.2%20121.2%2C255.1%20119.0%2C253.8%20116.8%2C252.3%20114.6%2C251.0%20112.6%2C249.9%20110.7%2C249.2%20108.9%2C249.0%20107.2%2C249.4%20105.5%2C250.3%20103.9%2C251.7%20102.2%2C253.4%20100.5%2C255.4%2098.7%2C257.3%2096.9%2C259.1%2095.0%2C260.5%2093.1%2C261.5%2091.1%2C261.9%2089.1%2C261.7%2087.2%2C260.9%2085.4%2C259.5%2083.7%2C257.7%2082.0%2C255.7%2080.4%2C253.6%2078.9%2C251.6%2077.4%2C249.9%2075.8%2C248.6%2074.2%2C247.8%2072.5%2C247.6%2070.6%2C247.9%2068.6%2C248.6%2066.4%2C249.7%2064.2%2C250.9%2061.8%2C252.1%2059.5%2C253.2%2057.2%2C253.9%2055.0%2C254.1%2053.1%2C253.8%2051.3%2C253.0%2049.8%2C251.5%2048.5%2C249.6%2047.5%2C247.4%2046.6%2C244.9%2045.9%2C242.4%2045.1%2C240.0%2044.3%2C237.9%2043.3%2C236.1%2042.0%2C234.8%2040.4%2C234.0%2038.6%2C233.6%2036.5%2C233.6%2034.1%2C233.9%2031.5%2C234.3%2028.9%2C234.6%2026.3%2C234.8%2023.9%2C234.7%2021.8%2C234.2%2020.1%2C233.2%2018.7%2C231.8%2017.8%2C229.9%2017.3%2C227.7%2017.1%2C225.3%2017.1%2C222.6%2017.2%2C220.0%2017.3%2C217.5%2017.3%2C215.2%2016.9%2C213.2%2016.2%2C211.6%2015.0%2C210.3%2013.4%2C209.3%2011.4%2C208.5%209.1%2C208.0%206.5%2C207.5%203.9%2C206.9%201.5%2C206.2%20-0.7%2C205.3%20-2.5%2C204.1%20-3.9%2C202.6%20-4.7%2C200.8%20-4.9%2C198.7%20-4.6%2C196.5%20-4.0%2C194.1%20-3.0%2C191.6%20-2.0%2C189.2%20-1.1%2C186.9%20-0.3%2C184.7%200.0%2C182.7%20-0.1%2C180.9%20-0.8%2C179.3%20-2.0%2C177.8%20-3.6%2C176.4%20-5.6%2C175.1%20-7.8%2C173.7%20-10.0%2C172.3%20-12.1%2C170.8%20-13.9%2C169.2%20-15.2%2C167.4%20-15.9%2C165.6%20-16.0%2C163.6%20-15.5%2C161.6%20-14.5%2C159.6%20-13.1%2C157.6%20-11.4%2C155.6%20-9.6%2C153.7%20-7.9%2C151.8%20-6.5%2C150.0%20-5.5%2C148.2%20-5.0%2C146.5%20-5.0%2C144.8%20-5.6%2C143.0%20-6.7%2C141.1%20-8.1%2C139.2%20-9.7%2C137.1%20-11.3%2C135.1%20-12.8%2C132.9%20-13.9%2C130.8%20-14.5%2C128.7%20-14.5%2C126.7%20-14.0%2C124.8%20-12.8%2C123.1%20-11.2%2C121.6%20-9.1%2C120.1%20-6.9%2C118.9%20-4.5%2C117.7%20-2.3%2C116.5%20-0.3%2C115.3%201.2%2C114.0%202.3%2C112.5%202.8%2C110.9%202.9%2C109.0%202.5%2C106.9%201.8%2C104.6%201.0%2C102.1%200.2%2C99.6%20-0.4%2C97.1%20-0.7%2C94.7%20-0.6%2C92.6%200.0%2C90.7%201.2%2C89.1%202.9%2C87.9%205.0%2C87.0%207.4%2C86.3%209.9%2C85.9%2012.5%2C85.6%2015.0%2C85.2%2017.3%2C84.8%2019.2%2C84.1%2020.7%2C83.1%2021.7%2C81.7%2022.4%2C79.9%2022.8%2C77.8%2023.0%2C75.4%2023.1%2C72.8%2023.2%2C70.2%2023.4%2C67.7%2023.9%2C65.3%2024.8%2C63.3%2026.1%2C61.8%2027.7%2C60.7%2029.7%2C60.1%2032.0%2C60.0%2034.4%2C60.2%2037.0%2C60.7%2039.6%2C61.3%2042.0%2C61.8%2044.3%2C62.1%2046.3%2C62.1%2048.0%2C61.7%2049.5%2C60.8%2050.8%2C59.3%2051.9%2C57.5%2052.8%2C55.3%2053.8%2C52.9%2054.8%2C50.4%2055.9%2C48.1%2057.2%2C46.1%2058.7%2C44.5%2060.4%2C43.5%2062.3%2C43.0%2064.4%2C43.2%2066.6%2C43.8%2068.8%2C44.9%2071.0%2C46.2%2073.2%2C47.7%2075.4%2C49.0%2077.4%2C50.1%2079.3%2C50.8%2081.1%2C51.0%2082.8%2C50.6%2084.5%2C49.7%2086.1%2C48.3%2087.8%2C46.6%2089.5%2C44.6%2091.3%2C42.7%2093.1%2C40.9%2095.0%2C39.5%2096.9%2C38.5%2098.9%2C38.1%20100.9%2C38.3%20102.8%2C39.1%20104.6%2C40.5%20106.3%2C42.3%20108.0%2C44.3%20109.6%2C46.4%20111.1%2C48.4%20112.6%2C50.1%20114.2%2C51.4%20115.8%2C52.2%20117.5%2C52.4%20119.4%2C52.1%20121.4%2C51.4%20123.6%2C50.3%20125.8%2C49.1%20128.2%2C47.9%20130.5%2C46.8%20132.8%2C46.1%20135.0%2C45.9%20136.9%2C46.2%20138.7%2C47.0%20140.2%2C48.5%20141.5%2C50.4%20142.5%2C52.6%20143.4%2C55.1%20144.1%2C57.6%20144.9%2C60.0%20145.7%2C62.1%20146.7%2C63.9%20148.0%2C65.2%20149.6%2C66.0%20151.4%2C66.4%20153.5%2C66.4%20155.9%2C66.1%20158.5%2C65.7%20161.1%2C65.4%20163.7%2C65.2%20166.1%2C65.3%20168.2%2C65.8%20169.9%2C66.8%20171.3%2C68.2%20172.2%2C70.1%20172.7%2C72.3%20172.9%2C74.7%20172.9%2C77.4%20172.8%2C80.0%20172.7%2C82.5%20172.7%2C84.8%20173.1%2C86.8%20173.8%2C88.4%20175.0%2C89.7%20176.6%2C90.7%20178.6%2C91.5%20180.9%2C92.0%20183.5%2C92.5%20186.1%2C93.1%20188.5%2C93.8%20190.7%2C94.7%20192.5%2C95.9%20193.9%2C97.4%20194.7%2C99.2%20194.9%2C101.3%20194.6%2C103.5%20194.0%2C105.9%20193.0%2C108.4%20192.0%2C110.8%20191.1%2C113.1%20190.3%2C115.3%20190.0%2C117.3%20190.1%2C119.1%20190.8%2C120.7%20192.0%2C122.2%20193.6%2C123.6%20195.6%2C124.9%20197.8%2C126.3%20200.0%2C127.7%20202.1%2C129.2%20203.9%2C130.8%20205.2%2C132.6%20205.9%2C134.4%20206.0%2C136.4%20205.5%2C138.4%20204.5%2C140.4%20203.1%2C142.4%20201.4%2C144.4%20199.6%2C146.3%20197.9%2C148.2%20196.5%2C150.0%22%20/%3E%3Cpolyline%20points%3D%22204.2%2C150.0%20205.0%2C151.9%20206.3%2C153.9%20207.8%2C155.9%20209.6%2C158.0%20211.3%2C160.2%20212.7%2C162.4%20213.9%2C164.6%20214.5%2C166.8%20214.5%2C168.9%20213.9%2C171.0%20212.7%2C172.9%20211.1%2C174.7%20209.0%2C176.3%20206.7%2C177.9%20204.4%2C179.3%20202.3%2C180.8%20200.4%2C182.2%20199.0%2C183.8%20198.1%2C185.5%20197.7%2C187.4%20197.7%2C189.4%20198.2%2C191.7%20199.0%2C194.2%20199.9%2C196.7%20200.8%2C199.3%20201.4%2C201.9%20201.7%2C204.4%20201.5%2C206.6%20200.8%2C208.7%20199.6%2C210.4%20197.8%2C211.8%20195.6%2C212.9%20193.1%2C213.7%20190.5%2C214.4%20187.8%2C215.0%20185.3%2C215.6%20183.0%2C216.3%20181.2%2C217.3%20179.7%2C218.6%20178.7%2C220.2%20178.1%2C222.2%20177.7%2C224.5%20177.6%2C227.1%20177.6%2C229.8%20177.5%2C232.5%20177.2%2C235.2%20176.7%2C237.6%20175.7%2C239.7%20174.4%2C241.3%20172.6%2C242.5%20170.5%2C243.2%20168.1%2C243.5%20165.4%2C243.4%20162.7%2C243.2%20160.0%2C242.8%20157.4%2C242.5%20155.0%2C242.5%20152.9%2C242.7%20151.1%2C243.4%20149.6%2C244.6%20148.4%2C246.3%20147.3%2C248.3%20146.3%2C250.7%20145.3%2C253.2%20144.3%2C255.8%20143.2%2C258.2%20141.8%2C260.2%20140.2%2C261.9%20138.4%2C263.0%20136.3%2C263.5%20134.1%2C263.4%20131.7%2C262.8%20129.2%2C261.9%20126.7%2C260.7%20124.3%2C259.4%20122.0%2C258.3%20119.8%2C257.4%20117.7%2C257.0%20115.8%2C257.0%20114.0%2C257.6%20112.2%2C258.7%20110.5%2C260.3%20108.8%2C262.2%20107.0%2C264.2%20105.2%2C266.3%20103.3%2C268.1%20101.3%2C269.6%2099.2%2C270.6%2097.1%2C271.0%2095.0%2C270.8%2092.9%2C269.9%2090.9%2C268.6%2088.9%2C266.8%2087.0%2C264.9%2085.1%2C262.9%2083.3%2C261.0%2081.6%2C259.4%2079.8%2C258.3%2077.9%2C257.7%2076.0%2C257.6%2074.0%2C258.0%2071.8%2C258.9%2069.6%2C260.1%2067.2%2C261.4%2064.8%2C262.7%2062.4%2C263.8%2060.0%2C264.5%2057.7%2C264.7%2055.6%2C264.4%2053.7%2C263.5%2052.0%2C262.0%2050.6%2C260.0%2049.3%2C257.7%2048.2%2C255.2%2047.1%2C252.7%2046.1%2C250.3%2045.0%2C248.2%2043.7%2C246.5%2042.2%2C245.3%2040.4%2C244.6%2038.3%2C244.3%2036.0%2C244.4%2033.5%2C244.8%2030.8%2C245.2%2028.1%2C245.6%2025.4%2C245.8%2022.9%2C245.6%2020.7%2C245.1%2018.9%2C244.0%2017.4%2C242.5%2016.3%2C240.5%2015.6%2C238.2%2015.2%2C235.6%2015.0%2C232.8%2014.9%2C230.1%2014.7%2C227.5%2014.4%2C225.2%2013.7%2C223.2%2012.7%2C221.5%2011.3%2C220.2%209.5%2C219.3%207.3%2C218.6%204.8%2C218.0%202.1%2C217.5%20-0.6%2C216.9%20-3.2%2C216.2%20-5.4%2C215.2%20-7.3%2C213.9%20-8.7%2C212.3%20-9.6%2C210.4%20-9.9%2C208.2%20-9.8%2C205.7%20-9.3%2C203.1%20-8.5%2C200.5%20-7.7%2C197.9%20-7.0%2C195.4%20-6.5%2C193.1%20-6.4%2C191.0%20-6.8%2C189.1%20-7.7%2C187.4%20-9.1%2C185.8%20-10.9%2C184.4%20-13.1%2C183.0%20-15.4%2C181.7%20-17.7%2C180.2%20-19.9%2C178.6%20-21.7%2C176.9%20-23.0%2C175.1%20-23.8%2C173.1%20-23.9%2C171.0%20-23.5%2C168.8%20-22.5%2C166.5%20-21.1%2C164.3%20-19.5%2C162.0%20-17.9%2C159.9%20-16.3%2C157.8%20-15.1%2C155.8%20-14.3%2C153.8%20-14.0%2C151.9%20-14.2%2C150.0%20-15.0%2C148.1%20-16.3%2C146.1%20-17.8%2C144.1%20-19.6%2C142.0%20-21.3%2C139.8%20-22.7%2C137.6%20-23.9%2C135.4%20-24.5%2C133.2%20-24.5%2C131.1%20-23.9%2C129.0%20-22.7%2C127.1%20-21.1%2C125.3%20-19.0%2C123.7%20-16.7%2C122.1%20-14.4%2C120.7%20-12.3%2C119.2%20-10.4%2C117.8%20-9.0%2C116.2%20-8.1%2C114.5%20-7.7%2C112.6%20-7.7%2C110.6%20-8.2%2C108.3%20-9.0%2C105.8%20-9.9%2C103.3%20-10.8%2C100.7%20-11.4%2C98.1%20-11.7%2C95.6%20-11.5%2C93.4%20-10.8%2C91.3%20-9.6%2C89.6%20-7.8%2C88.2%20-5.6%2C87.1%20-3.1%2C86.3%20-0.5%2C85.6%202.2%2C85.0%204.7%2C84.4%207.0%2C83.7%208.8%2C82.7%2010.3%2C81.4%2011.3%2C79.8%2011.9%2C77.8%2012.3%2C75.5%2012.4%2C72.9%2012.4%2C70.2%2012.5%2C67.5%2012.8%2C64.8%2013.3%2C62.4%2014.3%2C60.3%2015.6%2C58.7%2017.4%2C57.5%2019.5%2C56.8%2021.9%2C56.5%2024.6%2C56.6%2027.3%2C56.8%2030.0%2C57.2%2032.6%2C57.5%2035.0%2C57.5%2037.1%2C57.3%2038.9%2C56.6%2040.4%2C55.4%2041.6%2C53.7%2042.7%2C51.7%2043.7%2C49.3%2044.7%2C46.8%2045.7%2C44.2%2046.8%2C41.8%2048.2%2C39.8%2049.8%2C38.1%2051.6%2C37.0%2053.7%2C36.5%2055.9%2C36.6%2058.3%2C37.2%2060.8%2C38.1%2063.3%2C39.3%2065.7%2C40.6%2068.0%2C41.7%2070.2%2C42.6%2072.3%2C43.0%2074.2%2C43.0%2076.0%2C42.4%2077.8%2C41.3%2079.5%2C39.7%2081.2%2C37.8%2083.0%2C35.8%2084.8%2C33.7%2086.7%2C31.9%2088.7%2C30.4%2090.8%2C29.4%2092.9%2C29.0%2095.0%2C29.2%2097.1%2C30.1%2099.1%2C31.4%20101.1%2C33.2%20103.0%2C35.1%20104.9%2C37.1%20106.7%2C39.0%20108.4%2C40.6%20110.2%2C41.7%20112.1%2C42.3%20114.0%2C42.4%20116.0%2C42.0%20118.2%2C41.1%20120.4%2C39.9%20122.8%2C38.6%20125.2%2C37.3%20127.6%2C36.2%20130.0%2C35.5%20132.3%2C35.3%20134.4%2C35.6%20136.3%2C36.5%20138.0%2C38.0%20139.4%2C40.0%20140.7%2C42.3%20141.8%2C44.8%20142.9%2C47.3%20143.9%2C49.7%20145.0%2C51.8%20146.3%2C53.5%20147.8%2C54.7%20149.6%2C55.4%20151.7%2C55.7%20154.0%2C55.6%20156.5%2C55.2%20159.2%2C54.8%20161.9%2C54.4%20164.6%2C54.2%20167.1%2C54.4%20169.3%2C54.9%20171.1%2C56.0%20172.6%2C57.5%20173.7%2C59.5%20174.4%2C61.8%20174.8%2C64.4%20175.0%2C67.2%20175.1%2C69.9%20175.3%2C72.5%20175.6%2C74.8%20176.3%2C76.8%20177.3%2C78.5%20178.7%2C79.8%20180.5%2C80.7%20182.7%2C81.4%20185.2%2C82.0%20187.9%2C82.5%20190.6%2C83.1%20193.2%2C83.8%20195.4%2C84.8%20197.3%2C86.1%20198.7%2C87.7%20199.6%2C89.6%20199.9%2C91.8%20199.8%2C94.3%20199.3%2C96.9%20198.5%2C99.5%20197.7%2C102.1%20197.0%2C104.6%20196.5%2C106.9%20196.4%2C109.0%20196.8%2C110.9%20197.7%2C112.6%20199.1%2C114.2%20200.9%2C115.6%20203.1%2C117.0%20205.4%2C118.3%20207.7%2C119.8%20209.9%2C121.4%20211.7%2C123.1%20213.0%2C124.9%20213.8%2C126.9%20213.9%2C129.0%20213.5%2C131.2%20212.5%2C133.5%20211.1%2C135.7%20209.5%2C138.0%20207.9%2C140.1%20206.3%2C142.2%20205.1%2C144.2%20204.3%2C146.2%20204.0%2C148.1%20204.2%2C150.0%22%20/%3E%3Cpolyline%20points%3D%220%2C20.0%208%2C23.4%2016%2C25.7%2024%2C26.2%2032%2C25.2%2040%2C23.5%2048%2C22.1%2056%2C21.8%2064%2C22.4%2072%2C23.5%2080%2C23.9%2088%2C23.0%2096%2C20.5%20104%2C17.2%20112%2C14.2%20120%2C12.5%20128%2C12.6%20136%2C14.4%20144%2C17.0%20152%2C19.1%20160%2C20.1%20168%2C19.9%20176%2C19.1%20184%2C18.9%20192%2C19.8%20200%2C21.9%20208%2C24.7%20216%2C27.1%20224%2C27.9%20232%2C26.9%20240%2C24.3%20248%2C21.1%20256%2C18.5%20264%2C17.3%20272%2C17.4%20280%2C18.2%20288%2C18.8%20296%2C18.4%20304%2C16.8%20312%2C14.8%20320%2C13.3%20328%2C13.2%20336%2C15.0%20344%2C18.2%20352%2C21.7%20360%2C24.3%20368%2C25.4%20376%2C24.9%20384%2C23.5%20392%2C22.3%20400%2C22.0%22%20/%3E%3Cpolyline%20points%3D%220%2C36.3%208%2C37.8%2016%2C37.5%2024%2C35.8%2032%2C33.8%2040%2C32.5%2048%2C32.3%2056%2C33.0%2064%2C33.8%2072%2C33.7%2080%2C32.2%2088%2C29.4%2096%2C26.2%20104%2C23.8%20112%2C23.1%20120%2C24.2%20128%2C26.7%20136%2C29.5%20144%2C31.4%20152%2C32.1%20160%2C31.6%20168%2C31.0%20176%2C30.9%20184%2C32.2%20192%2C34.5%20200%2C36.9%20208%2C38.5%20216%2C38.4%20224%2C36.4%20232%2C33.3%20240%2C30.0%20248%2C27.8%20256%2C27.2%20264%2C27.8%20272%2C28.8%20280%2C29.3%20288%2C28.7%20296%2C27.1%20304%2C25.5%20312%2C24.7%20320%2C25.5%20328%2C28.1%20336%2C31.6%20344%2C34.8%20352%2C36.8%20360%2C37.1%20368%2C35.9%20376%2C34.2%20384%2C33.0%20392%2C32.9%20400%2C33.7%22%20/%3E%3Cpolyline%20points%3D%220%2C49.4%208%2C48.2%2016%2C46.0%2024%2C43.8%2032%2C42.6%2040%2C42.6%2048%2C43.4%2056%2C43.9%2064%2C43.3%2072%2C41.4%2080%2C38.5%2088%2C35.7%2096%2C34.1%20104%2C34.4%20112%2C36.5%20120%2C39.4%20128%2C42.2%20136%2C43.8%20144%2C44.0%20152%2C43.4%20160%2C42.7%20168%2C43.0%20176%2C44.4%20184%2C46.6%20192%2C48.6%20200%2C49.3%20208%2C48.2%20216%2C45.5%20224%2C42.0%20232%2C39.0%20240%2C37.4%20248%2C37.4%20256%2C38.4%20264%2C39.6%20272%2C40.0%20280%2C39.3%20288%2C37.9%20296%2C36.7%20304%2C36.6%20312%2C38.3%20320%2C41.4%20328%2C44.9%20336%2C47.7%20344%2C48.9%20352%2C48.3%20360%2C46.5%20368%2C44.6%20376%2C43.4%20384%2C43.4%20392%2C44.2%20400%2C45.0%22%20/%3E%3Cpolyline%20points%3D%220%2C58.3%208%2C55.7%2016%2C53.6%2024%2C52.7%2032%2C52.9%2040%2C53.6%2048%2C53.8%2056%2C52.9%2064%2C50.7%2072%2C47.9%2080%2C45.8%2088%2C45.1%2096%2C46.4%20104%2C49.2%20112%2C52.4%20120%2C54.9%20128%2C56.1%20136%2C55.8%20144%2C54.9%20152%2C54.4%20160%2C54.8%20168%2C56.4%20176%2C58.3%20184%2C59.7%20192%2C59.5%20200%2C57.5%20208%2C54.2%20216%2C50.7%20224%2C48.2%20232%2C47.3%20240%2C48.0%20248%2C49.5%20256%2C50.7%20264%2C51.0%20272%2C50.2%20280%2C49.0%20288%2C48.3%20296%2C49.0%20304%2C51.3%20312%2C54.7%20320%2C57.9%20328%2C60.0%20336%2C60.3%20344%2C58.8%20352%2C56.6%20360%2C54.6%20368%2C53.6%20376%2C53.8%20384%2C54.6%20392%2C55.0%20400%2C54.1%22%20/%3E%3Cpolyline%20points%3D%220%2C65.1%208%2C63.2%2016%2C62.6%2024%2C63.1%2032%2C63.8%2040%2C63.8%2048%2C62.5%2056%2C60.2%2064%2C57.9%2072%2C56.5%2080%2C56.8%2088%2C59.0%2096%2C62.3%20104%2C65.5%20112%2C67.6%20120%2C68.1%20128%2C67.4%20136%2C66.3%20144%2C65.8%20152%2C66.4%20160%2C67.9%20168%2C69.5%20176%2C70.1%20184%2C69.0%20192%2C66.4%20200%2C62.8%20208%2C59.7%20216%2C57.8%20224%2C57.8%20232%2C59.1%20240%2C60.9%20248%2C62.1%20256%2C62.3%20264%2C61.4%20272%2C60.5%20280%2C60.4%20288%2C61.8%20296%2C64.5%20304%2C67.8%20312%2C70.6%20320%2C71.7%20328%2C71.0%20336%2C68.9%20344%2C66.3%20352%2C64.4%20360%2C63.7%20368%2C64.1%20376%2C64.8%20384%2C64.8%20392%2C63.6%20400%2C61.2%22%20/%3E%3Cpolyline%20points%3D%220%2C72.8%208%2C72.7%2016%2C73.4%2024%2C74.1%2032%2C73.8%2040%2C72.3%2048%2C70.2%2056%2C68.4%2064%2C67.8%2072%2C69.2%2080%2C72.1%2088%2C75.6%2096%2C78.5%20104%2C79.9%20112%2C79.8%20120%2C78.6%20128%2C77.4%20136%2C77.0%20144%2C77.7%20152%2C79.1%20160%2C80.2%20168%2C80.0%20176%2C78.2%20184%2C75.1%20192%2C71.6%20200%2C68.9%20208%2C68.0%20216%2C68.8%20224%2C70.7%20232%2C72.7%20240%2C73.8%20248%2C73.7%20256%2C72.9%20264%2C72.3%20272%2C72.8%20280%2C74.6%20288%2C77.6%20296%2C80.6%20304%2C82.6%20312%2C82.8%20320%2C81.1%20328%2C78.4%20336%2C75.7%20344%2C74.1%20352%2C73.7%20360%2C74.3%20368%2C75.0%20376%2C74.7%20384%2C73.2%20392%2C70.8%20400%2C68.5%22%20/%3E%3Cpolyline%20points%3D%220%2C82.9%208%2C83.9%2016%2C84.5%2024%2C84.0%2032%2C82.5%2040%2C80.6%2048%2C79.5%2056%2C79.9%2064%2C82.0%2072%2C85.4%2080%2C88.8%2088%2C91.2%2096%2C91.9%20104%2C91.0%20112%2C89.5%20120%2C88.2%20128%2C87.9%20136%2C88.7%20144%2C89.9%20152%2C90.4%20160%2C89.5%20168%2C87.1%20176%2C83.7%20184%2C80.6%20192%2C78.7%20200%2C78.7%20208%2C80.3%20216%2C82.7%20224%2C84.7%20232%2C85.6%20240%2C85.4%20248%2C84.7%20256%2C84.4%20264%2C85.3%20272%2C87.5%20280%2C90.4%20288%2C92.9%20296%2C94.0%20304%2C93.1%20312%2C90.7%20320%2C87.6%20328%2C85.1%20336%2C83.8%20344%2C83.9%20352%2C84.7%20360%2C85.2%20368%2C84.6%20376%2C83.0%20384%2C80.8%20392%2C79.1%20400%2C78.9%22%20/%3E%3Cpolyline%20points%3D%220%2C94.6%208%2C95.1%2016%2C94.5%2024%2C93.0%2032%2C91.6%2040%2C91.1%2048%2C92.4%2056%2C95.2%2064%2C98.8%2072%2C101.8%2080%2C103.5%2088%2C103.3%2096%2C101.8%20104%2C100.0%20112%2C98.7%20120%2C98.6%20128%2C99.4%20136%2C100.3%20144%2C100.2%20152%2C98.8%20160%2C95.9%20168%2C92.7%20176%2C90.1%20184%2C89.2%20192%2C90.1%20200%2C92.4%20208%2C95.1%20216%2C97.0%20224%2C97.6%20232%2C97.1%20240%2C96.5%20248%2C96.5%20256%2C97.8%20264%2C100.2%20272%2C102.8%20280%2C104.6%20288%2C104.6%20296%2C102.8%20304%2C99.8%20312%2C96.6%20320%2C94.4%20328%2C93.7%20336%2C94.2%20344%2C95.1%20352%2C95.5%20360%2C94.8%20368%2C93.1%20376%2C91.3%20384%2C90.3%20392%2C91.1%20400%2C93.5%22%20/%3E%3Cpolyline%20points%3D%220%2C106.0%208%2C105.3%2016%2C104.0%2024%2C103.0%2032%2C103.3%2040%2C105.3%2048%2C108.5%2056%2C112.0%2064%2C114.4%2072%2C115.2%2080%2C114.2%2088%2C112.1%2096%2C110.1%20104%2C109.0%20112%2C109.1%20120%2C109.8%20128%2C110.4%20136%2C109.8%20144%2C107.9%20152%2C104.9%20160%2C102.0%20168%2C100.2%20176%2C100.3%20184%2C102.2%20192%2C105.0%20200%2C107.7%20208%2C109.3%20216%2C109.5%20224%2C108.9%20232%2C108.3%20240%2C108.6%20248%2C110.1%20256%2C112.5%20264%2C114.6%20272%2C115.5%20280%2C114.6%20288%2C112.0%20296%2C108.6%20304%2C105.6%20312%2C103.9%20320%2C103.8%20328%2C104.7%20336%2C105.8%20344%2C106.1%20352%2C105.3%20360%2C103.7%20368%2C102.3%20376%2C102.2%20384%2C103.7%20392%2C106.7%20400%2C110.3%22%20/%3E%3Cpolyline%20points%3D%220%2C116.4%208%2C115.3%2016%2C114.9%2024%2C115.9%2032%2C118.5%2040%2C121.8%2048%2C124.8%2056%2C126.5%2064%2C126.3%2072%2C124.5%2080%2C122.0%2088%2C120.0%2096%2C119.1%20104%2C119.4%20112%2C120.1%20120%2C120.3%20128%2C119.3%20136%2C117.1%20144%2C114.2%20152%2C111.9%20160%2C111.0%20168%2C112.1%20176%2C114.7%20184%2C117.9%20192%2C120.4%20200%2C121.5%20208%2C121.4%20216%2C120.5%20224%2C120.0%20232%2C120.6%20240%2C122.2%20248%2C124.4%20256%2C125.9%20264%2C125.9%20272%2C124.0%20280%2C120.8%20288%2C117.4%20296%2C114.8%20304%2C113.8%20312%2C114.3%20320%2C115.6%20328%2C116.8%20336%2C116.9%20344%2C116.0%20352%2C114.7%20360%2C113.9%20368%2C114.5%20376%2C116.7%20384%2C120.1%20392%2C123.4%20400%2C125.7%22%20/%3E%3Cpolyline%20points%3D%220%2C127.0%208%2C127.1%2016%2C128.7%2024%2C131.6%2032%2C134.8%2040%2C137.2%2048%2C137.9%2056%2C136.7%2064%2C134.2%2072%2C131.5%2080%2C129.7%2088%2C129.1%2096%2C129.6%20104%2C130.3%20112%2C130.2%20120%2C128.9%20128%2C126.5%20136%2C124.0%20144%2C122.4%20152%2C122.6%20160%2C124.6%20168%2C127.7%20176%2C130.9%20184%2C133.0%20192%2C133.6%20200%2C133.0%20208%2C132.0%20216%2C131.6%20224%2C132.3%20232%2C134.0%20240%2C135.7%20248%2C136.5%20256%2C135.6%20264%2C133.0%20272%2C129.5%20280%2C126.2%20288%2C124.3%20296%2C124.1%20304%2C125.2%20312%2C126.9%20320%2C128.0%20328%2C128.0%20336%2C127.1%20344%2C126.1%20352%2C125.9%20360%2C127.2%20368%2C129.9%20376%2C133.3%20384%2C136.2%20392%2C137.6%20400%2C137.0%22%20/%3E%3Cpolyline%20points%3D%220%2C139.6%208%2C141.6%2016%2C144.5%2024%2C147.3%2032%2C148.9%2040%2C148.6%2048%2C146.5%2056%2C143.6%2064%2C140.9%2072%2C139.4%2080%2C139.2%2088%2C139.9%2096%2C140.5%20104%2C140.1%20112%2C138.6%20120%2C136.3%20128%2C134.3%20136%2C133.6%20144%2C134.7%20152%2C137.5%20160%2C141.0%20168%2C143.9%20176%2C145.4%20184%2C145.4%20192%2C144.4%20200%2C143.3%20208%2C143.0%20216%2C143.8%20224%2C145.3%20232%2C146.5%20240%2C146.5%20248%2C144.8%20256%2C141.7%20264%2C138.1%20272%2C135.4%20280%2C134.3%20288%2C134.9%20296%2C136.7%20304%2C138.5%20312%2C139.5%20320%2C139.4%20328%2C138.5%20336%2C137.8%20344%2C138.2%20352%2C140.1%20360%2C143.1%20368%2C146.3%20376%2C148.4%20384%2C148.8%20392%2C147.3%20400%2C144.8%22%20/%3E%3Cpolyline%20points%3D%220%2C154.4%208%2C157.1%2016%2C159.3%2024%2C159.9%2032%2C158.6%2040%2C155.8%2048%2C152.6%2056%2C150.2%2064%2C149.1%2072%2C149.4%2080%2C150.3%2088%2C150.8%2096%2C150.2%20104%2C148.6%20112%2C146.5%20120%2C145.2%20128%2C145.4%20136%2C147.5%20144%2C150.8%20152%2C154.2%20160%2C156.7%20168%2C157.5%20176%2C156.8%20184%2C155.4%20192%2C154.2%20200%2C154.1%20208%2C155.0%20216%2C156.2%20224%2C156.9%20232%2C156.1%20240%2C153.7%20248%2C150.3%20256%2C147.1%20264%2C145.0%20272%2C144.9%20280%2C146.3%20288%2C148.5%20296%2C150.4%20304%2C151.2%20312%2C151.0%20320%2C150.2%20328%2C149.8%20336%2C150.7%20344%2C153.0%20352%2C156.0%20360%2C158.7%20368%2C160.0%20376%2C159.3%20384%2C157.0%20392%2C154.1%20400%2C151.6%22%20/%3E%3Cpolyline%20points%3D%220%2C169.3%208%2C170.6%2016%2C170.2%2024%2C168.0%2032%2C164.7%2040%2C161.6%2048%2C159.6%2056%2C159.1%2064%2C159.8%2072%2C160.9%2080%2C161.3%2088%2C160.5%2096%2C158.9%20104%2C157.3%20112%2C156.7%20120%2C157.9%20128%2C160.6%20136%2C164.1%20144%2C167.3%20152%2C169.1%20160%2C169.1%20168%2C167.7%20176%2C166.0%20184%2C164.9%20192%2C164.9%20200%2C165.8%20208%2C166.7%20216%2C166.8%20224%2C165.3%20232%2C162.5%20240%2C159.1%20248%2C156.4%20256%2C155.3%20264%2C156.1%20272%2C158.2%20280%2C160.7%20288%2C162.5%20296%2C163.1%20304%2C162.7%20312%2C162.0%20320%2C162.0%20328%2C163.3%20336%2C165.8%20344%2C168.6%20352%2C170.5%20360%2C170.8%20368%2C169.2%20376%2C166.3%20384%2C163.2%20392%2C161.0%20400%2C160.2%22%20/%3E%3C/g%3E%3C/svg%3E';

// עיצוב תיק הנהג
const styles = StyleSheet.create({
  rowOff: { opacity: 0.4 },
  ...pageStyles,

  // "טפסים לחתימה" head with "+ הוסף תיקייה" beside it

  // Header portrait
  heroWho: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14 },
  // עיגול התמונה/ראשי התיבות
  portrait: {
    width: 60,
    height: 60,
    borderRadius: 30,
    padding: 3,
    backgroundColor: DESKTOP_COLORS.brand,
    ...webOnly({ backgroundImage: 'conic-gradient(from 210deg, #2F5BFF, #5CC3F0, #2F5BFF)' }),
  },
  portraitMuted: { backgroundColor: '#C9D2DA', ...webOnly({ backgroundImage: 'none' }) },
  portraitInner: {
    flex: 1,
    borderRadius: 27,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: '#E6F3FA',
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ backgroundImage: 'linear-gradient(160deg, #F2F9FD, #DCEFF9)' }),
  },
  portraitText: { fontSize: 21, color: '#0072AD', letterSpacing: -0.3 },
  portraitDot: { position: 'absolute', bottom: 1, start: 1, width: 15, height: 15, borderRadius: 8, borderWidth: 3, borderColor: '#FFFFFF' },

  // Rows
  revealPill: { height: 22, paddingHorizontal: 8, borderRadius: 11, justifyContent: 'center', backgroundColor: 'rgba(47,91,255,0.09)', ...webOnly({ transition: 'background-color 150ms ease' }) },
  revealText: { fontSize: 12.5, color: DESKTOP_COLORS.brand },

  // Licence card
  licenceArea: { padding: 14, paddingBottom: 12 },
  // כרטיס הרישיון
  licence: {
    // ID-1 card proportions (85.6 × 54 mm).
    width: '100%',
    maxWidth: 380,
    aspectRatio: 1.586,
    alignSelf: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(20,90,130,0.18)',
    backgroundColor: '#D7EEF2',
    ...webOnly({
      // Pale cyan-teal base with soft decorative waves, in the colours of the Israeli licence.
      backgroundImage:
        `url("${LICENCE_PATTERN}"), radial-gradient(90% 120% at 100% 0%, rgba(255,255,255,0.75), transparent 60%), linear-gradient(150deg, #EEF8F9 0%, #D9EFF3 50%, #C6E6EC 100%)`,
      backgroundSize: '100% 100%, auto, auto',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 10px 22px -12px rgba(20,45,90,0.45), 0 1px 3px rgba(22,34,46,0.10)',
      transform: 'perspective(900px) rotateX(4deg) rotateY(5deg)',
      transition: `transform 500ms ${EASE_OUT}, box-shadow 500ms ${EASE_OUT}`,
      cursor: 'pointer',
    }),
  },
  licenceHover: webOnly({
    transform: 'perspective(900px) rotateX(0deg) rotateY(0deg)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 16px 30px -14px rgba(20,45,90,0.5), 0 1px 3px rgba(22,34,46,0.10)',
  }),
  // Header block, right side, ending before the emblem area.
  licenceTop: { position: 'absolute', top: '5%', right: '13%', left: '26%', alignItems: 'flex-end' },
  licenceTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  licenceTitle: { fontSize: 15, color: LICENCE_BLUE, letterSpacing: -0.2 },
  licenceTitleEn: { fontSize: 12.5, color: LICENCE_BLUE, letterSpacing: 0.3 },
  licenceState: { fontSize: 10.5, color: LICENCE_BLUE },
  licenceStateEn: { fontSize: 9.5, color: LICENCE_BLUE, letterSpacing: 0.4 },
  // Fields read left to right like the card: code, then value.
  licenceMain: { position: 'absolute', top: '38%', left: '33%', right: '36%', gap: 10 },
  licenceSide: { position: 'absolute', top: '60%', left: '66%', right: '3%', gap: 4 },
  licenceField: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  licenceCode: { fontSize: 10.5, color: LICENCE_INK, minWidth: 20, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  // Large photo on the left, small faded copy on the right.
  licencePhoto: {
    position: 'absolute',
    top: '33%',
    left: '5%',
    width: '25%',
    height: '52%',
    borderRadius: 3,
    backgroundColor: '#F4F7F9',
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ backgroundImage: 'linear-gradient(170deg, #FFFFFF, #D9E4EA)', boxShadow: '0 0 0 1px rgba(20,60,90,0.12)' }),
  },
  licencePhotoText: { fontSize: 22, color: '#5C7699' },
  licenceGhost: { position: 'absolute', top: '28%', right: '4%', width: '8%', height: '17%', borderRadius: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.35)' },
  licenceGhostText: { fontSize: 9, color: 'rgba(60,90,120,0.4)' },
  licenceName: { fontSize: 13.5, color: LICENCE_INK, flexShrink: 1 },
  licenceLine: { fontSize: 12, lineHeight: 17, color: LICENCE_INK, flexShrink: 1, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  licenceFoot: { position: 'absolute', left: '5%', bottom: '5%', flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  licenceClassText: { fontSize: 13, color: LICENCE_INK, letterSpacing: 1.5 },

  // שורת תמונות הרישיון
  photosRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, minHeight: 42, paddingHorizontal: 16, paddingVertical: 7, ...webOnly({ transition: 'background-color 150ms ease' }) },
  sideChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: DESKTOP_TONES.ok.bg },
  sideChipMissing: { backgroundColor: '#EEF1F4' },
  sideChipText: { fontSize: 12.5, color: DESKTOP_TONES.ok.fg },
  sideChipTextMissing: { color: DESKTOP_COLORS.inkMuted },

  // רשת התיקיות
  // Documents
  // Left-column cards: as tall as the card beside them, the list scrolls inside.
  pinnedArea: { flexGrow: 1, minHeight: 320 },
  pinnedScroll: { flex: 1, minHeight: 0 },
  pinnedFooter: { flexDirection: 'row-reverse', padding: 12 },
  // שלוש עמודות למעלה, ושתיים מתחת
  // Three columns need ~1160px; a narrower screen wraps the licence and work under the details.
  cell3Wide: { flexGrow: 1.25, flexBasis: 460, minWidth: 0 },
  cell3: { flexGrow: 1, flexBasis: 330, minWidth: 0 },
  // Work and permits: stacked in a narrow column, side by side when it wraps to full width.
  stack: { flexDirection: 'row-reverse', flexWrap: 'wrap', alignContent: 'flex-start', gap: 18 },
  stackItem: { flexGrow: 1, flexBasis: 330, minWidth: 0 },
  docsHead: { paddingHorizontal: 4, gap: 1, marginBottom: 6 },
  // The folder groups wrap two to a row inside the documents column.
  // רכבים בכותרת
  heroVehicle: { gap: 4, borderRadius: 8, paddingVertical: 4, ...webOnly({ cursor: 'pointer', transition: 'background-color 150ms ease' }) },
  heroVehicleHover: { backgroundColor: 'rgba(255,255,255,0.08)' },
  heroVehiclesEdit: { flexDirection: 'row-reverse', alignSelf: 'center', alignItems: 'center', gap: 6, minWidth: 32, height: 32, paddingHorizontal: 8, marginHorizontal: 8, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', ...webOnly({ cursor: 'pointer' }) },
  heroVehiclesEditHover: { backgroundColor: 'rgba(255,255,255,0.22)' },
  heroVehiclesEditText: { fontSize: 13, color: '#FFFFFF' },
  vehiclesModal: { gap: 10 },
  vehiclesModalHistory: { flexDirection: 'row-reverse' },
  vehiclesModalCard: { height: 320 },
  docsCell: { flexGrow: 2, flexBasis: 460, minWidth: 0 },
  docsStack: { flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'flex-start', gap: 14 },
  docsGroup: { flexGrow: 1, flexBasis: 280, minWidth: 0 },
  // This page uses the whole width of a large screen.
  content: { ...pageStyles.content, maxWidth: 1760 },

  // תחתית הדף
  footer: { flexDirection: 'row-reverse', justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 },
  footerText: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
});
