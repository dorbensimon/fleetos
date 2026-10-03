import { supabase } from './supabase';
import { VEHICLE_FOLDER_ALERTS, isVehicleFolderNotification } from './vehicleFolderAlerts';
import { t, getLocale } from './i18n';

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
  | 'vehicle_safety_check_due'
  | 'license_update_requested'
  | 'license_update_reviewed'
  | 'driver_license_expiry'
  | 'company_carrier_license_expiry'
  | 'vehicle_odometer_stale'
  | 'signature_request_completed'
  | 'signature_expiry'
  | 'owner_company_activated'
  | 'owner_admin_added'
  | 'owner_company_not_activated'
  | 'owner_company_inactive'
  | 'owner_carrier_license_expiry'
  | 'owner_trial_ending'
  | 'owner_renewal_due'
  | 'owner_vehicle_limit';

export interface NotificationTypeInfo {
  type: NotificationType;
  label: string;
  description: string;
}

/** A label without its "validity" wording, for compact places ("תוקף ביטוח חובה" → "ביטוח חובה"). */
export function withoutValidity(label: string): string {
  const [prefix, suffix = ''] = t('prefs.validityOf', { label: '\u0000' }).split('\u0000');
  let short = label;
  if (prefix && short.startsWith(prefix)) short = short.slice(prefix.length);
  if (suffix && short.endsWith(suffix)) short = short.slice(0, -suffix.length);
  return short || label;
}

/** One toggle per vehicle folder (see lib/vehicleFolderAlerts.ts and migration 90). */
const vehicleFolderTypes = (descriptionKey: string): NotificationTypeInfo[] =>
  VEHICLE_FOLDER_ALERTS.map((folder) => ({
    type: folder.notificationType as NotificationType,
    get label() {
      // The tachograph folder's own name already says "validity".
      return folder.folderKey === 'tachograph_calibration' ? folder.label : t('prefs.validityOf', { label: folder.label });
    },
    get description() { return t(descriptionKey); },
  }));

/** Hebrew label + short explanation shown per toggle, in the PRD's table order. */
export const ADMIN_NOTIFICATION_TYPES: NotificationTypeInfo[] = [
  {
    type: 'driver_profile_update',
    get label() { return t('prefs.type.driverDetailsUpdate'); },
    get description() { return t('prefs.type.driverDetailsUpdateDesc'); },
  },
  {
    type: 'driver_document_upload',
    get label() { return t('prefs.type.driverDocUpload'); },
    get description() { return t('prefs.type.driverDocUploadDesc'); },
  },
  {
    type: 'license_update_requested',
    get label() { return t('prefs.type.licenseUpdateRequest'); },
    get description() { return t('prefs.type.licenseUpdateRequestDesc'); },
  },
  {
    type: 'signature_request_completed',
    get label() { return t('prefs.type.documentSigned'); },
    get description() { return t('prefs.type.documentSignedDesc'); },
  },
  {
    type: 'signature_expiry',
    get label() { return t('prefs.type.signatureExpiry'); },
    get description() { return t('prefs.type.signatureExpiryDesc'); },
  },
  {
    type: 'driver_license_expiry',
    get label() { return t('prefs.type.driverLicense'); },
    get description() { return t('prefs.type.driverLicenseDesc'); },
  },
  {
    type: 'company_carrier_license_expiry',
    get label() { return t('prefs.type.carrierLicense'); },
    get description() { return t('prefs.type.carrierLicenseDesc'); },
  },
  ...vehicleFolderTypes('prefs.type.vehicleFolderDesc'),
  {
    type: 'vehicle_service_due',
    get label() { return t('prefs.type.vehicleService'); },
    get description() { return t('prefs.type.vehicleServiceDesc'); },
  },
  {
    type: 'vehicle_odometer_stale',
    get label() { return t('prefs.type.odometerStale'); },
    get description() { return t('prefs.type.odometerStaleDesc'); },
  },
  {
    type: 'driver_meeting_due',
    get label() { return t('prefs.type.driverMeeting'); },
    get description() { return t('prefs.type.driverMeetingDesc'); },
  },
  {
    type: 'vehicle_safety_check_due',
    get label() { return t('prefs.type.safetyInspection'); },
    get description() { return t('prefs.type.safetyInspectionDesc'); },
  },
];

export const DRIVER_NOTIFICATION_TYPES: NotificationTypeInfo[] = [
  {
    type: 'signature_request_assigned',
    get label() { return t('prefs.type.newSigningDoc'); },
    get description() { return t('prefs.type.newSigningDocDesc'); },
  },
  {
    type: 'signature_expiry',
    get label() { return t('prefs.type.mySignatureExpiry'); },
    get description() { return t('prefs.type.mySignatureExpiryDesc'); },
  },
  {
    type: 'vehicle_assignment',
    get label() { return t('prefs.type.vehicleAssignment'); },
    get description() { return t('prefs.type.vehicleAssignmentDesc'); },
  },
  {
    type: 'driver_profile_updated_by_manager',
    get label() { return t('prefs.type.myDetailsUpdate'); },
    get description() { return t('prefs.type.myDetailsUpdateDesc'); },
  },
  {
    type: 'license_update_reviewed',
    get label() { return t('prefs.type.licenseRequestReply'); },
    get description() { return t('prefs.type.licenseRequestReplyDesc'); },
  },
  {
    type: 'driver_license_expiry',
    get label() { return t('prefs.type.myLicenseExpiry'); },
    get description() { return t('prefs.type.myLicenseExpiryDesc'); },
  },
  {
    type: 'vehicle_odometer_stale',
    get label() { return t('prefs.type.odometerReminder'); },
    get description() { return t('prefs.type.odometerReminderDesc'); },
  },
  ...vehicleFolderTypes('prefs.type.myVehicleFolderDesc'),
];

/**
 * The owner's alerts (migration 102): about companies and their managers,
 * never about drivers. Grouped in notificationGroups by OWNER_GROUP_OF.
 */
export const OWNER_NOTIFICATION_TYPES: NotificationTypeInfo[] = [
  {
    type: 'owner_company_activated',
    get label() { return t('prefs.type.companyStarted'); },
    get description() { return t('prefs.type.companyStartedDesc'); },
  },
  {
    type: 'owner_company_not_activated',
    get label() { return t('prefs.type.companyNotStarted'); },
    get description() { return t('prefs.type.companyNotStartedDesc'); },
  },
  {
    type: 'owner_admin_added',
    get label() { return t('prefs.type.newManager'); },
    get description() { return t('prefs.type.newManagerDesc'); },
  },
  {
    type: 'owner_company_inactive',
    get label() { return t('prefs.type.companyInactive'); },
    get description() { return t('prefs.type.companyInactiveDesc'); },
  },
  {
    type: 'owner_trial_ending',
    get label() { return t('prefs.type.trialEnd'); },
    get description() { return t('prefs.type.trialEndDesc'); },
  },
  {
    type: 'owner_renewal_due',
    get label() { return t('prefs.type.renewal'); },
    get description() { return t('prefs.type.renewalDesc'); },
  },
  {
    type: 'owner_vehicle_limit',
    get label() { return t('prefs.type.vehicleQuota'); },
    get description() { return t('prefs.type.vehicleQuotaDesc'); },
  },
  {
    type: 'owner_carrier_license_expiry',
    get label() { return t('prefs.type.companyCarrierLicense'); },
    get description() { return t('prefs.type.companyCarrierLicenseDesc'); },
  },
];

const OWNER_GROUP_OF: Partial<Record<NotificationType, 'customers' | 'billing' | 'compliance'>> = {
  owner_company_activated: 'customers',
  owner_company_not_activated: 'customers',
  owner_admin_added: 'customers',
  owner_company_inactive: 'customers',
  owner_trial_ending: 'billing',
  owner_renewal_due: 'billing',
  owner_vehicle_limit: 'billing',
  owner_carrier_license_expiry: 'compliance',
};

export const NOTIFICATION_TYPES: NotificationTypeInfo[] = [
  ...ADMIN_NOTIFICATION_TYPES,
  ...DRIVER_NOTIFICATION_TYPES,
  ...OWNER_NOTIFICATION_TYPES,
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
    NOTIFICATION_TYPES.map((entry) => [entry.type, true])
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

/** Sets several types at once ("turn all on/off"), in one request. */
export async function setPreferences(
  userId: string,
  types: NotificationType[],
  enabled: boolean
): Promise<void> {
  if (!types.length) return;
  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      types.map((type) => ({ user_id: userId, notification_type: type, enabled })),
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
  vehicle_safety_check_due: { unit: 'days', min: 1, max: 30, step: 1, presets: [3, 7, 14, 30] },
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
  vehicle_safety_check_due: 7,
  vehicle_service_due: SERVICE_LEAD_KM_DEFAULT,
  driver_license_expiry: 30,
  company_carrier_license_expiry: 30,
  vehicle_odometer_stale: 30,
};

/** "20 ימים לפני", "1,000 ק״מ לפני הטיפול", "30 ימים בלי עדכון". */
export function leadPhrase(value: number, rule: LeadRule): string {
  if (rule.unit === 'km') return t('prefs.timing.kmBefore', { v1: value.toLocaleString(getLocale()) });
  if (rule.unit === 'idle') return t('prefs.timing.daysWithoutUpdate', { value });
  return value === 1 ? t('prefs.timing.oneDayBefore') : t('prefs.timing.daysBefore', { value });
}

/** The words after the number in a lead editor. */
export function leadUnitWord(value: number, rule: LeadRule): string {
  if (rule.unit === 'km') return t('prefs.timing.kmBeforeUnit');
  if (rule.unit === 'idle') return t('prefs.timing.daysWithoutUpdateUnit');
  return value === 1 ? t('prefs.timing.dayBeforeUnit') : t('prefs.timing.daysBeforeUnit');
}

/** Which way "+" moves the alert, for screen readers. */
export function leadStepLabels(rule: LeadRule): { up: string; down: string } {
  return rule.unit === 'idle' ? { up: t('prefs.timing.waitLonger'), down: t('prefs.timing.waitLess') } : { up: t('prefs.timing.earlier'), down: t('prefs.timing.later') };
}

export interface NotificationGroup {
  key: 'drivers' | 'licenses' | 'folders' | 'care' | 'personal' | 'customers' | 'billing' | 'compliance';
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
  signature_expiry: 'drivers',
  driver_license_expiry: 'licenses',
  company_carrier_license_expiry: 'licenses',
  vehicle_service_due: 'care',
  vehicle_odometer_stale: 'care',
  driver_meeting_due: 'care',
  vehicle_safety_check_due: 'care',
};

/** The settings page's sections, the same on the phone and the desktop. */
export function notificationGroups(types: NotificationTypeInfo[], isDriver: boolean, isOwner = false): NotificationGroup[] {
  if (isOwner) {
    const ownerGroups: NotificationGroup[] = [
      { key: 'customers', title: t('prefs.group.companies'), subtitle: t('prefs.group.companiesDesc'), items: types.filter((entry) => OWNER_GROUP_OF[entry.type] === 'customers') },
      { key: 'billing', title: t('prefs.group.billing'), subtitle: t('prefs.group.billingDesc'), items: types.filter((entry) => OWNER_GROUP_OF[entry.type] === 'billing') },
      { key: 'compliance', title: t('common.licensing'), items: types.filter((entry) => OWNER_GROUP_OF[entry.type] === 'compliance') },
    ];
    return ownerGroups.filter((group) => group.items.length > 0);
  }
  const folders = types.filter((entry) => isVehicleFolderNotification(entry.type));
  const rest = types.filter((entry) => !folders.includes(entry));
  const folderGroup: NotificationGroup = {
    key: 'folders',
    title: isDriver ? t('prefs.group.myVehicleDocs') : t('prefs.group.vehicleDocs'),
    subtitle: isDriver
      ? t('prefs.group.myVehicleDocsDesc')
      : t('prefs.group.vehicleDocsDesc'),
    items: folders,
    compact: true,
  };
  const groups: NotificationGroup[] = isDriver
    ? [{ key: 'personal', title: t('prefs.group.updatesToMe'), items: rest }, folderGroup]
    : [
        { key: 'drivers', title: t('prefs.group.driverUpdates'), items: rest.filter((entry) => ADMIN_GROUP_OF[entry.type] === 'drivers') },
        {
          key: 'licenses',
          title: t('prefs.group.licenses'),
          subtitle: t('prefs.group.licensesDesc'),
          items: rest.filter((entry) => ADMIN_GROUP_OF[entry.type] === 'licenses'),
        },
        folderGroup,
        { key: 'care', title: t('prefs.group.serviceAndMeetings'), items: rest.filter((entry) => ADMIN_GROUP_OF[entry.type] === 'care') },
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
