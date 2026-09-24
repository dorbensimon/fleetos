import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DriverDetails, DriverRow } from '../../lib/adminApi';
import type { LicenseUpdateRequest } from '../../lib/licenseUpdate';
import { signingFolderStatus } from '../../lib/signingFolders';
import { maskNationalId } from '../driverCard/buildDriverDetailGroups';
import { ExpiryState, expiryState, formatDate, parseDateValue } from '../../lib/theme';
import { isValidIsraeliPhone } from '../../lib/phone';
import { isValidIsraeliNationalId } from '../../lib/driverFormValidation';
import { isValidEmail } from '../../lib/validation';
import {
  EDUCATION_OPTIONS,
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
import { DetailRow, Fact, FieldEditDialog, GroupLabel, pageStyles, type FieldEditor } from './record/RecordPage';
import { DriverLicenseModal, LICENSE_SIDE_TITLE } from './driver/DriverLicenseModal';
import { DRIVER_DOCUMENT_GROUPS } from '../../lib/driverDocumentFolders';
import { DriverVehiclesCard } from './driver/DriverVehiclesCard';
import { DriverSigningList, useDriverSigningFolders, type SigningSessionTarget } from './driver/DriverSigningSection';

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

const LICENSE_FOLDER = 'license_docs';

/** Driver folders take uploads without an expiry date, as on the phone. */
const DOCUMENT_FOLDERS: RecordDocumentFolder[] = DRIVER_DOCUMENT_GROUPS.flatMap((group) =>
  group.folders.map((folder) => ({ ...folder, requiresExpiry: false })),
);
// The two short groups sit last, so the three columns end as evenly as possible.
const DOCUMENT_GROUPS = [...DRIVER_DOCUMENT_GROUPS].sort((a, b) => b.folders.length - a.folders.length);

// The form's labels carry full weight/passenger limits; the edit window shows only the class and its name.
const LICENSE_CLASS_SELECT = LICENSE_CLASS_OPTIONS.map((option) => ({ value: option.value, label: option.label.split(',')[0].trim() }));

const EXPIRY_COLOR: Partial<Record<ExpiryState, string>> = {
  expired: DESKTOP_TONES.bad.fg,
  soon: DESKTOP_TONES.warn.fg,
};

/** Whole months from a date until today. */
function monthsSince(date: string): number {
  const from = parseDateValue(date);
  const now = new Date();
  let months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  if (now.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

/** "7.5 שנים", "8 חודשים" — how long ago a date was, in plain words. */
function tenure(date: string | null | undefined): { value: string; unit: string } | null {
  if (!date) return null;
  const months = monthsSince(date);
  if (months < 12) return { value: String(months), unit: months === 1 ? 'חודש' : 'חודשים' };
  const years = Math.floor((months / 12) * 2) / 2;
  return { value: Number.isInteger(years) ? String(years) : years.toFixed(1), unit: years === 1 ? 'שנה' : 'שנים' };
}

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || '?';

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
  const name = driver?.full_name?.trim() || 'ללא שם';
  const statusTone: DesktopTone = isArchived ? 'neutral' : pendingActivation ? 'warn' : 'ok';
  const statusLabel = isArchived ? 'בארכיון' : pendingActivation ? 'ממתין לכניסה ראשונה' : 'פעיל באפליקציה';

  const { docs, reload: reloadDocs } = useOwnerDocuments('driver', driverId);
  const signing = useDriverSigningFolders(companyId, driverId);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [openFolder, setOpenFolder] = useState<RecordDocumentFolder | null>(null);
  const [signingRequest, setSigningRequest] = useState<string | null>(null);
  const [editor, setEditor] = useState<FieldEditor | null>(null);
  const [showNationalId, setShowNationalId] = useState(false);

  useEffect(() => {
    if (!openFolderRequest) return;
    if (openFolderRequest === LICENSE_FOLDER) setLicenseOpen(true);
    else {
      const folder = DOCUMENT_FOLDERS.find((f) => f.category === openFolderRequest);
      if (folder) setOpenFolder(folder);
    }
    onFolderOpened?.();
  }, [openFolderRequest, onFolderOpened]);

  const licenseExpiry = driver?.license_expiry ?? null;
  const licenseState = expiryState(licenseExpiry);
  const licenseColor = EXPIRY_COLOR[licenseState];
  const licensePhotos = docs.filter((doc) => doc.category === LICENSE_FOLDER);
  const hasSide = (side: 'front' | 'back') => licensePhotos.some((doc) => doc.title === LICENSE_SIDE_TITLE[side]);
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
      text: licenseState === 'expired' ? 'רישיון הנהיגה פג ב־' : 'רישיון הנהיגה יפוג ב־',
      date: licenseExpiry,
      open: () => setLicenseOpen(true),
    });
  }
  if (pendingLicenseRequest) {
    alerts.push({ key: 'license-request', tag: 'ממתין לאישור', tone: 'warn', text: 'הנהג שלח רישיון מחודש לאישור', open: () => setLicenseOpen(true) });
  }
  for (const folder of signing.folders) {
    const status = signingFolderStatus(folder);
    if (status !== 'pending' && status !== 'failed') continue;
    alerts.push({
      key: `signing-${folder.id}`,
      tag: status === 'pending' ? 'ממתין לחתימה' : 'השליחה נכשלה',
      tone: status === 'pending' ? 'warn' : 'bad',
      text: folder.title,
      open: () => setSigningRequest(folder.id),
    });
  }

  const subParts = [
    departmentName,
    driver?.employee_number ? `מס׳ עובד ${driver.employee_number}` : null,
    driver?.phone ?? null,
  ].filter(Boolean) as string[];

  const menuItems = [
    { label: 'סיסמה חדשה לנהג', icon: 'key-outline' as const, onPress: onResetPassword },
    { label: exportingReport ? 'מכין את הדוח…' : 'הורדת דוח על הנהג', icon: 'download-outline' as const, onPress: onExportReport, disabled: exportingReport },
    ...(isArchived ? [] : [{ label: archiving ? 'מעביר לארכיון…' : 'העברה לארכיון', icon: 'archive-outline' as const, onPress: onArchive, disabled: archiving }]),
  ];

  const textEditor = (label: string, raw: string | null | undefined, onSave: (v: string) => Promise<string | null>, extra?: Partial<Extract<FieldEditor, { kind: 'text' }>>): FieldEditor => ({
    kind: 'text',
    label,
    raw: raw ?? '',
    onSave,
    ...extra,
  });
  const dateEditor = (label: string, raw: string | null | undefined, onSave: (v: string | null) => Promise<string | null>): FieldEditor => ({ kind: 'date', label, raw: raw ?? null, onSave });

  const reduceMotion = prefersReducedMotion();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={[styles.hero, !reduceMotion && styles.enter]}>
        <View style={[styles.heroIdentity, styles.heroWho]}>
          <View style={[styles.portrait, isArchived && styles.portraitMuted]}>
            <View style={styles.portraitInner}>
              <DText weight="bold" style={styles.portraitText}>{initialsOf(name)}</DText>
            </View>
            <View style={[styles.portraitDot, { backgroundColor: DESKTOP_TONES[statusTone].fg }]} />
          </View>
          <View style={styles.flex}>
            <View style={styles.heroStatusRow}>
              <StatusPill tone={statusTone} label={statusLabel} />
            </View>
            <DText weight="bold" style={styles.heroName} numberOfLines={1}>{name}</DText>
            <View style={styles.heroSub}>
              {subParts.map((part, index) => (
                <React.Fragment key={`${part}-${index}`}>
                  {index > 0 && <DText style={styles.heroSubDot}>·</DText>}
                  {part === driver?.phone ? <DLtrText style={styles.heroSubText}>{part}</DLtrText> : <DText style={styles.heroSubText}>{part}</DText>}
                </React.Fragment>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.facts}>
          <Fact label="רישיון בתוקף עד" value={licenseExpiry ? formatDate(licenseExpiry) : 'לא הוזן'} color={licenseColor} muted={!licenseExpiry} />
          <Fact label="דרגות" value={classesLabel ? classesLabel.replace(',', ', ') : 'לא הוזנו'} muted={!classesLabel} />
          <Fact label="ותק בחברה" value={inCompany?.value ?? 'לא הוזן'} unit={inCompany?.unit} muted={!inCompany} />
        </View>

        <View style={styles.heroMenu}>
          <OverflowMenu items={menuItems} />
        </View>
      </View>

      {isArchived && (
        <View style={styles.archivedBanner}>
          <Ionicons name="archive-outline" size={18} color={DESKTOP_COLORS.inkMuted} />
          <View style={styles.flex}>
            <DText weight="bold" style={styles.archivedTitle}>הנהג נמצא בארכיון</DText>
            <DText style={styles.archivedText}>הוא לא יכול להיכנס לאפליקציה, אבל כל הפרטים והמסמכים שמורים.</DText>
          </View>
          <HoverPressable style={[styles.softBtn, restoring && styles.disabled]} hoverStyle={styles.softBtnHover} pressStyle={styles.pressDown} onPress={onRestore} disabled={restoring}>
            <Ionicons name="arrow-undo-outline" size={16} color={DESKTOP_COLORS.brand} />
            <DText weight="semiBold" style={styles.softBtnText}>{restoring ? 'מחזיר…' : 'החזרה מהארכיון'}</DText>
          </HoverPressable>
        </View>
      )}

      {pendingActivation && !isArchived && (
        <View style={styles.archivedBanner}>
          <Ionicons name="time-outline" size={18} color={DESKTOP_COLORS.inkMuted} />
          <DText style={[styles.archivedText, styles.flex]}>
            {'הנהג עוד לא נכנס לאפליקציה עם סיסמה משלו. בכניסה הבאה הוא יתבקש לבחור סיסמה' +
              (pendingActivationDays === null
                ? '.'
                : pendingActivationDays === 0
                ? ' (הסיסמה הזמנית נשלחה היום).'
                : ` (הסיסמה הזמנית נשלחה לפני ${pendingActivationDays === 1 ? 'יום' : `${pendingActivationDays} ימים`}).`)}
          </DText>
        </View>
      )}

      {/* Attention notice */}
      {!isArchived && alerts.length > 0 && (
        <View style={[styles.attention, !reduceMotion && styles.enter]}>
          <Ionicons name="warning-outline" size={18} color={DESKTOP_TONES.warn.fg} style={styles.attentionIcon} />
          <View style={styles.flex}>
            <DText weight="bold" style={styles.attentionTitle}>
              {alerts.length === 1 ? 'דבר אחד דורש טיפול' : `${alerts.length} דברים דורשים טיפול`}
            </DText>
            {alerts.map((alert) => (
              <View key={alert.key} style={styles.attentionRow}>
                <View style={styles.attentionTag}>
                  <DText weight="bold" style={[styles.attentionTagText, { color: DESKTOP_TONES[alert.tone].fg }]}>{alert.tag}</DText>
                </View>
                <DText style={styles.attentionText}>{alert.text}</DText>
                {!!alert.date && <DLtrText style={styles.attentionText}>{formatDate(alert.date)}</DLtrText>}
                <HoverPressable style={styles.linkBtn} hoverStyle={styles.softBtnHover} onPress={alert.open} accessibilityLabel={`פתיחת ${alert.text}`}>
                  <DText weight="semiBold" style={styles.linkText}>פתיחה</DText>
                  <Ionicons name="chevron-back" size={14} color={DESKTOP_COLORS.brand} />
                </HoverPressable>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Personal details + licence, then work + vehicles */}
      <View style={styles.gridRow}>
        <View style={styles.mainCell}>
          <GroupLabel>פרטים אישיים</GroupLabel>
          <View style={styles.card}>
            <DetailRow
              first
              label="שם מלא"
              value={driver?.full_name?.trim() || null}
              onPress={() => setEditor(textEditor('שם מלא', driver?.full_name, (v) => onSaveField({ full_name: v.trim() }), { validate: (v) => (v.trim() ? null : 'זה שדה חובה') }))}
            />
            <DetailRow
              label="טלפון נייד"
              value={driver?.phone || null}
              ltr
              accessory={driver?.phone ? <DText style={styles.rowNote} numberOfLines={1}>גם שם המשתמש לאפליקציה</DText> : undefined}
              onPress={() => setEditor(textEditor('טלפון נייד', driver?.phone, (v) => onSaveField({ phone: v.trim() }), {
                ltr: true,
                numeric: true,
                hint: 'הנהג נכנס לאפליקציה עם המספר הזה.',
                validate: (v) => (!v.trim() ? 'זה שדה חובה' : isValidIsraeliPhone(v) ? null : 'מספר טלפון לא תקין'),
              }))}
            />
            <DetailRow
              label="אימייל"
              value={driver?.email || null}
              ltr
              onPress={() => setEditor(textEditor('אימייל', driver?.email, (v) => onSaveEmail(v.trim().toLowerCase()), {
                ltr: true,
                validate: (v) => (isValidEmail(v.trim()) ? null : 'כתובת מייל לא תקינה'),
              }))}
            />
            <DetailRow
              label="תעודת זהות"
              value={driver?.national_id ? (showNationalId ? driver.national_id : maskNationalId(driver.national_id)) : null}
              ltr
              accessory={driver?.national_id ? (
                <HoverPressable
                  style={styles.revealPill}
                  hoverStyle={styles.softBtnHover}
                  onPress={() => setShowNationalId((v) => !v)}
                  accessibilityLabel={showNationalId ? 'הסתרת מספר תעודת הזהות' : 'הצגת מספר תעודת הזהות'}
                >
                  <DText weight="semiBold" style={styles.revealText}>{showNationalId ? 'הסתרה' : 'הצגה'}</DText>
                </HoverPressable>
              ) : undefined}
              onPress={() => setEditor(textEditor('תעודת זהות', driver?.national_id, (v) => onSaveField({ national_id: v || null }), {
                ltr: true,
                numeric: true,
                hint: '9 ספרות, כולל ספרת ביקורת.',
                parse: (v) => v.replace(/\D/g, '').slice(0, 9),
                validate: (v) => (!v || isValidIsraeliNationalId(v) ? null : 'תעודת זהות לא תקינה'),
              }))}
            />
            <DetailRow
              label="תאריך לידה"
              value={driver?.birth_date ? formatDate(driver.birth_date) : null}
              ltr
              accessory={age != null ? <DText style={styles.rowNote}>בן {age}</DText> : undefined}
              onPress={() => setEditor(dateEditor('תאריך לידה', driver?.birth_date, (v) => onSaveField({ birth_date: v })))}
            />
            <DetailRow label="כתובת" value={driver?.address || null} onPress={() => setEditor(textEditor('כתובת', driver?.address, (v) => onSaveField({ address: v.trim() || null })))} />
            <DetailRow
              label="טלפון בבית"
              value={driver?.home_phone || null}
              ltr
              onPress={() => setEditor(textEditor('טלפון בבית', driver?.home_phone, (v) => onSaveField({ home_phone: v.trim() || null }), {
                ltr: true,
                numeric: true,
                validate: (v) => (!v.trim() || isValidIsraeliPhone(v) ? null : 'מספר טלפון לא תקין'),
              }))}
            />
            <DetailRow
              label="מצב משפחתי"
              value={driver?.marital_status || null}
              onPress={() => setEditor({ kind: 'select', label: 'מצב משפחתי', raw: driver?.marital_status || null, options: optionsWithCurrent(MARITAL_STATUS_OPTIONS, driver?.marital_status), allowClear: true, placeholder: 'לא נבחר', onSave: (v) => onSaveField({ marital_status: v }) })}
            />
            <DetailRow
              label="השכלה"
              value={driver?.education || null}
              onPress={() => setEditor({ kind: 'select', label: 'השכלה', raw: driver?.education || null, options: optionsWithCurrent(EDUCATION_OPTIONS, driver?.education), allowClear: true, placeholder: 'לא נבחרה', onSave: (v) => onSaveField({ education: v }) })}
            />
          </View>
        </View>

        <View style={styles.sideCell}>
          <GroupLabel>רישיון נהיגה</GroupLabel>
          <View style={styles.card}>
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
            <HoverPressable style={[styles.photosRow, styles.rowDivider]} hoverStyle={styles.rowHover} onPress={() => setLicenseOpen(true)} accessibilityLabel="צילומי הרישיון: צפייה והעלאה">
              <DText style={[styles.rowLabel, styles.rowLabelCompact]}>צילומי הרישיון</DText>
              {(['front', 'back'] as const).map((side) => (
                <View key={side} style={[styles.sideChip, !hasSide(side) && styles.sideChipMissing]}>
                  <Ionicons name={hasSide(side) ? 'checkmark' : 'remove'} size={12} color={hasSide(side) ? DESKTOP_TONES.ok.fg : DESKTOP_COLORS.inkMuted} />
                  <DText weight="semiBold" style={[styles.sideChipText, !hasSide(side) && styles.sideChipTextMissing]}>{side === 'front' ? 'קדמי' : 'אחורי'}</DText>
                </View>
              ))}
              <Ionicons name="chevron-back" size={13} color={DESKTOP_COLORS.inkFaint} />
            </HoverPressable>
            <DetailRow
              compact
              label="מספר רישיון"
              value={driver?.license_number || null}
              ltr
              onPress={() => setEditor(textEditor('מספר רישיון', driver?.license_number, (v) => onSaveField({ license_number: v.trim() || null }), { ltr: true, numeric: true }))}
            />
            <DetailRow
              compact
              label="דרגות"
              value={classesLabel ? classesLabel.replace(',', ', ') : null}
              ltr
              onPress={() => setEditor({
                kind: 'selectPair',
                label: 'דרגות רישיון',
                hint: 'אפשר לבחור עד שתי דרגות.',
                labels: ['דרגה ראשית', 'דרגה נוספת'],
                raw: [license.primary || null, license.secondary || null],
                options: LICENSE_CLASS_SELECT,
                placeholders: ['בחירת דרגה', 'אין'],
                validate: (first, second) => (first && second && first === second ? 'בוחרים שתי דרגות שונות' : null),
                onSave: (first, second) => onSaveField({ license_classes: joinLicenseClasses(first ?? '', second ?? '') || null }),
              })}
            />
            <DetailRow compact label="תאריך הנפקה" value={driver?.license_issue_date ? formatDate(driver.license_issue_date) : null} ltr onPress={() => setEditor(dateEditor('תאריך הנפקה', driver?.license_issue_date, (v) => onSaveField({ license_issue_date: v })))} />
            <DetailRow compact label="בתוקף עד" value={licenseExpiry ? formatDate(licenseExpiry) : null} ltr valueColor={licenseColor} onPress={() => setEditor(dateEditor('תוקף הרישיון', licenseExpiry, (v) => onSaveField({ license_expiry: v })))} />
          </View>
        </View>
      </View>

      <View style={styles.gridRow}>
        <View style={styles.mainCell}>
          <GroupLabel>עבודה בחברה</GroupLabel>
          <View style={styles.card}>
            <DetailRow first label="מספר עובד" value={driver?.employee_number || null} ltr onPress={() => setEditor(textEditor('מספר עובד', driver?.employee_number, (v) => onSaveField({ employee_number: v.trim() || null }), { ltr: true }))} />
            <DetailRow
              label="מחלקה"
              value={departmentName}
              onPress={() => setEditor({ kind: 'select', label: 'מחלקה', raw: driver?.department_id ?? null, options: departmentOptions, allowClear: true, placeholder: 'ללא מחלקה', onSave: (v) => onSaveField({ department_id: v }) })}
            />
            <DetailRow
              label="תחילת העסקה"
              value={driver?.employment_start_date ? formatDate(driver.employment_start_date) : null}
              ltr
              accessory={inCompany ? <DText style={styles.rowNote}>{`${inCompany.value} ${inCompany.unit}`}</DText> : undefined}
              onPress={() => setEditor(dateEditor('תחילת העסקה', driver?.employment_start_date, (v) => onSaveField({ employment_start_date: v })))}
            />
          </View>
        </View>

        <View style={styles.sideCell}>
          <GroupLabel>רכבים משויכים</GroupLabel>
          <DriverVehiclesCard
            companyId={companyId}
            driverId={driverId}
            initialVehicles={vehicles}
            canEdit={!isArchived}
            onOpenVehicle={onOpenVehicle}
            onChanged={onVehiclesChanged}
          />
        </View>
      </View>

      {/* Forms to sign */}
      <View style={styles.docsHead}>
        <DText weight="bold" style={styles.docsTitle}>טפסים לחתימה</DText>
        <DText style={styles.mutedText}>לחיצה על טופס פותחת אותו, ושם שולחים אותו לנהג לחתימה בטלפון</DText>
      </View>
      <View style={[styles.card, styles.listCard]}>
        <DriverSigningList
          companyId={companyId}
          driverId={driverId}
          canSend={canSendSigning}
          folders={signing.folders}
          loading={signing.loading}
          error={signing.error}
          onChanged={signing.reload}
          openFolderId={signingRequest}
          onFolderOpened={() => setSigningRequest(null)}
          onOpenSession={onOpenSigningSession}
        />
      </View>

      {/* Documents */}
      <View style={styles.docsHead}>
        <DText weight="bold" style={styles.docsTitle}>מסמכים</DText>
        <DText style={styles.mutedText}>לחיצה על תיקייה פותחת אותה, ושם אפשר לצפות בקבצים ולהעלות חדשים</DText>
      </View>
      <View style={[styles.gridRow, styles.docsGrid]}>
        {DOCUMENT_GROUPS.map((group) => (
          <View key={group.title} style={styles.thirdCell}>
            <GroupLabel>{group.title}</GroupLabel>
            <View style={[styles.card, styles.listCard]}>
              {group.folders.map((folder, index) => (
                <FolderListRow
                  key={folder.category}
                  title={folder.title}
                  icon={folder.icon}
                  docs={docs.filter((d) => d.category === folder.category)}
                  onPress={() => setOpenFolder({ ...folder, requiresExpiry: false })}
                  first={index === 0}
                  plain
                />
              ))}
            </View>
          </View>
        ))}
      </View>

      {!!driver?.created_at && (
        <View style={styles.footer}>
          <DText style={styles.footerText}>הצטרף לאפליקציה ב־</DText>
          <DLtrText style={styles.footerText}>{formatDate(driver.created_at)}</DLtrText>
          {!!driver.updated_at && (
            <>
              <DText style={styles.footerText}> · עודכן לאחרונה ב־</DText>
              <DLtrText style={styles.footerText}>{formatDate(driver.updated_at)}</DLtrText>
            </>
          )}
        </View>
      )}

      <FieldEditDialog editor={editor} onClose={() => setEditor(null)} />

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
          layout="gallery"
          onClose={() => setOpenFolder(null)}
          onChanged={reloadDocs}
        />
      )}
    </ScrollView>
  );
}

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
      accessibilityLabel="רישיון הנהיגה. פתיחת הצילומים והתוקף"
    >
      <View style={styles.licenceTop}>
        <DText weight="bold" style={styles.licenceTitle}>רישיון נהיגה</DText>
        <DText weight="bold" style={styles.licenceCountry}>ISRAEL</DText>
      </View>
      <View style={styles.licenceBody}>
        <View style={styles.licencePhoto}>
          <DText weight="bold" style={styles.licencePhotoText}>{initialsOf(name)}</DText>
        </View>
        <View style={styles.flex}>
          <DText weight="bold" style={styles.licenceName} numberOfLines={1}>{name}</DText>
          <View style={styles.inlineMeta}>
            <DText style={styles.licenceLine}>מספר </DText>
            <DLtrText weight="semiBold" style={[styles.licenceLine, styles.licenceLineStrong]}>{number || '—'}</DLtrText>
          </View>
          <View style={styles.inlineMeta}>
            <DText style={styles.licenceLine}>הונפק </DText>
            <DLtrText weight="semiBold" style={[styles.licenceLine, styles.licenceLineStrong]}>{issued ? formatDate(issued) : '—'}</DLtrText>
          </View>
        </View>
      </View>
      <View style={styles.licenceFoot}>
        <View style={styles.licenceClasses}>
          {classes.map((cls) => (
            <View key={cls} style={styles.licenceClass}>
              <DLtrText weight="extraBold" style={styles.licenceClassText}>{cls}</DLtrText>
            </View>
          ))}
        </View>
        <View style={styles.licenceExpiry}>
          <DText weight="bold" style={[styles.licenceExpiryText, { color: expiryColor }]}>{expiry ? 'עד ' : 'אין תוקף'}</DText>
          {!!expiry && <DLtrText weight="bold" style={[styles.licenceExpiryText, { color: expiryColor }]}>{formatDate(expiry)}</DLtrText>}
        </View>
      </View>
    </HoverPressable>
  );
}

const LICENCE_INK = '#4A2F48';

const styles = StyleSheet.create({
  ...pageStyles,

  // Header portrait
  heroWho: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14 },
  portrait: {
    width: 60,
    height: 60,
    borderRadius: 30,
    padding: 3,
    backgroundColor: DESKTOP_COLORS.brand,
    ...webOnly({ backgroundImage: 'conic-gradient(from 210deg, #0088CC, #5CC3F0, #0088CC)' }),
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
  portraitDot: { position: 'absolute', bottom: 1, left: 1, width: 15, height: 15, borderRadius: 8, borderWidth: 3, borderColor: '#FFFFFF' },

  // Rows
  revealPill: { height: 22, paddingHorizontal: 8, borderRadius: 11, justifyContent: 'center', backgroundColor: 'rgba(0,136,204,0.09)', ...webOnly({ transition: 'background-color 150ms ease' }) },
  revealText: { fontSize: 12.5, color: DESKTOP_COLORS.brand },

  // Licence card
  licenceArea: { padding: 14, paddingBottom: 12 },
  licence: {
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#EBCFE6',
    ...webOnly({
      backgroundImage:
        'radial-gradient(120% 90% at 0% 0%, rgba(255,255,255,0.55), transparent 55%), repeating-linear-gradient(115deg, rgba(255,255,255,0) 0 7px, rgba(255,255,255,0.18) 7px 8px), linear-gradient(135deg, #F7D9E3 0%, #EBCFE6 45%, #D9D3F0 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 10px 22px -12px rgba(60,30,70,0.45), 0 1px 3px rgba(22,34,46,0.10)',
      transform: 'perspective(900px) rotateX(4deg) rotateY(5deg)',
      transition: `transform 500ms ${EASE_OUT}, box-shadow 500ms ${EASE_OUT}`,
      cursor: 'pointer',
    }),
  },
  licenceHover: webOnly({
    transform: 'perspective(900px) rotateX(0deg) rotateY(0deg)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 16px 30px -14px rgba(60,30,70,0.5), 0 1px 3px rgba(22,34,46,0.10)',
  }),
  licenceTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingTop: 9 },
  licenceTitle: { fontSize: 12.5, color: LICENCE_INK },
  licenceCountry: { fontSize: 10.5, color: '#6E4D6A', letterSpacing: 0.6 },
  licenceBody: { flexDirection: 'row-reverse', gap: 10, paddingHorizontal: 12, paddingTop: 7 },
  licencePhoto: {
    width: 48,
    height: 60,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(74,47,72,0.15)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ backgroundImage: 'linear-gradient(170deg, #FFFFFF, #EDE6F1)' }),
  },
  licencePhotoText: { fontSize: 17, color: '#8A6C86' },
  licenceName: { fontSize: 14, color: '#2A2230', marginBottom: 1 },
  licenceLine: { fontSize: 11.5, lineHeight: 16, color: '#5D4A5B', ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  licenceLineStrong: { color: '#2A2230' },
  licenceFoot: { position: 'absolute', right: 12, left: 12, bottom: 9, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  licenceClasses: { flexDirection: 'row-reverse', gap: 5 },
  licenceClass: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.75)' },
  licenceClassText: { fontSize: 11.5, color: LICENCE_INK },
  licenceExpiry: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999, backgroundColor: '#FFFFFF' },
  licenceExpiryText: { fontSize: 11.5, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },

  photosRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, minHeight: 42, paddingHorizontal: 16, paddingVertical: 7, ...webOnly({ transition: 'background-color 150ms ease' }) },
  sideChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: DESKTOP_TONES.ok.bg },
  sideChipMissing: { backgroundColor: '#EEF1F4' },
  sideChipText: { fontSize: 12.5, color: DESKTOP_TONES.ok.fg },
  sideChipTextMissing: { color: DESKTOP_COLORS.inkMuted },

  // Documents
  docsGrid: { alignItems: 'flex-start' },
  thirdCell: { flexGrow: 1, flexBasis: 280, minWidth: 0 },

  footer: { flexDirection: 'row-reverse', justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 },
  footerText: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
});
