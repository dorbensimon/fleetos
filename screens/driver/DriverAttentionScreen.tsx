import React, { useMemo } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DriverAttentionMobile, expiredDetail, soonDetail, type AttentionTask } from './DriverAttentionMobile';
import { useDriverOverview } from '../../lib/useDriverOverview';
import { statusOfDate } from '../../components/driverKit';
import { formatDate } from '../../lib/theme';
import type { RootStackParamList } from '../../navigation/types';
import { requestTitle } from '../../lib/signingFolders';
import { t, getLocale } from '../../lib/i18n';

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
    const openVehicle = (focus: string) => navigation.navigate('DriverVehicle', { focus });
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
          ? t('driver.attention.expiredTitle', { title: item.title, v1: plate ? t('driver.attention.vehiclePlate', { plate }) : t('common.theVehicle') })
          : t('driver.attention.renewSoon'),
        action: t('driver.attention.toVehicleDetails'),
        onPress: () => openVehicle(item.item.item_type),
      };
      (status === 'expired' ? expiredTasks : soonTasks).push(task);
    }
    const licenseStatus = statusOfDate(license);
    if (licenseStatus === 'expired' || licenseStatus === 'soon') {
      (licenseStatus === 'expired' ? expiredTasks : soonTasks).push({
        key: 'license',
        status: licenseStatus,
        icon: 'id-card',
        title: t('driver.drivingLicense'),
        detail: `${licenseStatus === 'expired' ? expiredDetail(license) : soonDetail(license)} · ${license ? formatDate(license) : ''}`,
        hint: licenseStatus === 'expired'
          ? t('driver.attention.afterRenewPhoto')
          : t('driver.attention.afterRenewExpiry'),
        action: t('driver.attention.toLicenseUpdate'),
        onPress: () => navigation.navigate('DriverProfile', { focus: 'license_expiry', edit: true }),
      });
    }
    const signatureTasks: AttentionTask[] = pendingRequests.map((request) => {
      const title = request.template?.title || requestTitle(request) || t('signing.docToSign');
      const sent = request.sent_at || request.created_at;
      return {
        key: `sign-${request.id}`,
        status: 'soon',
        icon: 'create',
        title,
        detail: t('driver.attention.sentToYou', { v1: new Date(sent).toLocaleDateString(getLocale()) }),
        hint: t('driver.attention.managerWaiting'),
        action: t('notifications.action.signDocument'),
        onPress: () => navigation.navigate('DriverSigningDocuments', { requestId: request.id }),
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
