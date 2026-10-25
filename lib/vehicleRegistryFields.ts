// שדות נוספים ממשרד התחבורה
import { t } from './i18n';

export type RegistryDetails = Record<string, string>;
export type RegistryFieldKind = 'text' | 'number' | 'date';

/**
 * The registry values kept in `vehicles.registry_details`, in display order.
 * Keys match what lookup-vehicle-registry returns. All are free to edit or
 * clear by the company's managers.
 */
export const REGISTRY_DETAIL_FIELDS: { key: string; kind: RegistryFieldKind; ltr?: boolean; readonly label: string }[] = [
  { key: 'registry_kind', kind: 'text', get label() { return t('registry.field.registry_kind'); } },
  { key: 'trim_level', kind: 'text', ltr: true, get label() { return t('registry.field.trim_level'); } },
  { key: 'model_code', kind: 'text', ltr: true, get label() { return t('registry.field.model_code'); } },
  { key: 'origin_country', kind: 'text', get label() { return t('registry.field.origin_country'); } },
  { key: 'fuel_type', kind: 'text', get label() { return t('registry.field.fuel_type'); } },
  { key: 'engine_model', kind: 'text', ltr: true, get label() { return t('registry.field.engine_model'); } },
  { key: 'engine_number', kind: 'text', ltr: true, get label() { return t('registry.field.engine_number'); } },
  { key: 'engine_volume_cc', kind: 'number', get label() { return t('registry.field.engine_volume_cc'); } },
  { key: 'drive_type', kind: 'text', ltr: true, get label() { return t('registry.field.drive_type'); } },
  { key: 'tires_front', kind: 'text', ltr: true, get label() { return t('registry.field.tires_front'); } },
  { key: 'tires_rear', kind: 'text', ltr: true, get label() { return t('registry.field.tires_rear'); } },
  { key: 'last_test_date', kind: 'date', get label() { return t('registry.field.last_test_date'); } },
  { key: 'seats', kind: 'number', get label() { return t('registry.field.seats'); } },
  { key: 'seats_beside_driver', kind: 'number', get label() { return t('registry.field.seats_beside_driver'); } },
  { key: 'gross_weight_kg', kind: 'number', get label() { return t('registry.field.gross_weight_kg'); } },
  { key: 'curb_weight_kg', kind: 'number', get label() { return t('registry.field.curb_weight_kg'); } },
  { key: 'lift_weight_kg', kind: 'number', get label() { return t('registry.field.lift_weight_kg'); } },
  { key: 'tow_hitch', kind: 'text', get label() { return t('registry.field.tow_hitch'); } },
  { key: 'eu_category', kind: 'text', ltr: true, get label() { return t('registry.field.eu_category'); } },
  { key: 'ownership', kind: 'text', get label() { return t('registry.field.ownership'); } },
  { key: 'pollution_group', kind: 'number', get label() { return t('registry.field.pollution_group'); } },
  { key: 'safety_level', kind: 'number', get label() { return t('registry.field.safety_level'); } },
];

/** Only the known keys with a non-empty value, trimmed. */
export function cleanRegistryDetails(details: unknown): RegistryDetails {
  const out: RegistryDetails = {};
  if (!details || typeof details !== 'object') return out;
  for (const { key } of REGISTRY_DETAIL_FIELDS) {
    const value = (details as Record<string, unknown>)[key];
    if (value != null && String(value).trim()) out[key] = String(value).trim();
  }
  return out;
}
