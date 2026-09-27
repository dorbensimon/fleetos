import { supabase } from './supabase';
import { VEHICLE_FOLDER_ALERTS, isVehicleFolderNotification } from './vehicleFolderAlerts';

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
  | 'driver_profile_updated_by_manager'
  | 'driver_meeting_due'
  | 'license_update_requested'
  | 'license_update_reviewed'
  | 'driver_license_expiry'
  | 'company_carrier_license_expiry'
  | 'vehicle_odometer_stale'
  | 'signature_request_completed';

export interface NotificationTypeInfo {
  type: NotificationType;
  label: string;
  description: string;
}

/** One toggle per vehicle folder (see lib/vehicleFolderAlerts.ts and migration 90). */
const vehicleFolderTypes = (description: string): NotificationTypeInfo[] =>
  VEHICLE_FOLDER_ALERTS.map((folder) => ({
    type: folder.notificationType as NotificationType,
    label: folder.label.startsWith('תוקף') ? folder.label : `תוקף ${folder.label}`,
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
  {
    type: 'license_update_requested',
    label: 'בקשה לעדכון רישיון',
    description: 'נהג ביקש לעדכן את פרטי רישיון הנהיגה שלו, והבקשה ממתינה לאישורך',
  },
  {
    type: 'signature_request_completed',
    label: 'מסמך נחתם',
    description: 'נהג חתם על מסמך ששלחת לו',
  },
  {
    type: 'driver_license_expiry',
    label: 'רישיון נהיגה של נהג',
    description: 'לפני שרישיון הנהיגה של נהג פג, וביום שהוא פג',
  },
  {
    type: 'company_carrier_license_expiry',
    label: 'רישיון מוביל של החברה',
    description: 'לפני שתוקף רישיון המוביל פג, וביום שהוא פג (לפי התאריך בהגדרות החברה)',
  },
  ...vehicleFolderTypes('לפני שהתוקף פג (לפי זמן ההתראה של החברה) וביום שהוא פג'),
  {
    type: 'vehicle_service_due',
    label: 'טיפול רכב',
    description: 'לפני הטיפול התקופתי הבא, או כשהרכב עבר את מועד הטיפול',
  },
  {
    type: 'vehicle_odometer_stale',
    label: 'קילומטראז׳ לא עודכן',
    description: 'אף אחד לא עדכן את הקילומטראז׳ של רכב זמן רב, ולכן התראת הטיפול בו לא מדויקת',
  },
  {
    type: 'driver_meeting_due',
    label: 'מפגש עם נהג',
    description: 'לפני מועד מפגש חוזר עם נהג (למשל מפגש שיחה עם נהג) וביום עצמו, וגם מפגש ראשון עם נהג חדש',
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
    type: 'license_update_reviewed',
    label: 'תשובה לבקשת עדכון רישיון',
    description: 'המנהל אישר או דחה את הבקשה שלך לעדכן את פרטי הרישיון',
  },
  {
    type: 'driver_license_expiry',
    label: 'תוקף רישיון הנהיגה שלי',
    description: 'לפני שרישיון הנהיגה שלך פג, וביום שהוא פג',
  },
  {
    type: 'vehicle_odometer_stale',
    label: 'תזכורת לעדכון קילומטראז׳',
    description: 'כשהקילומטראז׳ ברכב שלך לא עודכן זמן רב',
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

/**
 * Per-type lead times (migration 100): when each timed alert goes out.
 * Stored per company in companies.notification_lead_days; a type without
 * its own value keeps the old rule (folders: the company default above,
 * the meeting: 7 days, the service: 1,000 km).
 */
/** days: before a date. km: before the service. idle: days without an odometer update. */
export type LeadUnit = 'days' | 'km' | 'idle';

export interface LeadRule {
  unit: LeadUnit;
  min: number;
  max: number;
  step: number;
  /** A few one-click values. */
  presets: number[];
}

const FOLDER_LEAD_RULE: LeadRule = { unit: 'days', min: 1, max: 90, step: 1, presets: [7, 14, 30, 60] };

export const LEAD_RULES: Partial<Record<NotificationType, LeadRule>> = {
  ...Object.fromEntries(VEHICLE_FOLDER_ALERTS.map((folder) => [folder.notificationType, FOLDER_LEAD_RULE])),
  driver_meeting_due: { unit: 'days', min: 1, max: 30, step: 1, presets: [3, 7, 14, 30] },
  vehicle_service_due: { unit: 'km', min: 100, max: 5000, step: 100, presets: [500, 1000, 2000, 3000] },
  driver_license_expiry: { unit: 'days', min: 1, max: 90, step: 1, presets: [14, 30, 60, 90] },
  company_carrier_license_expiry: { unit: 'days', min: 1, max: 90, step: 1, presets: [14, 30, 60, 90] },
  vehicle_odometer_stale: { unit: 'idle', min: 7, max: 90, step: 1, presets: [14, 30, 45, 60] },
};

export const MEETING_LEAD_DEFAULT = 7;
export const SERVICE_LEAD_KM_DEFAULT = 1000;

/** What a type without its own value uses (migrations 100 and 101); folders use the company default. */
const FIXED_LEAD_DEFAULTS: Partial<Record<NotificationType, number>> = {
  driver_meeting_due: MEETING_LEAD_DEFAULT,
  vehicle_service_due: SERVICE_LEAD_KM_DEFAULT,
  driver_license_expiry: 30,
  company_carrier_license_expiry: 30,
  vehicle_odometer_stale: 30,
};

/** "20 ימים לפני", "1,000 ק״מ לפני הטיפול", "30 ימים בלי עדכון". */
export function leadPhrase(value: number, rule: LeadRule): string {
  if (rule.unit === 'km') return `${value.toLocaleString('he-IL')} ק״מ לפני הטיפול`;
  if (rule.unit === 'idle') return `${value} ימים בלי עדכון`;
  return value === 1 ? 'יום אחד לפני' : `${value} ימים לפני`;
}

/** The words after the number in a lead editor. */
export function leadUnitWord(value: number, rule: LeadRule): string {
  if (rule.unit === 'km') return 'ק״מ לפני הטיפול';
  if (rule.unit === 'idle') return 'ימים בלי עדכון';
  return value === 1 ? 'יום לפני' : 'ימים לפני';
}

/** Which way "+" moves the alert, for screen readers. */
export function leadStepLabels(rule: LeadRule): { up: string; down: string } {
  return rule.unit === 'idle' ? { up: 'לחכות יותר', down: 'לחכות פחות' } : { up: 'להקדים', down: 'לאחר' };
}

export interface NotificationGroup {
  key: 'drivers' | 'licenses' | 'folders' | 'care' | 'personal';
  title: string;
  subtitle?: string;
  items: NotificationTypeInfo[];
  /** Folder cards drop the repeated "תוקף" and the shared description. */
  compact?: boolean;
}

const ADMIN_GROUP_OF: Partial<Record<NotificationType, NotificationGroup['key']>> = {
  driver_profile_update: 'drivers',
  driver_document_upload: 'drivers',
  license_update_requested: 'drivers',
  signature_request_completed: 'drivers',
  driver_license_expiry: 'licenses',
  company_carrier_license_expiry: 'licenses',
  vehicle_service_due: 'care',
  vehicle_odometer_stale: 'care',
  driver_meeting_due: 'care',
};

/** The settings page's sections, the same on the phone and the desktop. */
export function notificationGroups(types: NotificationTypeInfo[], isDriver: boolean): NotificationGroup[] {
  const folders = types.filter((t) => isVehicleFolderNotification(t.type));
  const rest = types.filter((t) => !folders.includes(t));
  const folderGroup: NotificationGroup = {
    key: 'folders',
    title: isDriver ? 'תוקף מסמכי הרכב שלי' : 'תוקף מסמכי הרכב',
    subtitle: isDriver
      ? 'התראה לפני שהתוקף פג, ושוב ביום עצמו. את מועד ההתראה קובע מנהל הצי.'
      : 'התראה לפני שהתוקף פג, ושוב ביום עצמו. לכל תיקייה מועד משלה.',
    items: folders,
    compact: true,
  };
  const groups: NotificationGroup[] = isDriver
    ? [{ key: 'personal', title: 'עדכונים אליי', items: rest }, folderGroup]
    : [
        { key: 'drivers', title: 'עדכונים מהנהגים', items: rest.filter((t) => ADMIN_GROUP_OF[t.type] === 'drivers') },
        {
          key: 'licenses',
          title: 'רישיונות',
          subtitle: 'רישיונות הנהיגה של הנהגים ורישיון המוביל של החברה.',
          items: rest.filter((t) => ADMIN_GROUP_OF[t.type] === 'licenses'),
        },
        folderGroup,
        { key: 'care', title: 'טיפולים ומפגשים', items: rest.filter((t) => ADMIN_GROUP_OF[t.type] === 'care') },
      ];
  return groups.filter((group) => group.items.length > 0);
}

export interface NotificationLeads {
  /** The value each timed type uses right now (its own, or the default it falls back to). */
  values: Partial<Record<NotificationType, number>>;
  /** Types that carry their own value rather than a default. */
  custom: Set<NotificationType>;
  /** False until migration 100 is applied: only the shared folder value can change. */
  perType: boolean;
}

function resolveLeads(folderDefault: number, own: Record<string, unknown>, perType: boolean): NotificationLeads {
  const values: Partial<Record<NotificationType, number>> = {};
  const custom = new Set<NotificationType>();
  for (const type of Object.keys(LEAD_RULES) as NotificationType[]) {
    const fallback = FIXED_LEAD_DEFAULTS[type] ?? folderDefault;
    const value = own[type];
    if (typeof value === 'number' && Number.isFinite(value)) {
      values[type] = value;
      custom.add(type);
    } else {
      values[type] = fallback;
    }
  }
  return { values, custom, perType };
}

export async function getNotificationLeads(companyId: string): Promise<NotificationLeads> {
  const { data, error } = await supabase
    .from('companies')
    .select('vehicle_expiry_lead_days, notification_lead_days')
    .eq('id', companyId)
    .single();
  if (!error) {
    const row = data as { vehicle_expiry_lead_days: number | null; notification_lead_days: Record<string, unknown> | null };
    return resolveLeads(row.vehicle_expiry_lead_days ?? DEFAULT_VEHICLE_EXPIRY_LEAD_DAYS, row.notification_lead_days ?? {}, true);
  }
  // Before migration 100 the column doesn't exist: fall back to the shared value.
  const days = await getVehicleExpiryLeadDays(companyId);
  return resolveLeads(days, {}, false);
}

/** Sets one type's own lead time (admins, through the RPC from migration 100). */
export async function setNotificationLead(companyId: string, type: NotificationType, value: number): Promise<void> {
  const { error } = await supabase.rpc('set_notification_lead', { p_company_id: companyId, p_type: type, p_value: value });
  if (error) throw error;
}
