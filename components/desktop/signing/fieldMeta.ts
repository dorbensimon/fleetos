import type { Ionicons } from '@expo/vector-icons';
import type { SigningFieldKind } from '../../../lib/companySigningTemplates';

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
  signature: { label: 'חתימה', hint: 'הנהג יחתום כאן', icon: 'create', color: '#0088CC', size: { w: 0.26, h: 0.065 } },
  date: { label: 'תאריך', hint: 'הנהג יבחר תאריך', icon: 'calendar', color: '#FF9500', size: { w: 0.17, h: 0.032 } },
  checkbox: { label: 'תיבת סימון', hint: 'הנהג יסמן ✓', icon: 'checkbox', color: '#34C759', size: { w: 0.03, h: 0.021 } },
  text: { label: 'שורת טקסט', hint: 'הנהג יכתוב כאן', icon: 'text', color: '#5856D6', size: { w: 0.26, h: 0.032 } },
  driver_full_name: { label: 'שם הנהג', hint: 'יתמלא אוטומטית', icon: 'person', color: '#0E9FAF', auto: true, size: { w: 0.24, h: 0.032 } },
  driver_national_id: { label: 'תעודת זהות', hint: 'יתמלא אוטומטית', icon: 'id-card', color: '#0E9FAF', auto: true, size: { w: 0.2, h: 0.032 } },
  driver_phone: { label: 'טלפון הנהג', hint: 'יתמלא אוטומטית', icon: 'call', color: '#0E9FAF', auto: true, size: { w: 0.2, h: 0.032 } },
  driver_license_number: { label: 'מספר רישיון', hint: 'יתמלא אוטומטית', icon: 'card', color: '#0E9FAF', auto: true, size: { w: 0.2, h: 0.032 } },
  company_name: { label: 'שם החברה', hint: 'יתמלא אוטומטית', icon: 'business', color: '#0E9FAF', auto: true, size: { w: 0.24, h: 0.032 } },
};

export const DRIVER_FIELDS: SigningFieldKind[] = ['signature', 'date', 'checkbox', 'text'];
export const AUTO_FIELDS: SigningFieldKind[] = ['driver_full_name', 'driver_national_id', 'driver_phone', 'driver_license_number', 'company_name'];
