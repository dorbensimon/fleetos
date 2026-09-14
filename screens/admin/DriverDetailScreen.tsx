import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { showAlert } from '../../lib/platformAlert';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, BackButton, LoadingState, ErrorState, PrimaryButton, useToast } from '../../components/ui';
import { COLORS, CONTENT_MAX_WIDTH, RADIUS, SPACING, formatDate, BRAND } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { getDriver, archiveDriver, restoreDriver, resetDriverPassword, getUserEmail, updateUserEmail, listDepartments, DriverRow } from '../../lib/adminApi';
import { listDocuments } from '../../lib/documents';
import { listSignatureRequests } from '../../lib/docuseal';
import { exportDriverSnapshotReport } from '../../lib/driverSnapshotReport';
import { RootStackParamList } from '../../navigation/types';
import { DriverHero } from '../../components/driverCard/DriverHero';
import { QuickActionCard } from '../../components/driverCard/QuickActionCard';
import { ListGroup } from '../../components/driverCard/ListGroup';
import { DC_COLORS, DC_SPACING, DC_TYPO } from '../../components/driverCard/driverCardTheme';
import {
  DRIVER_CARD_GROUPS,
  DRIVER_CARD_QUICK_ACTIONS,
  DriverCardRow,
} from '../../components/driverCard/driverCardSections';
import { dialPhone } from '../../lib/phone';
import { ResetDriverPasswordModal } from '../../components/driverCard/ResetDriverPasswordModal';
import { EditUserEmailModal } from '../../components/driverCard/EditUserEmailModal';
import { ConfirmActionModal } from '../../components/driverCard/ConfirmActionModal';
import { buildDriverDetailGroups } from '../../components/driverCard/buildDriverDetailGroups';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { isValidTemporaryPassword } from '../../lib/validation';
import {
  getPendingLicenseUpdateForDriver,
  reviewLicenseUpdateRequest,
  type LicenseUpdateRequest,
} from '../../lib/licenseUpdate';

const APP_STARTED_AT_MS = Date.now();

/**
 * "כרטיס נהג" — visual layer per DriverCard-spec.md (iOS-native styling,
 * separate from the app-wide design system — see driverCardTheme.ts).
 *
 * Every visible row is backed by live profile, vehicle, document or signing data.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverDetail'>;

const DOCUMENT_CATEGORY_BY_ROW: Partial<Record<DriverCardRow['key'], string>> = {
  'general-documents': 'general',
  'traffic-info-documents': 'transport_info',
  'driver-file': 'driver_file',
  'notes-comments': 'notes_feedback',
  'traffic-reports': 'traffic_reports',
  'companion-drivers': 'accompanying_drivers',
  'procedure-6': 'procedure_6',
  certifications: 'certifications',
  hazmat: 'hazmat',
  training: 'trainings',
};

export default function DriverDetailScreen({ route, navigation }: Props) {
  const { driverId } = route.params;
  const { companyId, company } = useCompany();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [licensePhotosComplete, setLicensePhotosComplete] = useState(false);
  const [pendingSigningCount, setPendingSigningCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);
  const loadRequest = useRef(0);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);

  const [emailOpen, setEmailOpen] = useState(false);
  const [emailValue, setEmailValue] = useState('');
  const [emailError, setEmailError] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  const [pendingLicenseRequest, setPendingLicenseRequest] = useState<LicenseUpdateRequest | null>(null);
  const [reviewingLicense, setReviewingLicense] = useState(false);

  const reviewLicense = async (approve: boolean) => {
    if (!pendingLicenseRequest) return;
    setReviewingLicense(true);
    try {
      await reviewLicenseUpdateRequest(pendingLicenseRequest.id, approve);
      setPendingLicenseRequest(null);
      if (approve) {
        const refreshed = await getDriver(driverId);
        setDriver(refreshed);
      }
      showToast(approve ? 'עדכון הרישיון אושר' : 'עדכון הרישיון נדחה');
    } catch (err: any) {
      showToast(err?.message || 'הפעולה נכשלה, נסה שוב');
    } finally {
      setReviewingLicense(false);
    }
  };

  const closeReset = () => {
    setResetOpen(false);
    setResetPassword('');
    setResetConfirm('');
    setResetError('');
  };

  const closeEmail = () => {
    setEmailOpen(false);
    setEmailValue('');
    setEmailError('');
  };

  const submitEmail = async () => {
    if (!companyId) return;
    const normalized = emailValue.trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setEmailError('כתובת מייל לא תקינה');
      return;
    }
    setEmailError('');
    setSavingEmail(true);
    const result = await updateUserEmail(driverId, companyId, normalized);
    setSavingEmail(false);
    if (!result.ok) {
      setEmailError(result.error);
      return;
    }
    closeEmail();
    setDriver((current) => (current ? { ...current, email: normalized } : current));
    showToast('כתובת המייל עודכנה');
  };

  const submitReset = async () => {
    if (!companyId) return;
    if (!isValidTemporaryPassword(resetPassword)) {
      setResetError('הסיסמה חייבת להכיל לפחות 4 ספרות בלבד');
      return;
    }
    if (resetPassword !== resetConfirm) {
      setResetError('הסיסמאות אינן תואמות');
      return;
    }
    setResetError('');
    setResetting(true);
    const result = await resetDriverPassword(driverId, companyId, resetPassword);
    setResetting(false);
    if (!result.ok) {
      setResetError(result.error);
      return;
    }
    closeReset();
    showAlert('הסיסמה אופסה', 'הנהג יתבקש לקבוע סיסמה קבועה משלו בכניסה הבאה.');
  };

  const runArchive = async () => {
    if (!companyId) return;
    setArchiving(true);
    const result = await archiveDriver(driverId, companyId);
    setArchiving(false);
    setArchiveConfirmOpen(false);
    if (!result.ok) {
      showAlert('ההעברה לארכיון נכשלה', result.error);
      return;
    }
    showToast('הנהג הועבר לארכיון וגישתו לאפליקציה נחסמה');
    navigation.goBack();
  };

  const runRestore = async () => {
    if (!companyId) return;
    setRestoring(true);
    const result = await restoreDriver(driverId, companyId);
    setRestoring(false);
    if (!result.ok) {
      showAlert('שחזור הנהג נכשל', result.error);
      return;
    }
    showToast('הנהג שוחזר מהארכיון');
    await load();
  };

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [d, licenseDocs, signatureRequests, email] = await Promise.all([
        getDriver(driverId),
        listDocuments('driver', driverId, 'license_docs'),
        listSignatureRequests(companyId ?? undefined),
        companyId ? getUserEmail(driverId, companyId) : Promise.resolve(null),
      ]);
      if (requestId !== loadRequest.current) return;
      setDriver(d ? { ...d, email } : d);
      // A pending licence request only adds a status badge. It must never
      // prevent the driver's full profile from opening if that optional table
      // has not yet been granted to the current database role.
      try {
        setPendingLicenseRequest(await getPendingLicenseUpdateForDriver(driverId));
      } catch (pendingLicenseError) {
        console.warn('Unable to load pending license update request', pendingLicenseError);
        setPendingLicenseRequest(null);
      }
      setLicensePhotosComplete(
        licenseDocs.some((doc) => doc.title === 'צד קדמי') && licenseDocs.some((doc) => doc.title === 'צד אחורי')
      );
      setPendingSigningCount(
        signatureRequests.filter(
          (item) => item.driver_id === driverId && (item.status === 'pending' || item.status === 'declined')
        ).length
      );
    } catch (err: any) {
      if (requestId === loadRequest.current) setLoadError(err?.message ?? 'טעינת הנהג נכשלה');
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [driverId, companyId]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => { loadRequest.current += 1; };
    }, [load])
  );

  const exportReport = async () => {
    if (!driver || !company || exportingReport) return;
    setExportingReport(true);
    try {
      const [departments, signatureRequests] = await Promise.all([
        companyId ? listDepartments(companyId) : Promise.resolve([]),
        listSignatureRequests(companyId ?? undefined),
      ]);
      const departmentName = departments.find((d) => d.id === driver.department_id)?.name ?? null;
      const driverSigningRequests = signatureRequests.filter((r) => r.driver_id === driverId);
      await exportDriverSnapshotReport(company, driver, departmentName, driverSigningRequests);
    } catch (err: any) {
      showToast(err?.message || 'ייצוא הדוח נכשל, נסה שוב');
    } finally {
      setExportingReport(false);
    }
  };

  const handleRowPress = (row: DriverCardRow) => {
    if (row.key === 'vehicle' || row.key === 'primary-vehicle' || row.key === 'secondary-vehicle') {
      const targetVehicle =
        row.key === 'primary-vehicle'
          ? driver?.vehicles.find((vehicle) => vehicle.is_primary)
          : row.key === 'secondary-vehicle'
          ? driver?.vehicles.find((vehicle) => !vehicle.is_primary)
          : driver?.vehicle_id
          ? { id: driver.vehicle_id }
          : null;
      if (targetVehicle?.id) navigation.navigate('VehicleDetail', { vehicleId: targetVehicle.id, returnTo: 'driver' });
      return;
    }
    if (row.key === 'phone') {
      dialPhone(driver?.phone);
      return;
    }
    if (row.key === 'license-documents') {
      navigation.navigate('DriverLicenseDocuments', { driverId });
      return;
    }
    if (row.key === 'signing-documents') {
      navigation.navigate('DriverSigningDocuments', { driverId });
      return;
    }
    if (row.key === 'reset-driver-password') {
      setResetOpen(true);
      return;
    }
    if (row.key === 'email') {
      setEmailValue(driver?.email || '');
      setEmailOpen(true);
      return;
    }
    if (row.key === 'export-driver-report') {
      exportReport();
      return;
    }
    const category = DOCUMENT_CATEGORY_BY_ROW[row.key];
    if (category) {
      navigation.navigate('DocumentCategory', {
        ownerType: 'driver',
        ownerId: driverId,
        category,
        title: row.label,
      });
    }
  };

  const isArchived = driver?.status === 'archived';
  const pendingActivation = !isArchived && !!driver?.must_change_password;
  const pendingActivationDays = driver?.password_set_at
    ? Math.max(0, Math.floor((APP_STARTED_AT_MS - new Date(driver.password_set_at).getTime()) / 86400000))
    : null;
  const assignedVehicleCount = driver?.vehicles.length ?? 0;
  const licenseExpired = !!driver?.license_expiry && driver.license_expiry < new Date().toISOString().slice(0, 10);
  const licenseStatus: 'expired' | 'verified' | 'pending' =
    licenseExpired ? 'expired' : licensePhotosComplete && !!driver?.license_expiry ? 'verified' : 'pending';
  const groups = buildDriverDetailGroups(driver, licenseStatus, pendingSigningCount);

  if (loading) {
    return (
      <View style={styles.screen}>
        <AdminGradientBackground />
        <LoadingState />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.screen}>
        <AdminGradientBackground />
        <ErrorState message={loadError} onRetry={load} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <AdminGradientBackground />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: DC_SPACING.listBottomPadding + insets.bottom }]}
      >
        <TouchableOpacity
          onPress={() => navigation.navigate('DriverForm', { driverId })}
          style={styles.editDriverButton}
          accessibilityRole="button"
          accessibilityLabel="עריכת פרטי נהג"
        >
          <Ionicons name="create-outline" size={20} color={COLORS.accent} />
        </TouchableOpacity>
        <DriverHero
          name={driver?.full_name ?? 'ללא שם'}
          avatarLetter={(driver?.full_name ?? '?').trim().charAt(0)}
          statusColor={isArchived ? DC_COLORS.gray : pendingActivation ? DC_COLORS.orange : DC_COLORS.green}
          subtitleParts={[isArchived ? 'לא פעיל' : pendingActivation ? 'ממתין להפעלה' : 'פעיל']}
        />

        {isArchived && (
          <View style={styles.archivedBanner}>
            <Feather name="archive" size={16} color="#9A3412" />
            <AppText style={styles.archivedBannerText}>
              נהג זה נמצא בארכיון ואין לו גישה לאפליקציה. מחיקה לצמיתות מתבצעת ממסך הארכיון.
            </AppText>
          </View>
        )}

        {pendingActivation && (
          <View style={styles.archivedBanner}>
            <Feather name="clock" size={16} color="#9A3412" />
            <AppText style={styles.archivedBannerText}>
              הנהג עדיין משתמש בסיסמה זמנית ויידרש לקבוע סיסמה קבועה משלו בכניסה הבאה
              {pendingActivationDays === null
                ? '.'
                : pendingActivationDays === 0
                ? ' (מהיום).'
                : ` (לפני ${pendingActivationDays} ${pendingActivationDays === 1 ? 'יום' : 'ימים'}).`}
            </AppText>
          </View>
        )}

        <View style={styles.quickActions}>
          {DRIVER_CARD_QUICK_ACTIONS.map((action) => (
            <QuickActionCard
              key={action.key}
              label={action.label}
              icon={action.icon}
              tint={action.tint}
              disabled={
                (action.key === 'assigned-vehicle' && !driver?.vehicle_id) ||
                ((action.key === 'call' || action.key === 'message') && !driver?.phone)
              }
              onPress={() => {
                if (action.label === 'התקשר' && driver?.phone) dialPhone(driver.phone);
                else if (action.label === 'הודעה' && driver?.phone) Linking.openURL(`sms:${driver.phone}`);
                else if (action.label === 'רכב משויך' && driver?.vehicle_id) {
                  navigation.navigate('VehicleDetail', { vehicleId: driver.vehicle_id, returnTo: 'driver' });
                }
              }}
            />
          ))}
        </View>

        {groups.map((group) => (
          <ListGroup key={group.title} group={group} onRowPress={handleRowPress} />
        ))}

        {pendingLicenseRequest && (
          <View style={styles.licenseRequestCard}>
            <AppText style={[DC_TYPO.destructiveBold, styles.licenseRequestTitle]}>
              בקשת עדכון רישיון ממתינה
            </AppText>
            <AppText style={styles.licenseRequestLine}>
              מספר: {pendingLicenseRequest.requested_license_number} · דרגות: {pendingLicenseRequest.requested_license_classes}
            </AppText>
            <AppText style={styles.licenseRequestLine}>
              תוקף עד: {formatDate(pendingLicenseRequest.requested_license_expiry)}
            </AppText>
            <View style={styles.licenseRequestActions}>
              <TouchableOpacity
                style={[styles.licenseRequestBtn, styles.licenseRequestApprove]}
                onPress={() => reviewLicense(true)}
                disabled={reviewingLicense}
                activeOpacity={0.7}
              >
                <AppText weight="bold" style={styles.licenseRequestApproveText}>אשר</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.licenseRequestBtn, styles.licenseRequestReject]}
                onPress={() => reviewLicense(false)}
                disabled={reviewingLicense}
                activeOpacity={0.7}
              >
                <AppText weight="bold" style={styles.licenseRequestRejectText}>דחה</AppText>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Permanent deletion deliberately does not live here: it is only
            reachable from the driver archive, so an irreversible action
            always passes through a reversible step first. */}
        <View style={styles.destructiveGroup}>
          {isArchived ? (
            <TouchableOpacity
              style={styles.destructiveRow}
              onPress={runRestore}
              disabled={restoring}
              activeOpacity={0.7}
            >
              <AppText style={[DC_TYPO.destructiveBold, styles.restoreText]}>
                {restoring ? 'משחזר…' : 'שחזור מהארכיון'}
              </AppText>
              <Feather name="rotate-ccw" size={16} color="#0088CC" style={styles.trashIcon} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.destructiveRow}
              onPress={() => setArchiveConfirmOpen(true)}
              disabled={archiving}
              activeOpacity={0.7}
            >
              <AppText style={[DC_TYPO.destructiveBold, styles.archiveText]}>העברה לארכיון</AppText>
              <Feather name="archive" size={16} color={DC_COLORS.gray} style={styles.trashIcon} />
            </TouchableOpacity>
          )}
        </View>

        {!!driver?.created_at && (
          <AppText style={[DC_TYPO.footer, styles.footer]}>
            הצטרף לאפליקציה בתאריך {new Date(driver.created_at).toLocaleDateString('he-IL')}
            {driver?.updated_at
              ? `\nעדכון אחרון: ${new Date(driver.updated_at).toLocaleDateString('he-IL')}`
          : ''}
          </AppText>
        )}
      </ScrollView>

      <View style={[styles.floatingNavigation, { top: insets.top + 12 }]}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>

      <ResetDriverPasswordModal
        visible={resetOpen}
        driverName={driver?.full_name}
        password={resetPassword}
        confirmPassword={resetConfirm}
        error={resetError}
        loading={resetting}
        onPasswordChange={setResetPassword}
        onConfirmPasswordChange={setResetConfirm}
        onClose={closeReset}
        onSubmit={submitReset}
      />

      <EditUserEmailModal
        visible={emailOpen}
        driverName={driver?.full_name}
        email={emailValue}
        error={emailError}
        loading={savingEmail}
        onEmailChange={setEmailValue}
        onClose={closeEmail}
        onSubmit={submitEmail}
      />

      <ConfirmActionModal
        visible={archiveConfirmOpen}
        title="העברה לארכיון"
        message={
          `${driver?.full_name ?? 'הנהג'} יאבד את הגישה לאפליקציה ויוסר מרשימת הנהגים.` +
          (assignedVehicleCount > 0
            ? ` שיוך ${assignedVehicleCount === 1 ? 'הרכב' : `${assignedVehicleCount} הרכבים`} שלו יבוטל.`
            : '') +
          ' תמיד אפשר לשחזר אותו ממסך הארכיון.'
        }
        confirmLabel="העבר לארכיון"
        loading={archiving}
        onConfirm={runArchive}
        onClose={() => setArchiveConfirmOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  floatingNavigation: { position: 'absolute', zIndex: 100, elevation: 100, right: DC_SPACING.screenPaddingH },
  editDriverButton: { position: 'absolute', top: 18, left: DC_SPACING.screenPaddingH, zIndex: 2, width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(10,127,208,0.20)', alignItems: 'center', justifyContent: 'center', shadowColor: '#0A7FD0', shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  licenseRequestCard: { marginTop: 16, padding: 16, borderRadius: 12, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FDBA74' },
  licenseRequestTitle: { fontSize: 14.5, marginBottom: 6, color: '#9A3412' },
  licenseRequestLine: { fontSize: 13, color: '#7C2D12', marginBottom: 2 },
  licenseRequestActions: { flexDirection: 'row-reverse', gap: 8, marginTop: 10 },
  licenseRequestBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  licenseRequestApprove: { backgroundColor: '#16A34A' },
  licenseRequestApproveText: { color: '#FFFFFF', fontSize: 13.5 },
  licenseRequestReject: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DC2626' },
  licenseRequestRejectText: { color: '#DC2626', fontSize: 13.5 },
  screen: { flex: 1, backgroundColor: BRAND.screenBg },
  // flex: 1 is required so the ScrollView stretches to fill `screen` instead
  // of sizing to its own content on web (React Native Web) — without it the
  scroll: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingBottom: DC_SPACING.listBottomPadding, paddingTop: 12, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  quickActions: {
    flexDirection: 'row-reverse',
    gap: 10,
    paddingHorizontal: DC_SPACING.screenPaddingH,
    paddingBottom: DC_SPACING.groupGap,
  },
  destructiveGroup: {
    marginHorizontal: DC_SPACING.screenPaddingH,
    backgroundColor: DC_COLORS.surface,
    borderRadius: DC_SPACING.groupRadius,
    overflow: 'hidden',
    marginBottom: DC_SPACING.groupGap,
  },
  destructiveRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
  },
  archiveText: { color: DC_COLORS.gray },
  restoreText: { color: '#0088CC' },
  archivedBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: DC_SPACING.screenPaddingH,
    marginBottom: DC_SPACING.groupGap,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: DC_SPACING.groupRadius,
    backgroundColor: 'rgba(234,88,12,.1)',
    borderWidth: 1,
    borderColor: 'rgba(234,88,12,.24)',
  },
  archivedBannerText: { flex: 1, fontSize: 13, color: '#9A3412', textAlign: 'right', lineHeight: 19 },
  trashIcon: { marginRight: 7 },
  footer: {
    color: DC_COLORS.labelTertiary,
    textAlign: 'center',
    lineHeight: 21,
    paddingTop: 12,
    paddingHorizontal: DC_SPACING.screenPaddingH,
  },
});
