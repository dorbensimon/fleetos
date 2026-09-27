import type { NavigationProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import type { Notification } from './adminApi/types';
import type { UserRole } from './supabase';
import { LICENSE_DOCS_CATEGORY } from './driverDocumentFolders';
import { isVehicleFolderNotification } from './vehicleFolderAlerts';
import { fieldKeysFromMessage, focusParam } from './notificationFocus';

/**
 * Where tapping a notification leads. One rule for the notifications page,
 * the desktop bell popover and a tapped push notification, so every
 * notification opens the record — and, when it names one, the folder — it
 * is about.
 */
export type NotificationTarget =
  | { screen: 'VehicleDetail'; params: { vehicleId: string; openFolder?: string; tab?: 'maintenance'; focus?: string } }
  | { screen: 'DriverDetail'; params: { driverId: string; openFolder?: string; focus?: string } }
  | { screen: 'DriverPersonalDetails'; params: { driverId: string; focus?: string } }
  | { screen: 'AdminHome' }
  | { screen: 'DriverSigningDocuments'; params?: { driverId?: string; requestId?: string } }
  | { screen: 'DriverMeetingFolder'; params: { driverId: string; folderId: string } }
  | { screen: 'SignedDocuments'; params: { openMeeting: string } }
  | { screen: 'DriverVehicle'; params?: { focus?: string } }
  | { screen: 'DriverProfile'; params?: { focus?: string; edit?: boolean } };

export type NotificationTargetFields = Pick<
  Notification,
  'notification_type' | 'actor_id' | 'recipient_id' | 'vehicle_id' | 'folder_key' | 'message' | 'company_id' | 'signature_request_id'
>;

/** The three license fields, lit up together when a license request was reviewed. */
export const LICENSE_FOCUS = 'license_number,license_classes,license_expiry';

export function isVehicleNotificationType(type: string | null | undefined): boolean {
  return !!type && (type.startsWith('vehicle_') || isVehicleFolderNotification(type));
}

/**
 * A driver only sees notifications addressed to them; each opens the exact
 * place it talks about: the document to sign, the changed field, the
 * vehicle folder that is about to expire.
 */
export function driverNotificationTarget(n: NotificationTargetFields): NotificationTarget | null {
  const type = n.notification_type;
  if (type === 'signature_request_assigned') {
    return n.signature_request_id
      ? { screen: 'DriverSigningDocuments', params: { requestId: n.signature_request_id } }
      : { screen: 'DriverSigningDocuments' };
  }
  if (type === 'driver_profile_updated_by_manager') {
    const focus = focusParam(fieldKeysFromMessage(n.message));
    return focus ? { screen: 'DriverProfile', params: { focus } } : { screen: 'DriverProfile' };
  }
  if (type === 'license_update_reviewed') return { screen: 'DriverProfile', params: { focus: LICENSE_FOCUS } };
  if (type === 'vehicle_service_due') return { screen: 'DriverVehicle', params: { focus: 'service' } };
  if (type === 'driver_odometer_update') return { screen: 'DriverVehicle', params: { focus: 'odometer' } };
  if (isVehicleNotificationType(type)) {
    return n.folder_key ? { screen: 'DriverVehicle', params: { focus: n.folder_key } } : { screen: 'DriverVehicle' };
  }
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

  if (type === 'vehicle_service_due') {
    const vehicleId = await resolveVehicleId(n);
    return vehicleId
      ? { screen: 'VehicleDetail', params: { vehicleId, tab: 'maintenance', focus: 'service' } }
      : { screen: 'AdminHome' };
  }

  if (isVehicleNotificationType(type)) {
    const vehicleId = await resolveVehicleId(n);
    return vehicleId
      ? { screen: 'VehicleDetail', params: { vehicleId, openFolder: n.folder_key ?? undefined } }
      : { screen: 'AdminHome' };
  }

  // The odometer lives on the vehicle; the message names its plate.
  if (type === 'driver_odometer_update') {
    const vehicleId = await resolveVehicleId(n);
    if (vehicleId) return { screen: 'VehicleDetail', params: { vehicleId, tab: 'maintenance', focus: 'odometer' } };
    return n.actor_id ? { screen: 'DriverDetail', params: { driverId: n.actor_id } } : null;
  }

  if (type?.startsWith('driver_document_') && n.actor_id) {
    return { screen: 'DriverDetail', params: { driverId: n.actor_id, openFolder: n.folder_key ?? undefined } };
  }

  if (type === 'driver_profile_update' && n.actor_id) {
    const focus = focusParam(fieldKeysFromMessage(n.message));
    return { screen: 'DriverDetail', params: focus ? { driverId: n.actor_id, focus } : { driverId: n.actor_id } };
  }

  if (type === 'license_update_requested' && n.actor_id) {
    return { screen: 'DriverDetail', params: { driverId: n.actor_id, openFolder: LICENSE_DOCS_CATEGORY } };
  }

  // A repeating meeting is due (supabase/sql/97): one driver opens that
  // driver's folder of the form; a summary opens the form's "מפגש חדש" list.
  if (type === 'driver_meeting_due' && n.folder_key) {
    return n.actor_id
      ? { screen: 'DriverMeetingFolder', params: { driverId: n.actor_id, folderId: n.folder_key } }
      : { screen: 'SignedDocuments', params: { openMeeting: n.folder_key } };
  }

  if (type === 'signature_request_assigned' && n.recipient_id) {
    return {
      screen: 'DriverSigningDocuments',
      params: n.signature_request_id
        ? { driverId: n.recipient_id, requestId: n.signature_request_id }
        : { driverId: n.recipient_id },
    };
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
      navigation.navigate('DriverSigningDocuments', target.params);
      return;
    case 'DriverMeetingFolder':
      navigation.navigate('DriverSigningDocuments', target.params);
      return;
    case 'SignedDocuments':
      navigation.navigate('SignedDocuments', target.params);
      return;
    case 'DriverVehicle':
      navigation.navigate('DriverVehicle', target.params);
      return;
    case 'DriverProfile':
      navigation.navigate('DriverProfile', target.params);
      return;
    default:
      navigation.navigate(target.screen);
  }
}
