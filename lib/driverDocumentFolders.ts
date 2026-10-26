// התיקיות הקבועות בתיק הנהג
import type { Ionicons } from '@expo/vector-icons';
import { t } from './i18n';

/**
 * The driver's document folders, grouped as on the driver card — shared by
 * the desktop driver record (DriverDetailDesktopView) and the driver
 * snapshot report (driverSnapshotReport.ts) so both list the same folders in
 * the same order. The license photos (`license_docs`) have their own
 * section in both and are not listed here.
 */
export interface DriverDocumentFolder {
  category: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** 'required': no upload without a valid-until date; 'optional': the date can be left empty. */
  expiry: 'required' | 'optional';
}

// קבוצות התיקיות בתיק הנהג
export const DRIVER_DOCUMENT_GROUPS: { title: string; folders: DriverDocumentFolder[] }[] = [
  {
    get title() { return t('folder.licensingAndDocs'); },
    folders: [
      { category: 'general', get title() { return t('folder.generalDocs'); }, expiry: 'required', icon: 'document-text-outline' },
      { category: 'transport_info', get title() { return t('folder.trafficInfoDocs'); }, expiry: 'required', icon: 'information-circle-outline' },
    ],
  },
  {
    get title() { return t('folder.driverFile'); },
    folders: [
      { category: 'driver_file', get title() { return t('folder.driverFile'); }, expiry: 'required', icon: 'folder-open-outline' },
      { category: 'notes_feedback', get title() { return t('folder.notesAndResponses'); }, expiry: 'optional', icon: 'chatbubbles-outline' },
      { category: 'traffic_reports', get title() { return t('folder.trafficReports'); }, expiry: 'optional', icon: 'warning-outline' },
      { category: 'accompanying_drivers', get title() { return t('folder.companionDrivers'); }, expiry: 'required', icon: 'people-outline' },
    ],
  },
  {
    get title() { return t('folder.safetyAndTraining'); },
    folders: [
      { category: 'procedure_6', get title() { return t('folder.procedure6'); }, expiry: 'optional', icon: 'shield-checkmark-outline' },
      { category: 'certifications', get title() { return t('folder.certifications'); }, expiry: 'required', icon: 'ribbon-outline' },
      { category: 'hazmat', get title() { return t('folder.hazmat'); }, expiry: 'required', icon: 'flask-outline' },
      { category: 'trainings', get title() { return t('folder.trainings'); }, expiry: 'required', icon: 'school-outline' },
    ],
  },
];

// הקטגוריה של תמונות הרישיון (קדימה ואחורה)
/** Category of the license front/back photos. */
export const LICENSE_DOCS_CATEGORY = 'license_docs';

// האם תיקייה בתיק הנהג מחייבת תאריך תוקף
/**
 * Folders whose files always have a valid-until date. Notes, traffic reports
 * and procedure 6 events are records, not permits: their date is optional.
 */
export function driverFolderRequiresExpiry(category: string): boolean {
  return DRIVER_DOCUMENT_GROUPS.some((group) => group.folders.some((f) => f.category === category && f.expiry === 'required'));
}

/** A fixed folder of the driver file (not a field on the driver card). */
export function isDriverDocumentFolder(category: string): boolean {
  return DRIVER_DOCUMENT_GROUPS.some((group) => group.folders.some((f) => f.category === category));
}
