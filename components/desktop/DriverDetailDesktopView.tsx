import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DriverDetails, DriverRow } from '../../lib/adminApi';
import type { LicenseUpdateRequest } from '../../lib/licenseUpdate';
import { signingFolderStatus } from '../../lib/signingFolders';
import { maskNationalId } from '../driverCard/buildDriverDetailGroups';
import { ExpiryBadge } from '../ui';
import { expiryState, formatDate } from '../../lib/theme';
import { formatPlate } from '../../lib/plate';
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
import { DesktopSelect, DLtrText, DText, HoverPressable, StatusPill } from './primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, DesktopTone } from './desktopTheme';
import {
  EditableDateField,
  EditableFieldShell,
  EditableSelectField,
  EditableTextField,
  EXPIRY_TONE_MAP,
  FolderTile,
  latestDocumentOf,
  OverflowMenu,
  PlateBadge,
  recordStyles,
  Section,
  STATE_LABEL,
  useOwnerDocuments,
  DocumentFolderUploadModal,
  type RecordDocumentFolder,
} from './record/RecordKit';
import { DriverLicenseModal, LICENSE_SIDE_TITLE } from './driver/DriverLicenseModal';
import { DRIVER_DOCUMENT_GROUPS } from '../../lib/driverDocumentFolders';
import { DriverSigningTiles, useDriverSigningFolders, type SigningSessionTarget } from './driver/DriverSigningSection';

/**
 * Desktop body of the driver card ("תיק נהג"), built on the same record
 * layout as the vehicle card (components/desktop/record/RecordKit.tsx):
 * identity and actions in the header, a "דרוש טיפול" strip, an inline-editable
 * details column with the document folders, and a sticky status column.
 * Every folder opens in a centered modal instead of a separate page — only
 * the DocuSeal signing itself still opens full-page. The phone app keeps its
 * own driver card; this component is desktop-only.
 */

type DriverPatch = Partial<DriverDetails> & { full_name?: string | null; phone?: string | null };

const LICENSE_FOLDER = 'license_docs';

/** Every driver folder here takes uploads without an expiry date, as on the phone. */
const DOCUMENT_GROUPS: { title: string; folders: RecordDocumentFolder[] }[] = DRIVER_DOCUMENT_GROUPS.map((group) => ({
  title: group.title,
  folders: group.folders.map((folder) => ({ ...folder, requiresExpiry: false })),
}));

// The form's labels carry full weight/passenger limits; the compact inline editor shows only the class and its name.
const LICENSE_CLASS_SELECT = LICENSE_CLASS_OPTIONS.map((option) => ({ value: option.value, label: option.label.split(',')[0].trim() }));

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
  onOpenSigningSession,
  openFolder: openFolderRequest,
  onFolderOpened,
  onEdit,
  onResetPassword,
  onCall,
  onMessage,
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
  onOpenSigningSession: (target: SigningSessionTarget) => void;
  /** A document category to open on arrival (from a notification); `license_docs` opens the license. */
  openFolder?: string | null;
  onFolderOpened?: () => void;
  onEdit: () => void;
  onResetPassword: () => void;
  onCall: () => void;
  onMessage: () => void;
  onExportReport: () => void;
  exportingReport: boolean;
  archiving: boolean;
  restoring: boolean;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const name = driver?.full_name?.trim() || 'ללא שם';
  const initial = name.charAt(0) || '?';
  const statusTone: DesktopTone = isArchived ? 'neutral' : pendingActivation ? 'warn' : 'ok';
  const statusLabel = isArchived ? 'לא פעיל' : pendingActivation ? 'ממתין להפעלה' : 'פעיל';

  const { docs, thumbnails, reload: reloadDocs } = useOwnerDocuments('driver', driverId);
  const signing = useDriverSigningFolders(companyId, driverId);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [openFolder, setOpenFolder] = useState<RecordDocumentFolder | null>(null);
  const [signingRequest, setSigningRequest] = useState<string | null>(null);

  useEffect(() => {
    if (!openFolderRequest) return;
    if (openFolderRequest === LICENSE_FOLDER) setLicenseOpen(true);
    else {
      const folder = DOCUMENT_GROUPS.flatMap((group) => group.folders).find((f) => f.category === openFolderRequest);
      if (folder) setOpenFolder(folder);
    }
    onFolderOpened?.();
  }, [openFolderRequest, onFolderOpened]);

  const licenseExpiry = driver?.license_expiry ?? null;
  const licenseState = expiryState(licenseExpiry);
  const licenseTone: DesktopTone = EXPIRY_TONE_MAP[licenseState];
  const licensePhotos = docs.filter((doc) => doc.category === LICENSE_FOLDER);
  const photoSides = (['front', 'back'] as const).filter((side) => licensePhotos.some((doc) => doc.title === LICENSE_SIDE_TITLE[side])).length;

  const counts: Record<string, number> = {};
  for (const doc of docs) counts[doc.category] = (counts[doc.category] ?? 0) + 1;

  // "דרוש טיפול": the same rule as the vehicle card — expired or expiring —
  // plus the two things only an admin can move forward here.
  const alerts: { key: string; label: string; detail: string; tone: DesktopTone; onPress: () => void }[] = [];
  if (licenseState === 'expired' || licenseState === 'soon') {
    alerts.push({
      key: 'license',
      label: 'רישיון נהיגה',
      detail: `${licenseState === 'expired' ? 'פג תוקף' : 'יפוג'} ${formatDate(licenseExpiry)}`,
      tone: licenseTone,
      onPress: () => setLicenseOpen(true),
    });
  }
  if (pendingLicenseRequest) {
    alerts.push({ key: 'license-request', label: 'בקשת עדכון רישיון', detail: 'ממתינה לאישור', tone: 'warn', onPress: () => setLicenseOpen(true) });
  }
  for (const folder of signing.folders) {
    const status = signingFolderStatus(folder);
    if (status !== 'pending' && status !== 'failed') continue;
    alerts.push({
      key: `signing-${folder.id}`,
      label: folder.title,
      detail: status === 'pending' ? 'ממתין לחתימה' : 'השליחה נכשלה',
      tone: status === 'pending' ? 'warn' : 'bad',
      onPress: () => setSigningRequest(folder.id),
    });
  }
  const alertTone: DesktopTone = alerts.some((alert) => alert.tone === 'bad') ? 'bad' : 'warn';

  const license = splitLicenseClasses(driver?.license_classes);
  const vehicles = driver?.vehicles ?? [];
  const hasPhone = !!driver?.phone;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.recordHeader}>
        <View style={styles.recordIdentity}>
          <View style={styles.avatar}>
            <DText weight="bold" style={styles.avatarText}>{initial}</DText>
          </View>
          <View style={styles.recordTitleBlock}>
            <View style={styles.recordTitleRow}>
              <DText weight="bold" style={styles.recordName} numberOfLines={1}>{name}</DText>
              <StatusPill tone={statusTone} label={statusLabel} />
            </View>
            <View style={styles.recordMeta}>
              {[
                driver?.phone ? <DLtrText key="phone" style={styles.recordMetaText}>{driver.phone}</DLtrText> : null,
                driver?.employee_number ? <DText key="employee" style={styles.recordMetaText}>מס׳ עובד {driver.employee_number}</DText> : null,
                departmentName ? <DText key="department" style={styles.recordMetaText}>{departmentName}</DText> : null,
              ]
                .filter(Boolean)
                .map((item, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && <DText style={styles.metaDivider}>•</DText>}
                    {item}
                  </React.Fragment>
                ))}
            </View>
          </View>
        </View>
        <View style={styles.headerActions}>
          <HoverPressable
            style={[styles.iconAction, !hasPhone && styles.disabled]}
            hoverStyle={styles.rowHover}
            pressStyle={styles.pressDown}
            onPress={onCall}
            disabled={!hasPhone}
            accessibilityLabel="התקשרות לנהג"
          >
            <Ionicons name="call-outline" size={15} color={DESKTOP_COLORS.brand} />
          </HoverPressable>
          <HoverPressable
            style={[styles.iconAction, !hasPhone && styles.disabled]}
            hoverStyle={styles.rowHover}
            pressStyle={styles.pressDown}
            onPress={onMessage}
            disabled={!hasPhone}
            accessibilityLabel="שליחת הודעה לנהג"
          >
            <Ionicons name="chatbubble-outline" size={15} color={DESKTOP_COLORS.brand} />
          </HoverPressable>
          {isArchived ? (
            <HoverPressable style={[styles.secondaryAction, restoring && styles.disabled]} hoverStyle={styles.rowHover} pressStyle={styles.pressDown} onPress={onRestore} disabled={restoring}>
              <Ionicons name="arrow-undo-outline" size={15} color={DESKTOP_COLORS.brand} />
              <DText weight="semiBold" style={[styles.actionText, { color: DESKTOP_COLORS.brand }]}>{restoring ? 'משחזר…' : 'הסר מהארכיון'}</DText>
            </HoverPressable>
          ) : (
            <HoverPressable style={[styles.secondaryAction, archiving && styles.disabled]} hoverStyle={styles.rowHover} pressStyle={styles.pressDown} onPress={onArchive} disabled={archiving}>
              <Ionicons name="archive-outline" size={15} color={DESKTOP_COLORS.inkMuted} />
              <DText weight="semiBold" style={styles.actionText}>{archiving ? 'מעביר…' : 'העברה לארכיון'}</DText>
            </HoverPressable>
          )}
          <OverflowMenu
            items={[
              { label: 'עריכת פרטי נהג', icon: 'create-outline', onPress: onEdit },
              { label: 'איפוס סיסמה לנהג', icon: 'key-outline', onPress: onResetPassword },
              { label: exportingReport ? 'מייצא…' : 'ייצוא דוח תמונת מצב', icon: 'download-outline', onPress: onExportReport, disabled: exportingReport },
            ]}
          />
        </View>
      </View>

      {isArchived && (
        <Notice icon="archive-outline" text="נהג זה נמצא בארכיון ואין לו גישה לאפליקציה. מחיקה לצמיתות מתבצעת ממסך הארכיון." />
      )}
      {pendingActivation && (
        <Notice
          icon="time-outline"
          text={
            'הנהג עדיין משתמש בסיסמה זמנית ויידרש לקבוע סיסמה קבועה משלו בכניסה הבאה' +
            (pendingActivationDays === null
              ? '.'
              : pendingActivationDays === 0
              ? ' (מהיום).'
              : ` (לפני ${pendingActivationDays} ${pendingActivationDays === 1 ? 'יום' : 'ימים'}).`)
          }
        />
      )}

      {alerts.length > 0 && (
        <View style={[styles.alertBanner, { backgroundColor: DESKTOP_TONES[alertTone].bg }]}>
          <Ionicons name="alert-circle" size={17} color={DESKTOP_TONES[alertTone].fg} />
          <DText weight="bold" style={[styles.alertTitle, { color: DESKTOP_TONES[alertTone].fg }]}>דרוש טיפול</DText>
          <View style={styles.alertItems}>
            {alerts.map((alert) => (
              <HoverPressable
                key={alert.key}
                style={styles.alertItem}
                hoverStyle={styles.alertItemHover}
                pressStyle={styles.pressDown}
                onPress={alert.onPress}
                accessibilityLabel={`פתיחת ${alert.label}`}
              >
                <View style={[styles.dot, { backgroundColor: DESKTOP_TONES[alert.tone].fg }]} />
                <DText weight="semiBold" style={styles.alertItemText}>{alert.label}</DText>
                <DText style={styles.alertItemDetail}>{alert.detail}</DText>
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
              <DText weight="bold" style={styles.cardTitle}>פרטים אישיים</DText>
              <View style={styles.fieldGrid}>
                <EditableTextField
                  label="שם מלא"
                  value={driver?.full_name?.trim() || '—'}
                  raw={driver?.full_name ?? ''}
                  validate={(v) => (v.trim() ? null : 'שדה חובה')}
                  onSave={(v) => onSaveField({ full_name: v.trim() })}
                />
                <EditableTextField
                  label="טלפון"
                  value={driver?.phone || '—'}
                  raw={driver?.phone ?? ''}
                  ltr
                  keyboardType="number-pad"
                  validate={(v) => (!v.trim() ? 'שדה חובה' : isValidIsraeliPhone(v) ? null : 'מספר טלפון לא תקין')}
                  onSave={(v) => onSaveField({ phone: v.trim() })}
                />
                <EditableTextField
                  label="אימייל"
                  value={driver?.email || '—'}
                  raw={driver?.email ?? ''}
                  ltr
                  validate={(v) => (isValidEmail(v.trim()) ? null : 'כתובת מייל לא תקינה')}
                  onSave={(v) => onSaveEmail(v.trim().toLowerCase())}
                />
                <EditableTextField
                  label="ת״ז"
                  value={driver?.national_id ? maskNationalId(driver.national_id) : '—'}
                  raw={driver?.national_id ?? ''}
                  ltr
                  keyboardType="number-pad"
                  parse={(v) => v.replace(/\D/g, '').slice(0, 9)}
                  validate={(v) => (!v || isValidIsraeliNationalId(v) ? null : 'תעודת זהות לא תקינה')}
                  onSave={(v) => onSaveField({ national_id: v || null })}
                />
                <EditableDateField
                  label="תאריך לידה"
                  value={driver?.birth_date ? formatDate(driver.birth_date) : '—'}
                  raw={driver?.birth_date ?? null}
                  onSave={(v) => onSaveField({ birth_date: v })}
                />
                <EditableTextField
                  label="כתובת"
                  value={driver?.address || '—'}
                  raw={driver?.address ?? ''}
                  onSave={(v) => onSaveField({ address: v.trim() || null })}
                />
                <EditableTextField
                  label="טלפון בבית"
                  value={driver?.home_phone || '—'}
                  raw={driver?.home_phone ?? ''}
                  ltr
                  keyboardType="number-pad"
                  validate={(v) => (!v.trim() || isValidIsraeliPhone(v) ? null : 'מספר טלפון לא תקין')}
                  onSave={(v) => onSaveField({ home_phone: v.trim() || null })}
                />
                <EditableSelectField
                  label="מצב משפחתי"
                  value={driver?.marital_status || '—'}
                  raw={driver?.marital_status || null}
                  options={optionsWithCurrent(MARITAL_STATUS_OPTIONS, driver?.marital_status)}
                  allowClear
                  placeholder="לא נבחר"
                  onSave={(v) => onSaveField({ marital_status: v })}
                />
                <EditableSelectField
                  label="השכלה"
                  value={driver?.education || '—'}
                  raw={driver?.education || null}
                  options={optionsWithCurrent(EDUCATION_OPTIONS, driver?.education)}
                  allowClear
                  placeholder="לא נבחרה"
                  onSave={(v) => onSaveField({ education: v })}
                />
                <EditableTextField
                  label="מספר עובד"
                  value={driver?.employee_number || '—'}
                  raw={driver?.employee_number ?? ''}
                  ltr
                  onSave={(v) => onSaveField({ employee_number: v.trim() || null })}
                />
                <EditableSelectField
                  label="מחלקה"
                  value={departmentName || '—'}
                  raw={driver?.department_id ?? null}
                  options={departmentOptions}
                  allowClear
                  placeholder="לא נבחרה"
                  onSave={(v) => onSaveField({ department_id: v })}
                />
                <EditableDateField
                  label="תחילת העסקה"
                  value={driver?.employment_start_date ? formatDate(driver.employment_start_date) : '—'}
                  raw={driver?.employment_start_date ?? null}
                  onSave={(v) => onSaveField({ employment_start_date: v })}
                />
              </View>
            </View>
          </Section>

          <Section title="רישיון נהיגה">
            <View style={styles.card}>
              <DText weight="bold" style={styles.cardTitle}>פרטי רישיון</DText>
              <View style={styles.maintenanceGrid}>
                <EditableTextField
                  label="מספר רישיון"
                  value={driver?.license_number || '—'}
                  raw={driver?.license_number ?? ''}
                  ltr
                  compact
                  onSave={(v) => onSaveField({ license_number: v.trim() || null })}
                />
                <EditableLicenseClassesField
                  primary={license.primary}
                  secondary={license.secondary}
                  onSave={(primary, secondary) => onSaveField({ license_classes: joinLicenseClasses(primary, secondary) || null })}
                />
                <EditableDateField
                  label="תאריך הנפקה"
                  value={driver?.license_issue_date ? formatDate(driver.license_issue_date) : '—'}
                  raw={driver?.license_issue_date ?? null}
                  compact
                  onSave={(v) => onSaveField({ license_issue_date: v })}
                />
                <EditableDateField
                  label="תוקף"
                  value={licenseExpiry ? formatDate(licenseExpiry) : '—'}
                  raw={licenseExpiry}
                  compact
                  onSave={(v) => onSaveField({ license_expiry: v })}
                />
              </View>
            </View>
          </Section>

          <Section title="מסמכים">
            <View style={[styles.card, styles.documentsCard]}>
              {DOCUMENT_GROUPS.map((group, groupIndex) => (
                <View key={group.title} style={styles.documentGroup}>
                  <DText weight="semiBold" style={styles.documentGroupTitle}>{group.title}</DText>
                  <View style={styles.tileRow}>
                    {groupIndex === 0 && (
                      <FolderTile
                        title="רישיון נהיגה"
                        icon="card-outline"
                        thumbnail={thumbnails[LICENSE_FOLDER]}
                        signedVisual
                        onPress={() => setLicenseOpen(true)}
                        meta={
                          licenseExpiry
                            ? <ExpiryBadge state={licenseState} label={formatDate(licenseExpiry)} />
                            : <DText style={styles.folderTileCount}>{photoSides > 0 ? 'חסר תוקף' : 'אין צילומים'}</DText>
                        }
                      />
                    )}
                    {group.folders.map((folder) => {
                      const count = counts[folder.category] ?? 0;
                      const latest = latestDocumentOf(docs, folder.category);
                      return (
                        <FolderTile
                          key={folder.category}
                          title={folder.title}
                          icon={folder.icon}
                          thumbnail={thumbnails[folder.category]}
                          signedVisual
                          onPress={() => setOpenFolder(folder)}
                          meta={
                            <DText style={styles.folderTileCount}>
                              {count === 0 ? 'אין מסמכים' : count === 1 ? `מסמך אחד · ${formatDate(latest?.created_at)}` : `${count} מסמכים · ${formatDate(latest?.created_at)}`}
                            </DText>
                          }
                        />
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </Section>

          <Section title="טפסים לחתימה">
            <View style={[styles.card, styles.documentsCard]}>
              <DriverSigningTiles
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
          </Section>

          {!!driver?.created_at && (
            <DText style={styles.footer}>
              הצטרף לאפליקציה בתאריך {formatDate(driver.created_at)}
              {driver.updated_at ? ` · עדכון אחרון: ${formatDate(driver.updated_at)}` : ''}
            </DText>
          )}
        </View>

        <View style={styles.sideColumn}>
          <View style={styles.panel}>
            <DText weight="bold" style={styles.panelTitle}>רישיון ותוקף</DText>
            <StatusRow
              label="רישיון נהיגה"
              sub={licenseExpiry ? formatDate(licenseExpiry) : 'לא הוזן'}
              tone={licenseTone}
              status={STATE_LABEL[licenseState]}
              onPress={() => setLicenseOpen(true)}
              ltr
              border
            />
            <StatusRow
              label="צילומי רישיון"
              sub={`${photoSides} מתוך 2 צדדים`}
              tone={photoSides === 2 ? 'ok' : photoSides === 0 ? 'neutral' : 'warn'}
              status={photoSides === 2 ? 'הושלם' : 'חסר'}
              onPress={() => setLicenseOpen(true)}
            />
          </View>

          <View style={styles.panel}>
            <DText weight="bold" style={styles.panelTitle}>רכבים משויכים</DText>
            {vehicles.length === 0 ? (
              <DText weight="semiBold" style={styles.emptyValue}>אין רכב משויך</DText>
            ) : (
              vehicles.map((vehicle, index) => (
                <HoverPressable
                  key={vehicle.id}
                  style={[styles.complianceRow, index < vehicles.length - 1 && styles.rowBorder]}
                  hoverStyle={styles.rowHover}
                  onPress={() => onOpenVehicle(vehicle.id)}
                  accessibilityLabel={`פתיחת הרכב ${formatPlate(vehicle.plate_number)}`}
                >
                  <PlateBadge plate={formatPlate(vehicle.plate_number)} />
                  <DText style={styles.vehicleRole}>{vehicle.is_primary ? 'רכב ראשי' : 'רכב משני'}</DText>
                  <Ionicons name="chevron-back" size={13} color={DESKTOP_COLORS.inkFaint} />
                </HoverPressable>
              ))
            )}
          </View>
        </View>
      </View>

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
          onClose={() => setOpenFolder(null)}
          onChanged={reloadDocs}
        />
      )}
    </ScrollView>
  );
}

function StatusRow({
  label,
  sub,
  tone,
  status,
  onPress,
  ltr,
  border,
}: {
  label: string;
  sub: string;
  tone: DesktopTone;
  status: string;
  onPress: () => void;
  /** The sub line is a date (LTR digits) rather than Hebrew text. */
  ltr?: boolean;
  border?: boolean;
}) {
  const SubText = ltr ? DLtrText : DText;
  return (
    <HoverPressable style={[styles.complianceRow, border && styles.rowBorder]} hoverStyle={styles.rowHover} onPress={onPress} accessibilityLabel={`פתיחת ${label}`}>
      <View style={[styles.dot, tone !== 'neutral' && { backgroundColor: DESKTOP_TONES[tone].fg }]} />
      <View style={styles.complianceRowText}>
        <DText weight="semiBold" style={styles.complianceLabel}>{label}</DText>
        <SubText style={styles.complianceDate}>{sub}</SubText>
      </View>
      <DText weight="bold" style={[styles.complianceStatus, tone !== 'neutral' && { color: DESKTOP_TONES[tone].fg }]}>{status}</DText>
    </HoverPressable>
  );
}

function Notice({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={[styles.alertBanner, { backgroundColor: DESKTOP_TONES.neutral.bg }]}>
      <Ionicons name={icon} size={16} color={DESKTOP_TONES.neutral.fg} />
      <DText style={[styles.noticeText, { color: DESKTOP_TONES.neutral.fg }]}>{text}</DText>
    </View>
  );
}

/** License classes — up to two, stored comma-joined like DriverFormScreen does. */
function EditableLicenseClassesField({
  primary,
  secondary,
  onSave,
}: {
  primary: string;
  secondary: string;
  onSave: (primary: string, secondary: string) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState<string | null>(primary || null);
  const [second, setSecond] = useState<string | null>(secondary || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNonce, setSavedNonce] = useState(0);

  const start = () => { setFirst(primary || null); setSecond(secondary || null); setError(null); setEditing(true); };
  const confirm = async () => {
    if (first && second && first === second) { setError('יש לבחור שתי דרגות שונות'); return; }
    setSaving(true);
    const err = await onSave(first ?? '', second ?? '');
    setSaving(false);
    if (err) { setError(err); return; }
    setSavedNonce((n) => n + 1);
    setEditing(false);
  };

  return (
    <EditableFieldShell
      label="דרגות"
      displayValue={joinLicenseClasses(primary, secondary) || '—'}
      ltr
      compact
      editing={editing}
      onStartEdit={start}
      onCancel={() => setEditing(false)}
      onConfirm={confirm}
      saving={saving}
      error={error}
      savedNonce={savedNonce}
    >
      <View style={styles.classesRow}>
        <View style={styles.classSelect}>
          <DesktopSelect value={first} onChange={setFirst} options={LICENSE_CLASS_SELECT} allowClear placeholder="דרגה" hasError={!!error} />
        </View>
        <View style={styles.classSelect}>
          <DesktopSelect value={second} onChange={setSecond} options={LICENSE_CLASS_SELECT} allowClear placeholder="דרגה נוספת" hasError={!!error} />
        </View>
      </View>
    </EditableFieldShell>
  );
}

const styles = StyleSheet.create({
  ...recordStyles,
  avatarText: { fontSize: 18, color: DESKTOP_COLORS.brand },
  recordName: { fontSize: 17, letterSpacing: -0.15 },
  recordMetaText: { fontSize: 12, color: DESKTOP_COLORS.inkFaint },
  noticeText: { flex: 1, fontSize: 12.5 },
  documentsCard: { padding: 14, gap: 16 },
  documentGroup: { gap: 8 },
  documentGroupTitle: { fontSize: 12, color: DESKTOP_COLORS.inkMuted },
  tileRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  footer: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint, textAlign: 'center', marginTop: 6 },
  emptyValue: { fontSize: 13, marginTop: 7, color: DESKTOP_COLORS.inkMuted },
  vehicleRole: { flex: 1, fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  classesRow: { gap: 6 },
  classSelect: { width: '100%' },
});
