import type { Ionicons } from '@expo/vector-icons';
import type { SigningFieldKind } from '../../../lib/companySigningTemplates';
import { t } from '../../../lib/i18n';

export type FieldMeta = {
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  /** Filled in by the system from the driver's file; the driver only sees it. */
  auto?: boolean;
  /** Default size as fractions of a portrait A4 page. */
  size: { w: number; h: number };
};

export const FIELD_META: Record<SigningFieldKind, FieldMeta> = {
  signature: { get label() { return t('field.signature'); }, get hint() { return t('field.signatureHint'); }, icon: 'create', color: '#0088CC', size: { w: 0.26, h: 0.065 } },
  date: { get label() { return t('field.date'); }, get hint() { return t('field.dateHint'); }, icon: 'calendar', color: '#FF9500', size: { w: 0.17, h: 0.032 } },
  checkbox: { get label() { return t('field.checkbox'); }, get hint() { return t('field.checkboxHint'); }, icon: 'checkbox', color: '#34C759', size: { w: 0.03, h: 0.021 } },
  text: { get label() { return t('field.textLine'); }, get hint() { return t('field.textLineHint'); }, icon: 'text', color: '#5856D6', size: { w: 0.26, h: 0.032 } },
  driver_full_name: { get label() { return t('field.driverName'); }, get hint() { return t('field.autoFilled'); }, icon: 'person', color: '#0E9FAF', auto: true, size: { w: 0.24, h: 0.032 } },
  driver_national_id: { get label() { return t('field.nationalId'); }, get hint() { return t('field.autoFilled'); }, icon: 'id-card', color: '#0E9FAF', auto: true, size: { w: 0.2, h: 0.032 } },
  driver_phone: { get label() { return t('field.driverPhone'); }, get hint() { return t('field.autoFilled'); }, icon: 'call', color: '#0E9FAF', auto: true, size: { w: 0.2, h: 0.032 } },
  driver_license_number: { get label() { return t('field.licenseNumber'); }, get hint() { return t('field.autoFilled'); }, icon: 'card', color: '#0E9FAF', auto: true, size: { w: 0.2, h: 0.032 } },
  company_name: { get label() { return t('company.name'); }, get hint() { return t('field.autoFilled'); }, icon: 'business', color: '#0E9FAF', auto: true, size: { w: 0.24, h: 0.032 } },
};

export const DRIVER_FIELDS: SigningFieldKind[] = ['signature', 'date', 'checkbox', 'text'];
export const AUTO_FIELDS: SigningFieldKind[] = ['driver_full_name', 'driver_national_id', 'driver_phone', 'driver_license_number', 'company_name'];
