import type { UserRole } from './supabase';
import { isVehicleFolderNotification } from './vehicleFolderAlerts';

export type PushNotificationData = {
  notificationType?: string | null;
  /** Set on vehicle folder expiry alerts (migration 90) — the vehicle and folder to open. */
  vehicleId?: string | null;
  folderKey?: string | null;
};

export function routeForPushNotification(
  role: UserRole,
  data: PushNotificationData,
): 'Notifications' | 'DriverSigningDocuments' | 'DriverVehicle' | 'DriverProfile' | 'VehicleDetail' {
  const type = data.notificationType;

  if (role === 'driver') {
    if (type === 'signature_request_assigned') return 'DriverSigningDocuments';
    if (type === 'driver_profile_updated_by_manager') return 'DriverProfile';
    if (type === 'vehicle_assignment' || type === 'driver_odometer_update' || isVehicleFolderNotification(type)) {
      return 'DriverVehicle';
    }
    return 'Notifications';
  }

  if (isVehicleFolderNotification(type) && data.vehicleId) return 'VehicleDetail';
  return 'Notifications';
}
