import React, { useCallback, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, BackButton, ErrorState, LoadingState } from '../../components/ui';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { DriverHero } from '../../components/driverCard/DriverHero';
import { ListGroup } from '../../components/driverCard/ListGroup';
import { SigningFolders } from '../../components/driverCard/SigningFolders';
import { buildDriverDetailGroups } from '../../components/driverCard/buildDriverDetailGroups';
import { DC_COLORS, DC_SPACING } from '../../components/driverCard/driverCardTheme';
import type { DriverCardRow } from '../../components/driverCard/driverCardSections';
import { CONTENT_MAX_WIDTH } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { getDriver, type DriverRow } from '../../lib/adminApi';
import { listDocuments } from '../../lib/documents';
import { listSignatureRequests } from '../../lib/docuseal';
import { RootStackParamList } from '../../navigation/types';

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

export default function DriverDocumentsScreen({ navigation }: Props) {
  const { profile } = useCompany();
  const insets = useSafeAreaInsets();
  const profileId = profile?.id;
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [licensePhotosComplete, setLicensePhotosComplete] = useState(false);
  const [pendingSigningCount, setPendingSigningCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setError(null);
    if (!profileId) {
      setError('פרופיל הנהג אינו זמין');
      setLoading(false);
      return;
    }
    try {
      const [loadedDriver, licenseDocs, signatureRequests] = await Promise.all([
        getDriver(profileId),
        listDocuments('driver', profileId, 'license_docs'),
        listSignatureRequests(),
      ]);
      if (requestId !== loadRequest.current) return;
      setDriver(loadedDriver);
      setLicensePhotosComplete(
        licenseDocs.some((doc) => doc.title === 'צד קדמי') && licenseDocs.some((doc) => doc.title === 'צד אחורי')
      );
      setPendingSigningCount(
        signatureRequests.filter((item) => item.driver_id === profileId && ['pending', 'declined'].includes(item.status)).length
      );
    } catch (loadError: any) {
      if (requestId === loadRequest.current) setError(loadError?.message ?? 'טעינת המסמכים נכשלה');
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [profileId]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        loadRequest.current += 1;
      };
    }, [load])
  );

  const licenseExpired = !!driver?.license_expiry && driver.license_expiry < new Date().toISOString().slice(0, 10);
  const licenseStatus: 'expired' | 'verified' | 'pending' = licenseExpired
    ? 'expired'
    : licensePhotosComplete && !!driver?.license_expiry
    ? 'verified'
    : 'pending';
  const groups = buildDriverDetailGroups(driver, licenseStatus, pendingSigningCount).map(group => ({ ...group, rows: group.rows.filter(row => row.key !== 'signing-documents') })).filter(
    (group) => group.title !== 'דוחות' && group.title !== 'ניהול החשבון'
  );

  const handleRowPress = (row: DriverCardRow) => {
    if (!profileId) return;
    if (row.key === 'vehicle' || row.key === 'primary-vehicle' || row.key === 'secondary-vehicle') {
      navigation.navigate('DriverVehicle');
      return;
    }
    if (row.key === 'license-documents') {
      navigation.navigate('DriverLicenseDocuments', { driverId: profileId });
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

  if (loading) {
    return (
      <View style={styles.screen}>
        <AdminGradientBackground />
        <LoadingState />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.screen}>
        <AdminGradientBackground />
        <ErrorState message={error} onRetry={load} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <AdminGradientBackground />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: DC_SPACING.listBottomPadding + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          onPress={() => navigation.navigate('DriverProfile')}
          style={styles.editProfileButton}
          accessibilityRole="button"
          accessibilityLabel="עריכת הפרטים שלי"
        >
          <Ionicons name="create-outline" size={20} color={DC_COLORS.blue} />
        </TouchableOpacity>
        <DriverHero
          name={driver?.full_name ?? profile?.full_name ?? 'ללא שם'}
          avatarLetter={(driver?.full_name ?? profile?.full_name ?? '?').trim().charAt(0)}
          statusColor={DC_COLORS.green}
          subtitleParts={['פעיל']}
        />
        {!!profileId && <SigningFolders driverId={profileId} onOpen={folder => navigation.navigate('DriverSigningDocuments', { folderId: folder.id })} />}
        {groups.map((group) => (
          <ListGroup key={group.title} group={group} onRowPress={handleRowPress} />
        ))}
        <AppText style={styles.permissionHint}>
          חלק מהפרטים מנוהלים על ידי מנהל הצי. ניתן לצפות במסמכים ולהעלות מסמכים לפי ההרשאות שלך.
        </AppText>
      </ScrollView>
      <View style={[styles.floatingNavigation, { top: insets.top + 12 }]}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DC_COLORS.bg },
  scroll: { flex: 1 },
  content: { paddingTop: 12, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  floatingNavigation: { position: 'absolute', right: DC_SPACING.screenPaddingH },
  editProfileButton: {
    position: 'absolute',
    top: 18,
    left: DC_SPACING.screenPaddingH,
    zIndex: 2,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: DC_COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(10,127,208,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0A7FD0',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  permissionHint: {
    color: DC_COLORS.labelTertiary,
    fontSize: 12.5,
    lineHeight: 19,
    textAlign: 'center',
    writingDirection: 'rtl',
    paddingHorizontal: DC_SPACING.screenPaddingH,
  },
});
