import { supabase } from './supabase';

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
  | 'vehicle_inspection_last_date_expiry'
  | 'vehicle_service_due'
  | 'signature_request_assigned'
  | 'vehicle_assignment'
  | 'driver_profile_updated_by_manager';

export interface NotificationTypeInfo {
  type: NotificationType;
  label: string;
  description: string;
}

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
  {
    type: 'vehicle_insurance_mandatory_expiry',
    label: 'תוקף ביטוח חובה',
    description: 'ביטוח חובה של רכב מתקרב לפקיעה (עד 20 יום מראש)',
  },
  {
    type: 'vehicle_insurance_comprehensive_expiry',
    label: 'תוקף ביטוח מקיף',
    description: 'ביטוח מקיף של רכב מתקרב לפקיעה (עד 20 יום מראש)',
  },
  {
    type: 'vehicle_annual_test_expiry',
    label: 'תוקף טסט שנתי',
    description: 'טסט שנתי לרכב מתקרב לפקיעה (עד 20 יום מראש)',
  },
  {
    type: 'vehicle_inspection_last_date_expiry',
    label: 'תוקף בדיקת רכב',
    description: 'בדיקת רכב שמחושבת לפי תאריך הבדיקה האחרונה כבר פגה ודורשת טיפול',
  },
  {
    type: 'vehicle_service_due',
    label: 'טיפול רכב מתקרב',
    description: 'נותרו עד 1,000 ק"מ לטיפול התקופתי הבא ברכב',
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
  {
    type: 'vehicle_inspection_last_date_expiry',
    label: 'תוקף בדיקת רכב',
    description: 'אחת מבדיקות הרכב שלך פגה לפי תאריך הבדיקה האחרונה',
  },
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
