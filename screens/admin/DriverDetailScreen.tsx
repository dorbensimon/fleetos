import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, LoadingState, ErrorState, PrimaryButton, useToast } from '../../components/ui';
import { COLORS, RADIUS, SPACING } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { getDriver, archiveDriver, restoreDriver, resetDriverPassword, getUserEmail, listDepartments, DriverRow } from '../../lib/adminApi';
import { listDocuments } from '../../lib/documents';
import { listSignatureRequests } from '../../lib/docuseal';
import { exportDriverSnapshotReport } from '../../lib/driverSnapshotReport';
import { RootStackParamList } from '../../navigation/types';
import { NavBarCollapsing } from '../../components/driverCard/NavBarCollapsing';
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
import { ConfirmActionModal } from '../../components/driverCard/ConfirmActionModal';
import { buildDriverDetailGroups } from '../../components/driverCard/buildDriverDetailGroups';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { MIN_PASSWORD_LENGTH } from '../../lib/validation';

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
  const scrollY = useRef(new Animated.Value(0)).current;
  const loadRequest = useRef(0);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);

  const closeReset = () => {
    setResetOpen(false);
    setResetPassword('');
    setResetConfirm('');
    setResetError('');
  };

  const submitReset = async () => {
    if (!companyId) return;
    if (resetPassword.length < MIN_PASSWORD_LENGTH) {
      setResetError('הסיסמה חייבת להכיל לפחות 8 תווים');
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
    Alert.alert('הסיסמה אופסה', 'הנהג יתבקש לקבוע סיסמה קבועה משלו בכניסה הבאה.');
  };

  const runArchive = async () => {
    if (!companyId) return;
    setArchiving(true);
    const result = await archiveDriver(driverId, companyId);
    setArchiving(false);
    setArchiveConfirmOpen(false);
    if (!result.ok) {
      Alert.alert('ההעברה לארכיון נכשלה', result.error);
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
      Alert.alert('שחזור הנהג נכשל', result.error);
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
      if (targetVehicle?.id) navigation.navigate('VehicleDetail', { vehicleId: targetVehicle.id });
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
  const assignedVehicleCount = driver?.vehicles.length ?? 0;
  const licenseVerified = licensePhotosComplete && !!driver?.license_expiry;
  const groups = buildDriverDetailGroups(driver, licenseVerified, pendingSigningCount);

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
      <NavBarCollapsing
        scrollY={scrollY}
        insetTop={insets.top}
        backLabel="נהגים"
        onBack={() => navigation.goBack()}
        onMore={() => navigation.navigate('DriverForm', { driverId })}
        backgroundColor="transparent"
      />

      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
      >
        <DriverHero
          name={driver?.full_name ?? 'ללא שם'}
          avatarLetter={(driver?.full_name ?? '?').trim().charAt(0)}
          statusColor={driver?.status === 'archived' ? DC_COLORS.gray : DC_COLORS.green}
          subtitleParts={[driver?.status === 'archived' ? 'לא פעיל' : 'פעיל']}
        />

        {isArchived && (
          <View style={styles.archivedBanner}>
            <Feather name="archive" size={16} color="#9A3412" />
            <AppText style={styles.archivedBannerText}>
              נהג זה נמצא בארכיון ואין לו גישה לאפליקציה. מחיקה לצמיתות מתבצעת ממסך הארכיון.
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
                  navigation.navigate('VehicleDetail', { vehicleId: driver.vehicle_id });
                }
              }}
            />
          ))}
        </View>

        {groups.map((group) => (
          <ListGroup key={group.title} group={group} onRowPress={handleRowPress} />
        ))}

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
      </Animated.ScrollView>

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
  screen: { flex: 1, backgroundColor: '#F1F4F7' },
  scroll: { backgroundColor: 'transparent' },
  content: { paddingBottom: DC_SPACING.listBottomPadding, paddingTop: 12 },
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
