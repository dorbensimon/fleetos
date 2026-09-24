import type { NavigationProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import type { Notification } from './adminApi/types';
import type { UserRole } from './supabase';
import { LICENSE_DOCS_CATEGORY } from './driverDocumentFolders';
import { isVehicleFolderNotification } from './vehicleFolderAlerts';

/**
 * Where tapping a notification leads. One rule for the notifications page,
 * the desktop bell popover and a tapped push notification, so every
 * notification opens the record — and, when it names one, the folder — it
 * is about.
 */
export type NotificationTarget =
  | { screen: 'VehicleDetail'; params: { vehicleId: string; openFolder?: string } }
  | { screen: 'DriverDetail'; params: { driverId: string; openFolder?: string } }
  | { screen: 'DriverPersonalDetails'; params: { driverId: string } }
  | { screen: 'AdminHome' }
  | { screen: 'DriverSigningDocuments' }
  | { screen: 'DriverVehicle' }
  | { screen: 'DriverProfile' };

export type NotificationTargetFields = Pick<
  Notification,
  'notification_type' | 'actor_id' | 'recipient_id' | 'vehicle_id' | 'folder_key' | 'message' | 'company_id'
>;

export function isVehicleNotificationType(type: string | null | undefined): boolean {
  return !!type && (type.startsWith('vehicle_') || isVehicleFolderNotification(type));
}

/** A driver only sees notifications addressed to them; each opens the screen it talks about. */
export function driverNotificationTarget(n: NotificationTargetFields): NotificationTarget | null {
  const type = n.notification_type;
  if (type === 'signature_request_assigned') return { screen: 'DriverSigningDocuments' };
  if (type === 'driver_profile_updated_by_manager' || type === 'license_update_reviewed') return { screen: 'DriverProfile' };
  if (type === 'driver_odometer_update' || isVehicleNotificationType(type)) return { screen: 'DriverVehicle' };
  return null;
}

/**
 * Managers: vehicle alerts open that vehicle (and the folder of an expiry
 * alert), a document a driver uploaded opens that driver's folder, and a
 * driver's own edits open their details. `resolveVehicleId` covers old
 * vehicle notifications stored before `vehicle_id` existed.
 */
export async function adminNotificationTarget<N extends NotificationTargetFields>(
  n: N,
  resolveVehicleId: (n: N) => Promise<string | null>,
): Promise<NotificationTarget | null> {
  const type = n.notification_type;

  if (isVehicleNotificationType(type)) {
    const vehicleId = await resolveVehicleId(n);
    return vehicleId
      ? { screen: 'VehicleDetail', params: { vehicleId, openFolder: n.folder_key ?? undefined } }
      : { screen: 'AdminHome' };
  }

  if (type?.startsWith('driver_document_') && n.actor_id) {
    return { screen: 'DriverDetail', params: { driverId: n.actor_id, openFolder: n.folder_key ?? undefined } };
  }

  if ((type === 'driver_profile_update' || type === 'driver_odometer_update') && n.actor_id) {
    return { screen: 'DriverPersonalDetails', params: { driverId: n.actor_id } };
  }

  if (type === 'license_update_requested' && n.actor_id) {
    return { screen: 'DriverDetail', params: { driverId: n.actor_id, openFolder: LICENSE_DOCS_CATEGORY } };
  }

  if (type === 'signature_request_assigned' && n.recipient_id) {
    return { screen: 'DriverDetail', params: { driverId: n.recipient_id } };
  }

  return null;
}

export function notificationTarget<N extends NotificationTargetFields>(
  role: UserRole | null | undefined,
  n: N,
  resolveVehicleId: (n: N) => Promise<string | null>,
): Promise<NotificationTarget | null> {
  if (role === 'driver') return Promise.resolve(driverNotificationTarget(n));
  return adminNotificationTarget(n, resolveVehicleId);
}

export function navigateToNotificationTarget(
  navigation: { navigate: NavigationProp<RootStackParamList>['navigate'] },
  target: NotificationTarget,
) {
  switch (target.screen) {
    case 'VehicleDetail':
      navigation.navigate('VehicleDetail', target.params);
      return;
    case 'DriverDetail':
      navigation.navigate('DriverDetail', target.params);
      return;
    case 'DriverPersonalDetails':
      navigation.navigate('DriverPersonalDetails', target.params);
      return;
    case 'DriverSigningDocuments':
      navigation.navigate('DriverSigningDocuments', undefined);
      return;
    default:
      navigation.navigate(target.screen);
  }
}
