import type { DriverCardBadgeTone, DriverCardTint } from './driverCardTheme';
import { t } from '../../lib/i18n';

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
  | 'reset-driver-password'
  | 'export-driver-report';

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
    get title() { return t('driverCard.contactAndVehicle'); },
    rows: [
      { key: 'phone', kind: 'value', get label() { return t('common.phone'); }, icon: 'phone', tint: 'green', value: '050-0001101', ltr: true, pressable: true },
      { key: 'email', kind: 'value', get label() { return t('common.emailAddress'); }, icon: 'message', tint: 'blue', value: '—', ltr: true, pressable: true },
      { key: 'national-id', kind: 'value', get label() { return t('field.nationalIdShort'); }, icon: 'id', tint: 'gray', value: '204•••118', ltr: true },
    ],
  },
  {
    get title() { return t('driverCard.documentsAndLicensing'); },
    rows: [
      { key: 'license-documents', kind: 'nav', get label() { return t('license.documents'); }, icon: 'id', tint: 'blue', get badge() { return t('status.valid'); }, tone: 'muted' },
      { key: 'signing-documents', kind: 'nav', get label() { return t('nav.signingDocuments'); }, icon: 'sign', tint: 'orange', get badge() { return t('driverCard.twoPending'); }, tone: 'warn' },
      { key: 'general-documents', kind: 'nav', get label() { return t('folder.generalDocs'); }, icon: 'doc', tint: 'gray' },
      { key: 'traffic-info-documents', kind: 'nav', get label() { return t('folder.trafficInfoDocs'); }, icon: 'info', tint: 'teal' },
    ],
  },
  {
    get title() { return t('driverCard.fileAndCommunication'); },
    rows: [
      { key: 'driver-file', kind: 'nav', get label() { return t('folder.driverFile'); }, icon: 'folder', tint: 'teal' },
      { key: 'notes-comments', kind: 'nav', get label() { return t('folder.notesAndResponses'); }, icon: 'chat', tint: 'purple' },
      { key: 'traffic-reports', kind: 'nav', get label() { return t('folder.trafficReports'); }, icon: 'alert', tint: 'red' },
      { key: 'companion-drivers', kind: 'nav', get label() { return t('folder.companionDrivers'); }, icon: 'users', tint: 'blue' },
    ],
  },
  {
    get title() { return t('folder.safetyAndTraining'); },
    rows: [
      { key: 'procedure-6', kind: 'nav', get label() { return t('folder.procedure6'); }, icon: 'shield', tint: 'green' },
      { key: 'certifications', kind: 'nav', get label() { return t('folder.certifications'); }, icon: 'award', tint: 'orange' },
      { key: 'hazmat', kind: 'nav', get label() { return t('folder.hazmat'); }, icon: 'hazard', tint: 'red' },
      { key: 'training', kind: 'nav', get label() { return t('folder.trainings'); }, icon: 'cap', tint: 'indigo' },
    ],
  },
  {
    get title() { return t('reports.title'); },
    rows: [
      { key: 'export-driver-report', kind: 'nav', get label() { return t('driverCard.exportSnapshot'); }, icon: 'doc', tint: 'blue' },
    ],
  },
  {
    get title() { return t('driverCard.accountManagement'); },
    rows: [
      { key: 'reset-driver-password', kind: 'nav', get label() { return t('driverCard.resetPassword'); }, icon: 'key', tint: 'orange' },
    ],
  },
];

/** The document folder each driver-card row opens — the same for the manager and the driver. */
export const DOCUMENT_CATEGORY_BY_ROW: Partial<Record<DriverCardRow['key'], string>> = {
  'general-documents': 'general',
  'traffic-info-documents': 'transport_info',
  'driver-file': 'driver_file',
  'notes-comments': 'notes_feedback',
  'traffic-reports': 'traffic_reports',
  'companion-drivers': 'accompanying_drivers',
  'procedure-6': 'procedure_6',
  certifications: 'certifications',
  hazmat: 'hazmat',
  training: 'trainings',
};
