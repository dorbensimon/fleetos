import { supabase } from './supabase';
import { VEHICLE_FOLDER_ALERTS } from './vehicleFolderAlerts';

/**
 * Per-user notification preferences (PRD: `.claude/prds/notification-settings.md`).
 *
 * Backed by a `notification_preferences` table that Roi is building in
 * parallel (migration not yet confirmed live as of writing this file).
 * Schema assumed, per the PRD's "מודל נתונים מוצע" section:
 *   - user_id            uuid, references the acting user (not a role/scope)
 *   - notification_type  text, one of the 6 values below
 *   - enabled            boolean, default true
 *   - unique (user_id, notification_type)
 *
 * A missing row for a given (user_id, notification_type) pair means
 * "enabled" — the table only ever stores exceptions to the "everything on"
 * default, so a brand-new user never needs a row seeded for them.
 */

export type NotificationType =
  | 'driver_profile_update'
  | 'driver_document_upload'
  | 'vehicle_insurance_mandatory_expiry'
  | 'vehicle_insurance_comprehensive_expiry'
  | 'vehicle_annual_test_expiry'
  | 'vehicle_license_expiry'
  | 'vehicle_operating_license_expiry'
  | 'vehicle_safety_officer_approval_expiry'
  | 'vehicle_tachograph_calibration_expiry'
  | 'vehicle_brakes_semiannual_expiry'
  | 'vehicle_brakes_annual_expiry'
  | 'vehicle_winter_inspection_expiry'
  | 'vehicle_child_detection_expiry'
  | 'vehicle_service_due'
  | 'signature_request_assigned'
  | 'vehicle_assignment'
  | 'driver_profile_updated_by_manager';

export interface NotificationTypeInfo {
  type: NotificationType;
  label: string;
  description: string;
}

/** One toggle per vehicle folder (see lib/vehicleFolderAlerts.ts and migration 90). */
const vehicleFolderTypes = (description: string): NotificationTypeInfo[] =>
  VEHICLE_FOLDER_ALERTS.map((folder) => ({
    type: folder.notificationType as NotificationType,
    label: `תוקף ${folder.label}`,
    description,
  }));

/** Hebrew label + short explanation shown per toggle, in the PRD's table order. */
export const ADMIN_NOTIFICATION_TYPES: NotificationTypeInfo[] = [
  {
    type: 'driver_profile_update',
    label: 'עדכון פרטי נהג',
    description: 'נהג עדכן פרטים אישיים — שם, טלפון, ת.ז, מספר עובד, דרגת/תוקף רישיון או מחלקה',
  },
  {
    type: 'driver_document_upload',
    label: 'העלאת מסמך נהג',
    description: 'נהג העלה מסמך חדש לתיק האישי שלו',
  },
  ...vehicleFolderTypes('לפני שהתוקף פג (לפי זמן ההתראה של החברה) וביום שהוא פג'),
  {
    type: 'vehicle_service_due',
    label: 'טיפול רכב',
    description: 'נותרו עד 1,000 ק"מ לטיפול התקופתי הבא, או שהרכב עבר את מועד הטיפול',
  },
];

export const DRIVER_NOTIFICATION_TYPES: NotificationTypeInfo[] = [
  {
    type: 'signature_request_assigned',
    label: 'מסמך חדש לחתימה',
    description: 'המנהל שלח אליך מסמך חדש שממתין לחתימה',
  },
  {
    type: 'vehicle_assignment',
    label: 'שיוך לרכב',
    description: 'המנהל שייך אותך לרכב חדש',
  },
  {
    type: 'driver_profile_updated_by_manager',
    label: 'עדכון הפרטים שלי',
    description: 'המנהל עדכן פרטים אישיים או פרטי רישיון בתיק שלך',
  },
  ...vehicleFolderTypes('ברכב שלך — לפני שהתוקף פג וביום שהוא פג'),
];

export const NOTIFICATION_TYPES: NotificationTypeInfo[] = [
  ...ADMIN_NOTIFICATION_TYPES,
  ...DRIVER_NOTIFICATION_TYPES,
];

export type NotificationPreferencesMap = Record<NotificationType, boolean>;

interface NotificationPreferenceRow {
  notification_type: string;
  enabled: boolean;
}

/**
 * Returns a full map of all 6 known types → enabled state for this user.
 * Types with no row in the table default to `true` (see the PRD's default
 * rule), so the caller never needs to special-case "no row yet".
 */
export async function getPreferences(userId: string): Promise<NotificationPreferencesMap> {
  const defaults = Object.fromEntries(
    NOTIFICATION_TYPES.map((t) => [t.type, true])
  ) as NotificationPreferencesMap;

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('notification_type, enabled')
    .eq('user_id', userId);

  if (error) throw error;

  for (const row of (data ?? []) as NotificationPreferenceRow[]) {
    if (row.notification_type in defaults) {
      defaults[row.notification_type as NotificationType] = row.enabled;
    }
  }

  return defaults;
}

/**
 * Sets a single preference immediately (no batch/save step, per the PRD's
 * "no separate save button" acceptance criterion). Upserts on the
 * `(user_id, notification_type)` unique pair so both "never touched
 * before" and "toggled again" go through the same call.
 */
export async function setPreference(
  userId: string,
  type: NotificationType,
  enabled: boolean
): Promise<void> {
  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      { user_id: userId, notification_type: type, enabled },
      { onConflict: 'user_id,notification_type' }
    );

  if (error) throw error;
}

/**
 * Company-wide lead time for vehicle folder expiry alerts (migration 90):
 * how many days before a folder expires the "about to expire" alert goes
 * out. One value per company, shared by all its admins and drivers.
 */
export const DEFAULT_VEHICLE_EXPIRY_LEAD_DAYS = 20;
export const MIN_VEHICLE_EXPIRY_LEAD_DAYS = 1;
export const MAX_VEHICLE_EXPIRY_LEAD_DAYS = 90;

export async function getVehicleExpiryLeadDays(companyId: string): Promise<number> {
  const { data, error } = await supabase
    .from('companies')
    .select('vehicle_expiry_lead_days')
    .eq('id', companyId)
    .single();
  if (error) throw error;
  return (data as { vehicle_expiry_lead_days: number | null }).vehicle_expiry_lead_days ?? DEFAULT_VEHICLE_EXPIRY_LEAD_DAYS;
}

/** Company rows are owner-only under RLS; admins go through this narrow RPC. */
export async function setVehicleExpiryLeadDays(companyId: string, days: number): Promise<void> {
  const { error } = await supabase.rpc('set_vehicle_expiry_lead_days', { p_company_id: companyId, p_days: days });
  if (error) throw error;
}
