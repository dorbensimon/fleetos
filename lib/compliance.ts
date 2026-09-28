import type { ComplianceItem } from './adminApi';
import { daysUntilExpiry, expiryState, ExpiryState, formatDate, parseDateValue } from './theme';
import { t } from './i18n';

/**
 * The catalogue of tracked expiry items ("compliance items").
 *
 * This is what makes the grouped document UI work: insurance is ONE
 * section in the UI that contains two separate items (mandatory and
 * comprehensive), each with its own expiry date and its own file.
 *
 * Where dates live:
 *   - Identity data stays on the record itself (a vehicle's plate/VIN,
 *     a driver's licence number and classes).
 *   - Anything that expires and has a document behind it lives here.
 *
 * One deliberate exception: a driver's licence expiry sits on
 * `driver_details` next to the licence number and classes, because for
 * a person the licence is a core attribute rather than one document
 * category among many. For a vehicle, licensing IS just one category.
 */

export type ComplianceCategory =
  | 'licensing'
  | 'insurance'
  | 'inspection'
  | 'training'
  | 'health'
  | 'general';

export interface ComplianceItemDef {
  itemType: string;
  category: ComplianceCategory;
  label: string;
  /**
   * The title its documents are saved under and found by. It is stored data,
   * so it stays the same whatever the UI language is.
   */
  storedTitle: string;
  /** A new supporting document cannot be uploaded without its own expiry date. */
  requiresExpiryOnUpload?: boolean;
  /** Some items also record when the last check happened, not just the next one. */
  tracksLastDate?: boolean;
  /** When no explicit next date was entered, derive validity from the last check date. */
  validityDays?: number;
}

const DAY_MS = 86_400_000;

function toIsoDate(date: Date): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(value: string, days: number): string {
  const date = parseDateValue(value);
  date.setHours(12, 0, 0, 0);
  date.setTime(date.getTime() + days * DAY_MS);
  return toIsoDate(date);
}

export function complianceTargetDate(
  def: ComplianceItemDef,
  item: ComplianceItem | null | undefined
): string | null {
  if (item?.expiry_date) return item.expiry_date;
  if (def.tracksLastDate && def.validityDays && item?.last_date) {
    return addDays(item.last_date, def.validityDays);
  }
  return null;
}

export function complianceBadgeState(
  def: ComplianceItemDef,
  item: ComplianceItem | null | undefined
): ExpiryState {
  const targetDate = complianceTargetDate(def, item);
  if (targetDate) return expiryState(targetDate);
  if (def.tracksLastDate && item?.last_date) return 'optional';
  return 'missing';
}

export function complianceBadgeLabel(
  def: ComplianceItemDef,
  item: ComplianceItem | null | undefined
): string {
  if (item?.expiry_date) return formatDate(item.expiry_date);
  if (def.tracksLastDate && item?.last_date) return formatDate(item.last_date);
  return t('status.missing');
}

export function complianceRemainingDays(
  def: ComplianceItemDef,
  item: ComplianceItem | null | undefined
): number | null {
  const targetDate = complianceTargetDate(def, item);
  if (targetDate) return daysUntilExpiry(targetDate);
  if (def.tracksLastDate && item?.last_date) return Number.POSITIVE_INFINITY;
  return null;
}

export const CATEGORY_LABELS: Record<ComplianceCategory, string> = {
  get licensing() { return t('common.licensing'); },
  get insurance() { return t('compliance.cat.insurance'); },
  get inspection() { return t('compliance.cat.inspection'); },
  get training() { return t('compliance.cat.training'); },
  get health() { return t('compliance.cat.health'); },
  get general() { return t('folder.generalDocs'); },
};

/** Ionicons name per category — no emoji anywhere in the UI. */
export const CATEGORY_ICONS: Record<ComplianceCategory, string> = {
  licensing: 'document-text-outline',
  insurance: 'shield-checkmark-outline',
  inspection: 'construct-outline',
  training: 'school-outline',
  health: 'heart-outline',
  general: 'folder-open-outline',
};

export const VEHICLE_COMPLIANCE: ComplianceItemDef[] = [
  { itemType: 'vehicle_license', category: 'licensing', storedTitle: 'רישיון רכב', get label() { return t('folder.vehicleLicense'); }, requiresExpiryOnUpload: true },
  { itemType: 'operating_license', category: 'licensing', storedTitle: 'רישיון הפעלה', get label() { return t('folder.operatingLicense'); }, requiresExpiryOnUpload: true },

  { itemType: 'insurance_mandatory', category: 'insurance', storedTitle: 'ביטוח חובה', get label() { return t('folder.mandatoryInsurance'); }, requiresExpiryOnUpload: true },
  { itemType: 'insurance_comprehensive', category: 'insurance', storedTitle: 'ביטוח מקיף', get label() { return t('folder.comprehensiveInsurance'); }, requiresExpiryOnUpload: true },

  { itemType: 'annual_test', category: 'inspection', storedTitle: 'טסט שנתי', get label() { return t('folder.annualTest'); }, tracksLastDate: true, validityDays: 365, requiresExpiryOnUpload: true },
];

/**
 * These categories were superseded by the vehicle document folders above.
 * Existing database rows are deliberately retained, but must not reappear in
 * vehicle-facing summaries as a second representation of the same document.
 */
const RETIRED_VEHICLE_COMPLIANCE_ITEM_TYPES = new Set([
  'brakes_semiannual',
  'winter_check',
  'child_detection',
  'tachograph',
  'safety_officer',
]);

export function isRetiredVehicleComplianceItem(itemType: string): boolean {
  return RETIRED_VEHICLE_COMPLIANCE_ITEM_TYPES.has(itemType);
}

export const DRIVER_COMPLIANCE: ComplianceItemDef[] = [
  { itemType: 'health_declaration', category: 'health', storedTitle: 'הצהרת בריאות', get label() { return t('compliance.item.healthDeclaration'); } },

  { itemType: 'periodic_training', category: 'training', storedTitle: 'הדרכות תקופתיות', get label() { return t('compliance.item.periodicTraining'); }, tracksLastDate: true, validityDays: 365 },
  { itemType: 'procedure_6', category: 'training', storedTitle: 'נוהל 6 (הסעת ילדים)', get label() { return t('compliance.item.procedure6'); } },
  { itemType: 'crane_license', category: 'training', storedTitle: 'רישיון מנוף', get label() { return t('compliance.item.craneLicense'); } },
  { itemType: 'rp_certificate', category: 'training', storedTitle: 'תוקף ר.פ', get label() { return t('compliance.item.publicServiceLicense'); } },
];

export function complianceCatalog(ownerType: 'vehicle' | 'driver'): ComplianceItemDef[] {
  return ownerType === 'vehicle' ? VEHICLE_COMPLIANCE : DRIVER_COMPLIANCE;
}

export function findComplianceDef(
  ownerType: 'vehicle' | 'driver',
  itemType: string
): ComplianceItemDef | undefined {
  return complianceCatalog(ownerType).find((d) => d.itemType === itemType);
}

/** Groups a catalogue into the sections the detail screens render. */
export function groupByCategory(defs: ComplianceItemDef[]) {
  const order: ComplianceCategory[] = [
    'licensing',
    'insurance',
    'inspection',
    'health',
    'training',
    'general',
  ];
  const groups = new Map<ComplianceCategory, ComplianceItemDef[]>();
  for (const def of defs) {
    const list = groups.get(def.category) ?? [];
    list.push(def);
    groups.set(def.category, list);
  }
  return order
    .filter((c) => groups.has(c))
    .map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      icon: CATEGORY_ICONS[category],
      items: groups.get(category)!,
    }));
}

export const VEHICLE_TYPE_LABELS: Record<string, string> = {
  get car() { return t('vehicle.type.car'); },
  get minibus() { return t('vehicle.type.minibus'); },
  get bus() { return t('vehicle.type.bus'); },
  get truck() { return t('vehicle.type.truck'); },
};

export const VEHICLE_STATUS_LABELS: Record<string, string> = {
  get active() { return t('vehicle.status.active'); },
  get maintenance() { return t('vehicle.status.maintenance'); },
  get disabled() { return t('vehicle.status.disabled'); },
  get archived() { return t('common.archived'); },
};

export const ACQUISITION_TYPE_LABELS: Record<string, string> = {
  get purchase() { return t('vehicle.ownership.purchase'); },
  get leasing() { return t('vehicle.ownership.leasing'); },
  get rental() { return t('vehicle.ownership.rental'); },
};
