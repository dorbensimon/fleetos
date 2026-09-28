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
}

export const DRIVER_DOCUMENT_GROUPS: { title: string; folders: DriverDocumentFolder[] }[] = [
  {
    get title() { return t('folder.licensingAndDocs'); },
    folders: [
      { category: 'general', get title() { return t('folder.generalDocs'); }, icon: 'document-text-outline' },
      { category: 'transport_info', get title() { return t('folder.trafficInfoDocs'); }, icon: 'information-circle-outline' },
    ],
  },
  {
    get title() { return t('folder.driverFile'); },
    folders: [
      { category: 'driver_file', get title() { return t('folder.driverFile'); }, icon: 'folder-open-outline' },
      { category: 'notes_feedback', get title() { return t('folder.notesAndResponses'); }, icon: 'chatbubbles-outline' },
      { category: 'traffic_reports', get title() { return t('folder.trafficReports'); }, icon: 'warning-outline' },
      { category: 'accompanying_drivers', get title() { return t('folder.companionDrivers'); }, icon: 'people-outline' },
    ],
  },
  {
    get title() { return t('folder.safetyAndTraining'); },
    folders: [
      { category: 'procedure_6', get title() { return t('folder.procedure6'); }, icon: 'shield-checkmark-outline' },
      { category: 'certifications', get title() { return t('folder.certifications'); }, icon: 'ribbon-outline' },
      { category: 'hazmat', get title() { return t('folder.hazmat'); }, icon: 'flask-outline' },
      { category: 'trainings', get title() { return t('folder.trainings'); }, icon: 'school-outline' },
    ],
  },
];

/** Category of the license front/back photos. */
export const LICENSE_DOCS_CATEGORY = 'license_docs';
/** Document titles the license photos are stored under. */
export const LICENSE_SIDE_TITLES = { get front() { return t('documents.frontSide'); }, get back() { return t('documents.backSide'); } } as const;
