import React, { useCallback, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState } from '../../components/ui';
import { getAttentionDetails, summarizeAttention, type AttentionDetails } from '../../lib/adminApi';
import { useCompany } from '../../lib/CompanyContext';
import { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { AttentionDesktopView } from '../../components/desktop/AttentionDesktopView';
import { AttentionMobile } from './mobile/AttentionMobile';

type Props = NativeStackScreenProps<RootStackParamList, 'Attention'>;

export default function AttentionScreen({ navigation }: Props) {
  const { companyId } = useCompany();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const [details, setDetails] = useState<AttentionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) {
      setError('לא נמצאה חברה משויכת');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setDetails(await getAttentionDetails(companyId));
    } catch (e: any) {
      setError(e?.message ?? 'טעינת המשימות נכשלה');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // Coming back from a fixed driver or vehicle shows the list without it.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (isDesktop) {
    const data = details ? summarizeAttention(details) : { license: 0, insurance: 0, unassignedVehicles: 0, missingLicenseDocuments: 0 };
    const total = Object.values(data).reduce((a, b) => a + b, 0);
    const rows = [
      { count: data.license, icon: 'card-outline' as React.ComponentProps<typeof Ionicons>['name'], title: 'רישיונות נהיגה דורשים טיפול', detail: 'רישיונות שפגו או יפוגו בתוך 30 יום' },
      { count: data.insurance, icon: 'shield-outline' as const, title: 'רכבים ללא ביטוח חובה בתוקף', detail: 'ביטוח חסר או שתוקפו פג' },
      { count: data.unassignedVehicles, icon: 'car-outline' as const, title: 'רכבים ללא נהג משויך', detail: 'אין לרכב שיוך פעיל של נהג' },
      { count: data.missingLicenseDocuments, icon: 'document-outline' as const, title: 'נהגים ללא רישיון מאומת', detail: 'חסר צילום קדמי, אחורי או תוקף רישיון' },
    ].filter((x) => x.count > 0);
    return (
      <DesktopShell active="Attention" breadcrumbs={['ניהול', 'דורש טיפול']}>
        {loading ? null : error ? <ErrorState message={error} onRetry={load} /> : <AttentionDesktopView rows={rows} total={total} />}
      </DesktopShell>
    );
  }

  return (
    <AttentionMobile
      insetTop={insets.top}
      insetBottom={insets.bottom}
      loading={loading}
      refreshing={refreshing}
      error={error}
      details={details}
      onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdminHome'))}
      onRetry={() => {
        setLoading(true);
        void load();
      }}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
      onHome={() => navigation.navigate('AdminHome')}
      onOpenDriver={(driverId) => navigation.navigate('DriverDetail', { driverId })}
      onOpenVehicle={(vehicleId) => navigation.navigate('VehicleDetail', { vehicleId })}
      onOpenLicenseDocs={(driverId) => navigation.navigate('DriverLicenseDocuments', { driverId })}
    />
  );
}
