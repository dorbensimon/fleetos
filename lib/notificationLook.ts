import type { Ionicons } from '@expo/vector-icons';
import type { Notification } from './adminApi/types';
import { isVehicleFolderNotification } from './vehicleFolderAlerts';
import { t } from './i18n';

/**
 * How a notification looks on the desktop — its icon, urgency and age — in
 * one place, so the notifications page and the top-bar bell agree.
 */

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t('time.now');
  if (mins < 60) return t('time.minutesAgo', { mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('time.hoursAgo', { hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? t('time.yesterday') : t('time.daysAgo', { days });
}

export function notificationIcon(type: string | null): keyof typeof Ionicons.glyphMap {
  if (type === 'signature_request_assigned') return 'create-outline';
  if (type === 'signature_request_completed') return 'checkmark-done-outline';
  if (type === 'signature_expiry') return 'hourglass-outline';
  if (type === 'driver_license_expiry') return 'id-card-outline';
  if (type === 'company_carrier_license_expiry') return 'business-outline';
  if (type === 'vehicle_odometer_stale') return 'speedometer-outline';
  if (type === 'driver_meeting_due') return 'people-outline';
  if (type === 'vehicle_safety_check_due') return 'shield-checkmark-outline';
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
  if (isVehicleFolderNotification(type) || type === 'driver_license_expiry' || type === 'company_carrier_license_expiry') {
    return n.message.includes(' פג ב-') ? 'bad' : 'warn';
  }
  // Signature validity (supabase/sql/105): ahead is a heads-up, run out is urgent.
  if (type === 'signature_expiry') return n.message.includes('תפוג בעוד') ? 'warn' : 'bad';
  if (type === 'vehicle_service_due' || type === 'license_update_requested' || type === 'vehicle_odometer_stale') return 'warn';
  // Meeting reminders (supabase/sql/97): a week ahead is a heads-up, due or late is urgent.
  // A heads-up before the date (any lead the company picked); due or late is urgent.
  if (type === 'driver_meeting_due') return n.message.includes('המועד בעוד') || n.message.includes('בשבוע הקרוב') || n.message.includes('הימים הקרובים') ? 'warn' : 'bad';
  // Inspection reminders (supabase/sql/103): ahead is a heads-up, due or late is urgent.
  if (type === 'vehicle_safety_check_due') return n.message.includes('המועד בעוד') || n.message.includes('מתקרבת') ? 'warn' : 'bad';
  return 'brand';
}
