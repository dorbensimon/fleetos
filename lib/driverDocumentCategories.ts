import { Ionicons } from '@expo/vector-icons';

/**
 * The document categories on a driver's file — shared between the
 * admin's "כרטיס נהג" menu and the driver's own "המסמכים שלי" screen,
 * so both sides land in the same DocumentCategoryScreen/category and
 * see the same files.
 */
export type DriverDocCategory = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

export const DRIVER_DOCUMENT_CATEGORIES: DriverDocCategory[] = [
  { key: 'license_docs', label: 'מסמכי רישיון נהיגה', icon: 'card-outline' },
  { key: 'driver_file', label: 'תיק נהג', icon: 'folder-outline' },
  { key: 'notes_feedback', label: 'הערות לנהג ותגובות הנהג', icon: 'chatbubble-ellipses-outline' },
  { key: 'traffic_reports', label: 'דוחות תעבורה', icon: 'alert-circle-outline' },
  { key: 'procedure_6', label: 'נוהל 6', icon: 'shield-checkmark-outline' },
  { key: 'certifications', label: 'הסמכות והכשרות', icon: 'ribbon-outline' },
  { key: 'accompanying_drivers', label: 'נהגים נלווים', icon: 'people-outline' },
  { key: 'hazmat', label: 'חומרים מסוכנים', icon: 'warning-outline' },
  { key: 'trainings', label: 'הדרכות והכשרות', icon: 'school-outline' },
  { key: 'general', label: 'מסמכים כלליים', icon: 'document-text-outline' },
  { key: 'transport_info', label: 'מסמכי מידע תעבורתי', icon: 'information-circle-outline' },
];
