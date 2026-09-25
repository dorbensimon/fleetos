import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, ErrorState, LoadingState } from '../../components/ui';
import { ListGroup } from '../../components/driverCard/ListGroup';
import { SigningFolders } from '../../components/driverCard/SigningFolders';
import { buildDriverDetailGroups } from '../../components/driverCard/buildDriverDetailGroups';
import { DC_COLORS } from '../../components/driverCard/driverCardTheme';
import type { DriverCardRow } from '../../components/driverCard/driverCardSections';
import { useCompany } from '../../lib/CompanyContext';
import { getDriver, updateDriver, type DriverRow } from '../../lib/adminApi';
import { listDocuments } from '../../lib/documents';
import { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { HoverPressable } from '../../components/desktop/primitives';
import { DriverLicenseModal, LICENSE_SIDE_TITLE } from '../../components/desktop/driver/DriverLicenseModal';
import { DriverDocumentsMobile } from './DriverDocumentsMobile';
import { dateOnlyIsoFromLocalDate } from '../../lib/driverFormValidation';

/**
 * The driver's self-service dossier intentionally uses the same card
 * components as an admin viewing that driver. Rows lead to the same document
 * screens, while manager-only actions are omitted rather than merely hidden.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverDocuments'>;

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

function hasBothLicenseSides(docs: { title: string | null }[]): boolean {
  return docs.some((doc) => doc.title === LICENSE_SIDE_TITLE.front) && docs.some((doc) => doc.title === LICENSE_SIDE_TITLE.back);
}

export default function DriverDocumentsScreen({ navigation }: Props) {
  const { companyId, profile, loading: profileLoading } = useCompany();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const profileId = profile?.id;
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [licensePhotosComplete, setLicensePhotosComplete] = useState(false);
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setError(null);
    if (!profileId) {
      // Right after a refresh the profile is still on its way: keep loading.
      if (profileLoading) return;
      setError('פרופיל הנהג אינו זמין');
      setLoading(false);
      return;
    }
    try {
      const [loadedDriver, licenseDocs] = await Promise.all([
        getDriver(profileId),
        listDocuments('driver', profileId, 'license_docs'),
      ]);
      if (requestId !== loadRequest.current) return;
      setDriver(loadedDriver);
      setLicensePhotosComplete(hasBothLicenseSides(licenseDocs));
    } catch (loadError: any) {
      if (requestId === loadRequest.current) setError(loadError?.message ?? 'טעינת המסמכים נכשלה');
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [profileId, profileLoading]);

  // After a photo changes in the license window, refresh only the license
  // status, so the page behind the window doesn't flash a loading state.
  const refreshLicensePhotos = useCallback(async () => {
    if (!profileId) return;
    const licenseDocs = await listDocuments('driver', profileId, 'license_docs').catch(() => null);
    if (licenseDocs) setLicensePhotosComplete(hasBothLicenseSides(licenseDocs));
  }, [profileId]);

  const saveLicenseExpiry = async (date: string | null): Promise<string | null> => {
    if (!profileId) return 'פרופיל הנהג אינו זמין';
    try {
      await updateDriver(profileId, { license_expiry: date });
      setDriver((current) => (current ? { ...current, license_expiry: date } : current));
      return null;
    } catch (err: any) {
      return err?.message || 'השמירה נכשלה, נסה שוב';
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        loadRequest.current += 1;
      };
    }, [load])
  );

  const licenseExpired = !!driver?.license_expiry && driver.license_expiry < dateOnlyIsoFromLocalDate(new Date());
  const licenseStatus: 'expired' | 'verified' | 'pending' = licenseExpired
    ? 'expired'
    : licensePhotosComplete && !!driver?.license_expiry
    ? 'verified'
    : 'pending';
  const groups = buildDriverDetailGroups(driver, licenseStatus).map(group => ({ ...group, rows: group.rows.filter(row => row.key !== 'signing-documents') })).filter(
    (group) => group.title !== 'דוחות' && group.title !== 'ניהול החשבון'
  );

  const handleRowPress = (row: DriverCardRow) => {
    if (!profileId) return;
    if (row.key === 'vehicle' || row.key === 'primary-vehicle' || row.key === 'secondary-vehicle') {
      navigation.navigate('DriverVehicle');
      return;
    }
    if (row.key === 'license-documents') {
      // Same license screen the manager uses: a window on desktop, a page on mobile.
      if (isDesktop) setLicenseModalOpen(true);
      else navigation.navigate('DriverLicenseDocuments', { driverId: profileId });
      return;
    }
    if (row.key === 'signing-documents') {
      navigation.navigate('DriverSigningDocuments');
      return;
    }
    const category = DOCUMENT_CATEGORY_BY_ROW[row.key];
    if (category) {
      navigation.navigate('DocumentCategory', {
        ownerType: 'driver',
        ownerId: profileId,
        category,
        title: row.label,
        allowDelete: false,
      });
    }
  };

  if (isDesktop) {
    return (
      <DesktopShell active="DriverDocuments" breadcrumbs={['המסמכים שלי']}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <View style={desktopStyles.wrap}>
            <View style={desktopStyles.headRow}>
              <View>
                <AppText weight="bold" style={desktopStyles.heading}>{driver?.full_name ?? profile?.full_name ?? 'ללא שם'}</AppText>
                <AppText style={desktopStyles.subheading}>נהג פעיל</AppText>
              </View>
              <HoverPressable style={desktopStyles.editButton} onPress={() => navigation.navigate('DriverProfile')}>
                <Ionicons name="create-outline" size={14} color={DC_COLORS.blue} />
              </HoverPressable>
            </View>
            {!!profileId && <SigningFolders driverId={profileId} onOpen={folder => navigation.navigate('DriverSigningDocuments', { folderId: folder.id })} />}
            {groups.map((group) => (
              <ListGroup key={group.title} group={group} onRowPress={handleRowPress} />
            ))}
            <AppText style={desktopStyles.permissionHint}>
              חלק מהפרטים מנוהלים על ידי מנהל הצי. ניתן לצפות במסמכים ולהעלות מסמכים לפי ההרשאות שלך.
            </AppText>
          </View>
        )}
        {!!profileId && !!companyId && (
          <DriverLicenseModal
            visible={licenseModalOpen}
            onClose={() => setLicenseModalOpen(false)}
            companyId={companyId}
            driverId={profileId}
            driver={driver}
            pendingRequest={null}
            reviewing={false}
            onReview={() => {}}
            onSaveExpiry={saveLicenseExpiry}
            onPhotosChanged={() => void refreshLicensePhotos()}
          />
        )}
      </DesktopShell>
    );
  }

  return (
    <DriverDocumentsMobile
      insetTop={insets.top}
      insetBottom={insets.bottom}
      loading={loading}
      error={error}
      name={driver?.full_name ?? profile?.full_name ?? 'ללא שם'}
      groups={groups}
      isNavigable={(row) => row.kind === 'nav' || row.key === 'vehicle'}
      onRow={handleRowPress}
      onSigning={() => navigation.navigate('DriverSigningDocuments')}
      onEditProfile={() => navigation.navigate('DriverProfile')}
      onBack={() => navigation.goBack()}
      onRetry={load}
    />
  );
}

const desktopStyles = StyleSheet.create({
  wrap: { padding: 24, maxWidth: 520, alignSelf: 'center', width: '100%', gap: 12 },
  headRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  heading: { fontSize: 16, color: DC_COLORS.label },
  subheading: { fontSize: 12, color: DC_COLORS.labelTertiary, marginTop: 2 },
  editButton: { width: 30, height: 30, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(10,127,208,0.2)', alignItems: 'center', justifyContent: 'center' },
  permissionHint: {
    color: DC_COLORS.labelTertiary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
