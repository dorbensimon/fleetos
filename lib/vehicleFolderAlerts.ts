/**
 * Vehicle folders that raise expiry notifications — the client-side mirror
 * of the daily scan in supabase/sql/90_vehicle_folder_expiry_notifications.sql.
 * Keep the keys, types and order in sync with that migration.
 *
 * `folderKey` is what a notification's `folder_key` column holds: a
 * compliance item type for the compliance folders, a document category for
 * the document folders. Tapping a notification opens that folder.
 */
export type VehicleFolderSource = 'compliance' | 'document';

export interface VehicleFolderAlert {
  folderKey: string;
  notificationType: string;
  label: string;
  source: VehicleFolderSource;
}

export const VEHICLE_FOLDER_ALERTS: VehicleFolderAlert[] = [
  { folderKey: 'vehicle_license', notificationType: 'vehicle_license_expiry', label: 'רישיון רכב', source: 'compliance' },
  { folderKey: 'operating_license', notificationType: 'vehicle_operating_license_expiry', label: 'רישיון הפעלה', source: 'compliance' },
  { folderKey: 'insurance_mandatory', notificationType: 'vehicle_insurance_mandatory_expiry', label: 'ביטוח חובה', source: 'compliance' },
  { folderKey: 'insurance_comprehensive', notificationType: 'vehicle_insurance_comprehensive_expiry', label: 'ביטוח מקיף', source: 'compliance' },
  { folderKey: 'annual_test', notificationType: 'vehicle_annual_test_expiry', label: 'טסט שנתי', source: 'compliance' },
  { folderKey: 'safety_officer_approval', notificationType: 'vehicle_safety_officer_approval_expiry', label: 'אישור קצין בטיחות', source: 'document' },
  { folderKey: 'tachograph_calibration', notificationType: 'vehicle_tachograph_calibration_expiry', label: 'כיול טכוגרף', source: 'document' },
  { folderKey: 'brakes_semiannual', notificationType: 'vehicle_brakes_semiannual_expiry', label: 'בלמים חצי-שנתי', source: 'document' },
  { folderKey: 'brakes_annual', notificationType: 'vehicle_brakes_annual_expiry', label: 'בלמים שנתי', source: 'document' },
  { folderKey: 'winter_inspection', notificationType: 'vehicle_winter_inspection_expiry', label: 'בדיקת חורף', source: 'document' },
  { folderKey: 'child_detection', notificationType: 'vehicle_child_detection_expiry', label: 'שכחת ילדים', source: 'document' },
];

const BY_TYPE = new Map(VEHICLE_FOLDER_ALERTS.map((alert) => [alert.notificationType, alert]));
const BY_KEY = new Map(VEHICLE_FOLDER_ALERTS.map((alert) => [alert.folderKey, alert]));

export function isVehicleFolderNotification(type: string | null | undefined): boolean {
  return !!type && BY_TYPE.has(type);
}

export function vehicleFolderByKey(folderKey: string | null | undefined): VehicleFolderAlert | null {
  return (folderKey && BY_KEY.get(folderKey)) || null;
}
