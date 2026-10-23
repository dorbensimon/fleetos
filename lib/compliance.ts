// תוקף מסמכים: חישוב תאריכים, מצב (תקין/בקרוב/פג), והרשימה של מה עוקבים
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

// המסמך שקובע את התוקף של התיקייה
/**
 * A dated folder works like a stack ordered by the expiry entered on each
 * document: the latest expiry is the current one, whatever order the files
 * were uploaded in. Undated files rank below dated ones, newest first.
 */
export function governingDocument<T extends { expiry_date: string | null; created_at: string }>(docs: T[]): T | null {
  return docs.reduce<T | null>((best, doc) => {
    if (!best) return doc;
    const a = doc.expiry_date ?? '';
    const b = best.expiry_date ?? '';
    if (a !== b) return a > b ? doc : best;
    return doc.created_at > best.created_at ? doc : best;
  }, null);
}

// התאריכים שהתיקייה צריכה לשמור לפי המסמכים שבה
/**
 * Dated vehicle folders take their dates from their documents only: no
 * document, no date. The last-test date has no field of its own, so it is
 * kept while documents remain and cleared with the last one.
 */
export function documentDrivenDates<T extends { expiry_date: string | null; created_at: string }>(
  folderDocs: T[],
  current: Pick<ComplianceItem, 'last_date'> | null | undefined
): { expiryDate: string | null; lastDate: string | null } {
  if (!folderDocs.length) return { expiryDate: null, lastDate: null };
  return { expiryDate: governingDocument(folderDocs)?.expiry_date ?? null, lastDate: current?.last_date ?? null };
}

// יום אחד במילישניות
const DAY_MS = 86_400_000;

// הופך תאריך לפורמט שנה-חודש-יום
function toIsoDate(date: Date): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// מוסיף ימים לתאריך
function addDays(value: string, days: number): string {
  const date = parseDateValue(value);
  date.setHours(12, 0, 0, 0);
  date.setTime(date.getTime() + days * DAY_MS);
  return toIsoDate(date);
}

// התאריך שעד אליו הפריט בתוקף
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

// המצב של הפריט: תקין, בקרוב, פג או חסר
export function complianceBadgeState(
  def: ComplianceItemDef,
  item: ComplianceItem | null | undefined
): ExpiryState {
  const targetDate = complianceTargetDate(def, item);
  if (targetDate) return expiryState(targetDate);
  if (def.tracksLastDate && item?.last_date) return 'optional';
  return 'missing';
}

// הטקסט שמוצג למצב
export function complianceBadgeLabel(
  def: ComplianceItemDef,
  item: ComplianceItem | null | undefined
): string {
  if (item?.expiry_date) return formatDate(item.expiry_date);
  if (def.tracksLastDate && item?.last_date) return formatDate(item.last_date);
  return t('status.missing');
}

// כמה ימים נשארו עד שיפוג
export function complianceRemainingDays(
  def: ComplianceItemDef,
  item: ComplianceItem | null | undefined
): number | null {
  const targetDate = complianceTargetDate(def, item);
  if (targetDate) return daysUntilExpiry(targetDate);
  if (def.tracksLastDate && item?.last_date) return Number.POSITIVE_INFINITY;
  return null;
}

// שמות הקטגוריות
export const CATEGORY_LABELS: Record<ComplianceCategory, string> = {
  get licensing() { return t('common.licensing'); },
  get insurance() { return t('compliance.cat.insurance'); },
  get inspection() { return t('compliance.cat.inspection'); },
  get training() { return t('compliance.cat.training'); },
  get health() { return t('compliance.cat.health'); },
  get general() { return t('folder.generalDocs'); },
};

// אייקון לכל קטגוריה
/** Ionicons name per category — no emoji anywhere in the UI. */
export const CATEGORY_ICONS: Record<ComplianceCategory, string> = {
  licensing: 'document-text-outline',
  insurance: 'shield-checkmark-outline',
  inspection: 'construct-outline',
  training: 'school-outline',
  health: 'heart-outline',
  general: 'folder-open-outline',
};

// הפריטים שעוקבים אחריהם ברכב
export const VEHICLE_COMPLIANCE: ComplianceItemDef[] = [
  { itemType: 'vehicle_license', category: 'licensing', storedTitle: 'רישיון רכב', get label() { return t('folder.vehicleLicense'); }, requiresExpiryOnUpload: true },
  { itemType: 'operating_license', category: 'licensing', storedTitle: 'רישיון הפעלה', get label() { return t('folder.operatingLicense'); }, requiresExpiryOnUpload: true },

  { itemType: 'insurance_mandatory', category: 'insurance', storedTitle: 'ביטוח חובה', get label() { return t('folder.mandatoryInsurance'); }, requiresExpiryOnUpload: true },
  { itemType: 'insurance_comprehensive', category: 'insurance', storedTitle: 'ביטוח מקיף', get label() { return t('folder.comprehensiveInsurance'); }, requiresExpiryOnUpload: true },

  { itemType: 'annual_test', category: 'inspection', storedTitle: 'טסט שנתי', get label() { return t('folder.annualTest'); }, tracksLastDate: true, validityDays: 365, requiresExpiryOnUpload: true },

  { itemType: 'engineer_report', category: 'inspection', storedTitle: 'מסמך תסקיר מהנדס', get label() { return t('folder.engineerReport'); }, requiresExpiryOnUpload: true },
];

// פריטי רכב ישנים שכבר לא מוצגים
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

// האם פריט רכב הוא מהסוג הישן
export function isRetiredVehicleComplianceItem(itemType: string): boolean {
  return RETIRED_VEHICLE_COMPLIANCE_ITEM_TYPES.has(itemType);
}

// הפריטים שעוקבים אחריהם בנהג
export const DRIVER_COMPLIANCE: ComplianceItemDef[] = [
  { itemType: 'health_declaration', category: 'health', storedTitle: 'הצהרת בריאות', get label() { return t('compliance.item.healthDeclaration'); } },

  { itemType: 'periodic_training', category: 'training', storedTitle: 'הדרכות תקופתיות', get label() { return t('compliance.item.periodicTraining'); }, tracksLastDate: true, validityDays: 365 },
  { itemType: 'procedure_6', category: 'training', storedTitle: 'נוהל 6 (הסעת ילדים)', get label() { return t('compliance.item.procedure6'); } },
  { itemType: 'crane_license', category: 'training', storedTitle: 'רישיון מנוף', get label() { return t('compliance.item.craneLicense'); } },
  { itemType: 'rp_certificate', category: 'training', storedTitle: 'תוקף ר.פ', get label() { return t('compliance.item.publicServiceLicense'); } },
];

// רשימת הפריטים לרכב או לנהג
export function complianceCatalog(ownerType: 'vehicle' | 'driver'): ComplianceItemDef[] {
  return ownerType === 'vehicle' ? VEHICLE_COMPLIANCE : DRIVER_COMPLIANCE;
}

// מוצא את ההגדרה של פריט
export function findComplianceDef(
  ownerType: 'vehicle' | 'driver',
  itemType: string
): ComplianceItemDef | undefined {
  return complianceCatalog(ownerType).find((d) => d.itemType === itemType);
}

// מקבץ פריטים לפי קטגוריה
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

// שמות סוגי רכב
// the order here is the order of every vehicle-type list (passenger, cargo, work equipment, other)
export const VEHICLE_TYPE_LABELS: Record<string, string> = {
  get car() { return t('vehicle.type.car'); },
  get dual_use() { return t('vehicle.type.dual_use'); },
  get taxi() { return t('vehicle.type.taxi'); },
  get minibus() { return t('vehicle.type.minibus'); },
  get passenger_minibus() { return t('vehicle.type.passenger_minibus'); },
  get microbus() { return t('vehicle.type.microbus'); },
  get small_bus() { return t('vehicle.type.small_bus'); },
  get bus() { return t('vehicle.type.bus'); },
  get touring_bus() { return t('vehicle.type.touring_bus'); },
  get truck() { return t('vehicle.type.truck'); },
  get tractor_truck() { return t('vehicle.type.tractor_truck'); },
  get tanker() { return t('vehicle.type.tanker'); },
  get trailer() { return t('vehicle.type.trailer'); },
  get tractor() { return t('vehicle.type.tractor'); },
  get atv() { return t('vehicle.type.atv'); },
  get engineering() { return t('vehicle.type.engineering'); },
  get forklift() { return t('vehicle.type.forklift'); },
  get pedestrian_forklift() { return t('vehicle.type.pedestrian_forklift'); },
  get operational() { return t('vehicle.type.operational'); },
  get motorcycle() { return t('vehicle.type.motorcycle'); },
  get golf_cart() { return t('vehicle.type.golf_cart'); },
};

// שמות מצבי רכב
export const VEHICLE_STATUS_LABELS: Record<string, string> = {
  get active() { return t('vehicle.status.active'); },
  get maintenance() { return t('vehicle.status.maintenance'); },
  get disabled() { return t('vehicle.status.disabled'); },
  get archived() { return t('common.archived'); },
};

// שמות סוגי רכישה (קנייה/ליסינג/השכרה)
export const ACQUISITION_TYPE_LABELS: Record<string, string> = {
  get purchase() { return t('vehicle.ownership.purchase'); },
  get leasing() { return t('vehicle.ownership.leasing'); },
  get rental() { return t('vehicle.ownership.rental'); },
};

// ציוד נלווה ברכב, לפי סדר ההצגה
export const VEHICLE_ACCESSORY_LABELS: Record<string, string> = {
  get warning_triangle() { return t('vehicle.accessory.warningTriangle'); },
  get spare_wheel() { return t('vehicle.accessory.spareWheel'); },
  get jack() { return t('vehicle.accessory.jack'); },
  get lug_wrench() { return t('vehicle.accessory.lugWrench'); },
  get wheel_lock_key() { return t('vehicle.accessory.wheelLockKey'); },
  get tire_repair_kit() { return t('vehicle.accessory.tireRepairKit'); },
  get toolbox() { return t('vehicle.accessory.toolbox'); },
  get screwdrivers() { return t('vehicle.accessory.screwdrivers'); },
  get tow_hitch() { return t('vehicle.accessory.towHitch'); },
};
