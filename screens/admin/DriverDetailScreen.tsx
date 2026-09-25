import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { showAlert } from '../../lib/platformAlert';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingState, ErrorState, useToast } from '../../components/ui';
import { useCompany } from '../../lib/CompanyContext';
import { getDriver, archiveDriver, restoreDriver, resetDriverPassword, getUserEmail, updateUserEmail, updateDriver, listDepartments, DriverRow, type Department } from '../../lib/adminApi';
import { listDocuments } from '../../lib/documents';
import { listSignatureRequests } from '../../lib/docuseal';
import { exportDriverSnapshotReport } from '../../lib/driverSnapshotReport';
import { RootStackParamList } from '../../navigation/types';
import { DOCUMENT_CATEGORY_BY_ROW, DriverCardRow } from '../../components/driverCard/driverCardSections';
import { DriverDetailMobile } from './mobile/DriverDetailMobile';
import { dialPhone } from '../../lib/phone';
import { ResetDriverPasswordModal } from '../../components/driverCard/ResetDriverPasswordModal';
import { EditUserEmailModal } from '../../components/driverCard/EditUserEmailModal';
import { ConfirmActionModal } from '../../components/driverCard/ConfirmActionModal';
import { buildDriverDetailGroups } from '../../components/driverCard/buildDriverDetailGroups';
import { isValidTemporaryPassword } from '../../lib/validation';
import {
  getPendingLicenseUpdateForDriver,
  reviewLicenseUpdateRequest,
  type LicenseUpdateRequest,
} from '../../lib/licenseUpdate';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DriverDetailDesktopView } from '../../components/desktop/DriverDetailDesktopView';
import { departmentNameById, departmentOptions, isStaleDepartmentError } from '../../lib/driverFields';
import { dateOnlyIsoFromLocalDate } from '../../lib/driverFormValidation';
import { DRIVER_DOCUMENT_GROUPS, LICENSE_DOCS_CATEGORY } from '../../lib/driverDocumentFolders';

const APP_STARTED_AT_MS = Date.now();

/**
 * "כרטיס נהג" — visual layer per DriverCard-spec.md (iOS-native styling,
 * separate from the app-wide design system — see driverCardTheme.ts).
 *
 * Every visible row is backed by live profile, vehicle, document or signing data.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverDetail'>;

export default function DriverDetailScreen({ route, navigation }: Props) {
  const { driverId } = route.params;
  const { companyId, company, profile } = useCompany();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [licensePhotosComplete, setLicensePhotosComplete] = useState(false);
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
  const [departments, setDepartments] = useState<Department[]>([]);
  useFocusEffect(
    useCallback(() => {
      if (!isDesktop || !companyId) return;
      let active = true;
      listDepartments(companyId)
        .then((list) => { if (active) setDepartments(list); })
        .catch(() => {});
      return () => { active = false; };
    }, [isDesktop, companyId])
  );
  // Desktop inline editing — one field per save, merged into the loaded row.
  const saveDriverField = async (patch: Parameters<typeof updateDriver>[1]): Promise<string | null> => {
    try {
      await updateDriver(driverId, patch);
      setDriver((current) => (current ? { ...current, ...patch } : current));
      return null;
    } catch (err: any) {
      if (isStaleDepartmentError(err?.message)) return 'המחלקה שנבחרה נמחקה. יש לבחור מחלקה אחרת';
      return err?.message || 'השמירה נכשלה, נסה שוב';
    }
  };
  const saveDriverEmail = async (email: string): Promise<string | null> => {
    if (!companyId) return 'לא נמצאה חברה משויכת';
    const result = await updateUserEmail(driverId, companyId, email);
    if (!result.ok) return result.error;
    setDriver((current) => (current ? { ...current, email } : current));
    showToast('כתובת המייל עודכנה');
    return null;
  };

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
      const [d, licenseDocs, email] = await Promise.all([
        getDriver(driverId),
        listDocuments('driver', driverId, 'license_docs'),
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

  // Arriving from a "driver uploaded a document" notification: open the
  // folder it is about. The desktop view does this itself (see
  // onFolderOpened below); on the phone each folder has its own screen.
  const openFolderParam = route.params.openFolder;
  useEffect(() => {
    if (isDesktop || !driver || !openFolderParam) return;
    navigation.setParams({ openFolder: undefined });
    if (openFolderParam === LICENSE_DOCS_CATEGORY) {
      navigation.navigate('DriverLicenseDocuments', { driverId });
      return;
    }
    const folder = DRIVER_DOCUMENT_GROUPS.flatMap((group) => group.folders).find((f) => f.category === openFolderParam);
    if (folder) {
      navigation.navigate('DocumentCategory', { ownerType: 'driver', ownerId: driverId, category: folder.category, title: folder.title });
    }
  }, [isDesktop, driver, openFolderParam, navigation, driverId]);

  const exportReport = async () => {
    if (!driver || !company || exportingReport) return;
    setExportingReport(true);
    try {
      const [departments, signatureRequests, documents] = await Promise.all([
        companyId ? listDepartments(companyId) : Promise.resolve([]),
        listSignatureRequests(companyId ?? undefined),
        listDocuments('driver', driverId),
      ]);
      const departmentName = departments.find((d) => d.id === driver.department_id)?.name ?? null;
      const driverSigningRequests = signatureRequests.filter((r) => r.driver_id === driverId);
      await exportDriverSnapshotReport(company, driver, departmentName, driverSigningRequests, documents);
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
      if (targetVehicle?.id) navigation.navigate('VehicleDetail', { vehicleId: targetVehicle.id, returnTo: 'driver', fromDriverId: driverId });
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
  const licenseExpired = !!driver?.license_expiry && driver.license_expiry < dateOnlyIsoFromLocalDate(new Date());
  const licenseStatus: 'expired' | 'verified' | 'pending' =
    licenseExpired ? 'expired' : licensePhotosComplete && !!driver?.license_expiry ? 'verified' : 'pending';
  const groups = buildDriverDetailGroups(driver, licenseStatus).map(group => ({ ...group, rows: group.rows.filter(row => row.key !== 'signing-documents') }));

  // Shared by the desktop record and the phone screen.
  const modals = (
    <>
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
          ' אפשר לשחזר אותו ממסך הארכיון.'
        }
        confirmLabel="העבר לארכיון"
        loading={archiving}
        onConfirm={runArchive}
        onClose={() => setArchiveConfirmOpen(false)}
      />
    </>
  );

  if (isDesktop) {
    return (
      <DesktopShell active="AdminHome" breadcrumbs={['ניהול', 'נהגים', driver?.full_name?.trim() || 'נהג']}>
        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : (
          <DriverDetailDesktopView
            driverId={driverId}
            companyId={companyId ?? ''}
            driver={driver}
            departmentName={departmentNameById(departments, driver?.department_id)}
            departmentOptions={departmentOptions(departments)}
            isArchived={isArchived}
            pendingActivation={pendingActivation}
            pendingActivationDays={pendingActivationDays}
            pendingLicenseRequest={pendingLicenseRequest}
            reviewingLicense={reviewingLicense}
            onReviewLicense={(approve) => void reviewLicense(approve)}
            canSendSigning={!!driver && (profile?.role === 'owner' || (profile?.role === 'admin' && profile.company_id === driver.company_id))}
            onSaveField={saveDriverField}
            onSaveEmail={saveDriverEmail}
            onOpenVehicle={(vehicleId) => navigation.navigate('VehicleDetail', { vehicleId, returnTo: 'driver', fromDriverId: driverId })}
            onVehiclesChanged={() => void getDriver(driverId).then((d) => d && setDriver((prev) => (prev ? { ...d, email: prev.email } : d))).catch(() => {})}
            onOpenSigningSession={(target) => navigation.navigate('DocusealWebView', target)}
            openFolder={route.params.openFolder ?? null}
            onFolderOpened={() => navigation.setParams({ openFolder: undefined })}
            onEdit={() => navigation.navigate('DriverForm', { driverId })}
            onResetPassword={() => setResetOpen(true)}
            onCall={() => driver?.phone && dialPhone(driver.phone)}
            onMessage={() => driver?.phone && Linking.openURL(`sms:${driver.phone}`)}
            onExportReport={() => void exportReport()}
            exportingReport={exportingReport}
            archiving={archiving}
            restoring={restoring}
            onArchive={() => setArchiveConfirmOpen(true)}
            onRestore={() => void runRestore()}
          />
        )}

        {modals}
      </DesktopShell>
    );
  }

  return (
    <DriverDetailMobile
      insetTop={insets.top}
      insetBottom={insets.bottom}
      loading={loading}
      error={loadError}
      driverId={driverId}
      driver={driver}
      groups={groups}
      archived={isArchived}
      pendingActivation={pendingActivation}
      pendingActivationDays={pendingActivationDays}
      licenseRequest={pendingLicenseRequest}
      reviewingLicense={reviewingLicense}
      archiving={archiving}
      restoring={restoring}
      exportingReport={exportingReport}
      modals={modals}
      onBack={() => navigation.goBack()}
      onRetry={load}
      onEdit={() => navigation.navigate('DriverForm', { driverId })}
      onCall={() => driver?.phone && dialPhone(driver.phone)}
      onMessage={() => driver?.phone && Linking.openURL(`sms:${driver.phone}`)}
      onVehicle={() => driver?.vehicle_id && navigation.navigate('VehicleDetail', { vehicleId: driver.vehicle_id, returnTo: 'driver', fromDriverId: driverId })}
      onRow={handleRowPress}
      onOpenSigning={(folder) => navigation.navigate('DriverSigningDocuments', { driverId, folderId: folder.id })}
      onReviewLicense={(approve) => void reviewLicense(approve)}
      onArchive={() => setArchiveConfirmOpen(true)}
      onRestore={() => void runRestore()}
    />
  );
}
