import type { Ionicons } from '@expo/vector-icons';

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
    title: 'רישוי ומסמכים',
    folders: [
      { category: 'general', title: 'מסמכים כלליים', icon: 'document-text-outline' },
      { category: 'transport_info', title: 'מסמכי מידע תעבורתי', icon: 'information-circle-outline' },
    ],
  },
  {
    title: 'תיק נהג',
    folders: [
      { category: 'driver_file', title: 'תיק נהג', icon: 'folder-open-outline' },
      { category: 'notes_feedback', title: 'הערות ותגובות', icon: 'chatbubbles-outline' },
      { category: 'traffic_reports', title: 'דוחות תעבורה', icon: 'warning-outline' },
      { category: 'accompanying_drivers', title: 'נהגים נלווים', icon: 'people-outline' },
    ],
  },
  {
    title: 'בטיחות והדרכות',
    folders: [
      { category: 'procedure_6', title: 'נוהל 6', icon: 'shield-checkmark-outline' },
      { category: 'certifications', title: 'הסמכות והכשרות', icon: 'ribbon-outline' },
      { category: 'hazmat', title: 'חומרים מסוכנים', icon: 'flask-outline' },
      { category: 'trainings', title: 'הדרכות והכשרות', icon: 'school-outline' },
    ],
  },
];

/** Category of the license front/back photos. */
export const LICENSE_DOCS_CATEGORY = 'license_docs';
/** Document titles the license photos are stored under. */
export const LICENSE_SIDE_TITLES = { front: 'צד קדמי', back: 'צד אחורי' } as const;
