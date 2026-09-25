import React, { useMemo } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DriverAttentionMobile, expiredDetail, soonDetail, type AttentionTask } from './DriverAttentionMobile';
import { useDriverOverview } from '../../lib/useDriverOverview';
import { statusOfDate } from '../../components/driverKit';
import { formatDate } from '../../lib/theme';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverAttention'>;

/** Opened from the home screen's "דורש טיפול" panel. */
export default function DriverAttentionScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { driver, vehicle, items, pendingRequests, loading, error, reload } = useDriverOverview();

  const plate = vehicle?.plate_number;
  const license = driver?.license_expiry ?? null;
  const { expired, soon, signatures } = useMemo(() => {
    const expiredTasks: AttentionTask[] = [];
    const soonTasks: AttentionTask[] = [];
    const openVehicle = () => navigation.navigate('DriverVehicle');
    for (const item of items) {
      const status = statusOfDate(item.target);
      if (status !== 'expired' && status !== 'soon') continue;
      const task: AttentionTask = {
        key: `vehicle-${item.item.id}`,
        status,
        icon: 'car-sport',
        title: item.title,
        detail: `${status === 'expired' ? expiredDetail(item.target) : soonDetail(item.target)} · ${item.target ? formatDate(item.target) : ''}`,
        hint: status === 'expired'
          ? `${item.title} של ${plate ? `הרכב ${plate}` : 'הרכב'} כבר לא בתוקף. תאם חידוש מול מנהל הצי.`
          : 'כדאי לתאם את החידוש כבר עכשיו, לפני שהתוקף פג.',
        action: 'לפרטי הרכב',
        onPress: openVehicle,
      };
      (status === 'expired' ? expiredTasks : soonTasks).push(task);
    }
    const licenseStatus = statusOfDate(license);
    if (licenseStatus === 'expired' || licenseStatus === 'soon') {
      (licenseStatus === 'expired' ? expiredTasks : soonTasks).push({
        key: 'license',
        status: licenseStatus,
        icon: 'id-card',
        title: 'רישיון נהיגה',
        detail: `${licenseStatus === 'expired' ? expiredDetail(license) : soonDetail(license)} · ${license ? formatDate(license) : ''}`,
        hint: licenseStatus === 'expired'
          ? 'אחרי שחידשת, עדכן את התוקף החדש ואת צילום הרישיון.'
          : 'אחרי החידוש, עדכן כאן את התוקף החדש.',
        action: 'לעדכון הרישיון',
        onPress: () => navigation.navigate('DriverProfile'),
      });
    }
    const signatureTasks: AttentionTask[] = pendingRequests.map((request) => {
      const title = request.template?.title || request.template_title || 'מסמך לחתימה';
      const folderId = request.template_id || `legacy:${request.template_title || request.id}`;
      const sent = request.sent_at || request.created_at;
      return {
        key: `sign-${request.id}`,
        status: 'soon',
        icon: 'create',
        title,
        detail: `נשלח אליך ${new Date(sent).toLocaleDateString('he-IL')}`,
        hint: 'מנהל הצי מחכה לחתימה שלך. זה לוקח דקה.',
        action: 'לחתימה על המסמך',
        onPress: () => navigation.navigate('DriverSigningDocuments', { folderId }),
      };
    });
    return { expired: expiredTasks, soon: soonTasks, signatures: signatureTasks };
  }, [items, license, navigation, pendingRequests, plate]);

  return (
    <DriverAttentionMobile
      insetTop={insets.top}
      insetBottom={insets.bottom}
      loading={loading}
      error={error}
      expired={expired}
      signatures={signatures}
      soon={soon}
      onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('DriverHome'))}
      onRetry={reload}
      onHome={() => navigation.navigate('DriverHome')}
    />
  );
}
