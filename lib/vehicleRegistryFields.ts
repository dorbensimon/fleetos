// שדות נוספים ממשרד התחבורה
import { t } from './i18n';
import { formatDate } from './theme';
import type { Vehicle } from './adminApi';
import type { VehicleRegistryDetails } from './vehicleRegistry';

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

// השוואה בין כרטיס הרכב לבין משרד התחבורה: מה ישתנה אם מעדכנים
/** One field where the ministry has a value that differs from the vehicle card. */
export interface RegistryChange {
  key: string;
  label: string;
  /** Shown in the window. */
  current: string;
  next: string;
  ltr?: boolean;
  /** Applied when the field is picked. */
  patch: Partial<Vehicle>;
}

type CoreField = { key: 'manufacturer' | 'model' | 'color' | 'production_year' | 'vin' | 'road_registration_date'; kind: RegistryFieldKind; ltr?: boolean; label: () => string; from: (f: VehicleRegistryDetails) => string | number | null | undefined };
const CORE_FIELDS: CoreField[] = [
  { key: 'manufacturer', kind: 'text', label: () => t('vehicle.manufacturer'), from: (f) => f.manufacturer },
  { key: 'model', kind: 'text', label: () => t('vehicle.model'), from: (f) => f.model },
  { key: 'production_year', kind: 'text', ltr: true, label: () => t('vehicle.productionYear'), from: (f) => f.productionYear },
  { key: 'color', kind: 'text', label: () => t('vehicle.color'), from: (f) => f.color },
  { key: 'vin', kind: 'text', ltr: true, label: () => t('vehicle.vin'), from: (f) => f.vin },
  { key: 'road_registration_date', kind: 'date', ltr: true, label: () => t('vehicle.onRoadDate'), from: (f) => f.roadRegistrationDate },
];

const show = (value: string, kind: RegistryFieldKind) =>
  !value ? '—' : kind === 'date' ? formatDate(value) : kind === 'number' ? Number(value).toLocaleString('he-IL') : value;
const same = (a: string, b: string, kind: RegistryFieldKind) =>
  kind === 'number' ? Number(a) === Number(b) : a.trim().toUpperCase() === b.trim().toUpperCase();

/**
 * Fields the ministry would change. A field the ministry has no value for is
 * left out, so an update never blanks what the company entered.
 */
export function registryChanges(vehicle: Vehicle, found: VehicleRegistryDetails): RegistryChange[] {
  const changes: RegistryChange[] = [];
  for (const f of CORE_FIELDS) {
    const raw = f.from(found);
    const next = raw == null ? '' : String(raw).trim();
    const current = vehicle[f.key] == null ? '' : String(vehicle[f.key]).trim();
    if (!next || same(current, next, f.kind)) continue;
    const value = f.key === 'production_year' ? Number(next) : next;
    changes.push({ key: f.key, label: f.label(), current: show(current, f.kind), next: show(next, f.kind), ltr: f.ltr, patch: { [f.key]: value } as Partial<Vehicle> });
  }
  const currentDetails = cleanRegistryDetails(vehicle.registry_details);
  const nextDetails = cleanRegistryDetails(found.details);
  for (const f of REGISTRY_DETAIL_FIELDS) {
    const next = nextDetails[f.key] ?? '';
    const current = currentDetails[f.key] ?? '';
    if (!next || same(current, next, f.kind)) continue;
    changes.push({ key: f.key, label: f.label, current: show(current, f.kind), next: show(next, f.kind), ltr: f.ltr || f.kind === 'number', patch: { registry_details: { [f.key]: next } } });
  }
  return changes;
}

/** The one update for the picked changes; registry values merge into what the vehicle already has. */
export function registryPatch(vehicle: Vehicle, picked: RegistryChange[]): Partial<Vehicle> {
  const patch: Partial<Vehicle> = {};
  let details: RegistryDetails | null = null;
  for (const change of picked) {
    if (change.patch.registry_details) details = { ...(details ?? cleanRegistryDetails(vehicle.registry_details)), ...change.patch.registry_details };
    else Object.assign(patch, change.patch);
  }
  if (details) patch.registry_details = details;
  return patch;
}
