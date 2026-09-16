import type { UserRole } from './supabase';

export type PushNotificationData = {
  notificationType?: string | null;
};

export function routeForPushNotification(
  role: UserRole,
  data: PushNotificationData,
): 'Notifications' | 'DriverSigningDocuments' | 'DriverVehicle' | 'DriverProfile' {
  const type = data.notificationType;

  if (role === 'driver') {
    if (type === 'signature_request_assigned') return 'DriverSigningDocuments';
    if (type === 'driver_profile_updated_by_manager') return 'DriverProfile';
    if (type === 'vehicle_assignment' || type === 'vehicle_inspection_last_date_expiry' || type === 'driver_odometer_update') {
      return 'DriverVehicle';
    }
    return 'Notifications';
  }

  return 'Notifications';
}
