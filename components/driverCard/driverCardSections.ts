import type { DriverCardBadgeTone, DriverCardTint } from './driverCardTheme';

/** Row content for the driver card's list groups, per DriverCard-spec.md §6. */

export type DriverCardIconKey =
  | 'phone'
  | 'email'
  | 'message'
  | 'car'
  | 'id'
  | 'sign'
  | 'doc'
  | 'info'
  | 'folder'
  | 'chat'
  | 'alert'
  | 'users'
  | 'shield'
  | 'award'
  | 'hazard'
  | 'cap'
  | 'edit'
  | 'key';

export type DriverCardRowKey =
  | 'phone'
  | 'email'
  | 'national-id'
  | 'vehicle'
  | 'primary-vehicle'
  | 'secondary-vehicle'
  | 'license-documents'
  | 'signing-documents'
  | 'general-documents'
  | 'traffic-info-documents'
  | 'driver-file'
  | 'notes-comments'
  | 'traffic-reports'
  | 'companion-drivers'
  | 'procedure-6'
  | 'certifications'
  | 'hazmat'
  | 'training'
  | 'edit-driver'
  | 'reset-driver-password';

export interface DriverCardValueRow {
  key: DriverCardRowKey;
  kind: 'value';
  label: string;
  icon: DriverCardIconKey;
  tint: DriverCardTint;
  value: string;
  ltr?: boolean;
  pressable?: boolean;
}

export interface DriverCardNavRow {
  key: DriverCardRowKey;
  kind: 'nav';
  label: string;
  icon: DriverCardIconKey;
  tint: DriverCardTint;
  badge?: string;
  tone?: DriverCardBadgeTone;
}

export type DriverCardRow = DriverCardValueRow | DriverCardNavRow;

export interface DriverCardGroup {
  title: string;
  rows: DriverCardRow[];
}

export const DRIVER_CARD_GROUPS: DriverCardGroup[] = [
  {
    title: 'פרטי קשר ורכב',
    rows: [
      { key: 'phone', kind: 'value', label: 'טלפון', icon: 'phone', tint: 'green', value: '050-0001101', ltr: true, pressable: true },
      { key: 'email', kind: 'value', label: 'אימייל', icon: 'message', tint: 'blue', value: '—', ltr: true },
      { key: 'national-id', kind: 'value', label: 'ת״ז', icon: 'id', tint: 'gray', value: '204•••118', ltr: true },
    ],
  },
  {
    title: 'מסמכים ורישוי',
    rows: [
      { key: 'license-documents', kind: 'nav', label: 'מסמכי רישיון נהיגה', icon: 'id', tint: 'blue', badge: 'בתוקף', tone: 'muted' },
      { key: 'signing-documents', kind: 'nav', label: 'מסמכים לחתימה', icon: 'sign', tint: 'orange', badge: '2 ממתינים', tone: 'warn' },
      { key: 'general-documents', kind: 'nav', label: 'מסמכים כלליים', icon: 'doc', tint: 'gray' },
      { key: 'traffic-info-documents', kind: 'nav', label: 'מסמכי מידע תעבורתי', icon: 'info', tint: 'teal' },
    ],
  },
  {
    title: 'תיק נהג ותקשורת',
    rows: [
      { key: 'driver-file', kind: 'nav', label: 'תיק נהג', icon: 'folder', tint: 'teal' },
      { key: 'notes-comments', kind: 'nav', label: 'הערות ותגובות', icon: 'chat', tint: 'purple' },
      { key: 'traffic-reports', kind: 'nav', label: 'דוחות תעבורה', icon: 'alert', tint: 'red' },
      { key: 'companion-drivers', kind: 'nav', label: 'נהגים נלווים', icon: 'users', tint: 'blue' },
    ],
  },
  {
    title: 'בטיחות והדרכות',
    rows: [
      { key: 'procedure-6', kind: 'nav', label: 'נוהל 6', icon: 'shield', tint: 'green' },
      { key: 'certifications', kind: 'nav', label: 'הסמכות והכשרות', icon: 'award', tint: 'orange' },
      { key: 'hazmat', kind: 'nav', label: 'חומרים מסוכנים', icon: 'hazard', tint: 'red' },
      { key: 'training', kind: 'nav', label: 'הדרכות והכשרות', icon: 'cap', tint: 'indigo' },
    ],
  },
  {
    title: 'ניהול החשבון',
    rows: [
      { key: 'reset-driver-password', kind: 'nav', label: 'איפוס סיסמה לנהג', icon: 'key', tint: 'orange' },
    ],
  },
];

export const DRIVER_CARD_QUICK_ACTIONS: { key: 'call' | 'message' | 'assigned-vehicle'; label: string; icon: DriverCardIconKey; tint: DriverCardTint }[] = [
  { key: 'call', label: 'התקשר', icon: 'phone', tint: 'green' },
  { key: 'message', label: 'הודעה', icon: 'message', tint: 'blue' },
  { key: 'assigned-vehicle', label: 'רכב משויך', icon: 'car', tint: 'indigo' },
];
