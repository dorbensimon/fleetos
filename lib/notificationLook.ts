import type { Ionicons } from '@expo/vector-icons';
import type { Notification } from './adminApi/types';
import { isVehicleFolderNotification } from './vehicleFolderAlerts';

/**
 * How a notification looks on the desktop — its icon, urgency and age — in
 * one place, so the notifications page and the top-bar bell agree.
 */

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'אתמול' : `לפני ${days} ימים`;
}

export function notificationIcon(type: string | null): keyof typeof Ionicons.glyphMap {
  if (type === 'signature_request_assigned') return 'create-outline';
  if (type === 'vehicle_assignment') return 'car-outline';
  if (type?.startsWith('vehicle_')) return 'warning-outline';
  if (type?.startsWith('license_update')) return 'card-outline';
  if (type === 'driver_odometer_update') return 'speedometer-outline';
  if (type?.startsWith('driver_document_')) return 'document-text-outline';
  return 'person-outline';
}

/**
 * Row urgency. Folder expiry messages are written by the daily scan
 * (supabase/sql/90_vehicle_folder_expiry_notifications.sql): an expired
 * folder's message reads "... פג ב-<date>", an upcoming one "... יפוג בעוד".
 */
export function notificationTone(n: Pick<Notification, 'notification_type' | 'message'>): 'bad' | 'warn' | 'brand' {
  const type = n.notification_type;
  if (isVehicleFolderNotification(type)) return n.message.includes(' פג ב-') ? 'bad' : 'warn';
  if (type === 'vehicle_service_due' || type === 'license_update_requested') return 'warn';
  return 'brand';
}
