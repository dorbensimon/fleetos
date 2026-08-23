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
  /** Some items also record when the last check happened, not just the next one. */
  tracksLastDate?: boolean;
}

export const CATEGORY_LABELS: Record<ComplianceCategory, string> = {
  licensing: 'רישוי',
  insurance: 'ביטוחים',
  inspection: 'בדיקות ובטיחות',
  training: 'הכשרות והסמכות',
  health: 'בריאות',
  general: 'מסמכים כלליים',
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
  { itemType: 'vehicle_license', category: 'licensing', label: 'רישיון רכב' },
  { itemType: 'operating_license', category: 'licensing', label: 'רישיון הפעלה' },

  { itemType: 'insurance_mandatory', category: 'insurance', label: 'ביטוח חובה' },
  { itemType: 'insurance_comprehensive', category: 'insurance', label: 'ביטוח מקיף' },

  { itemType: 'annual_test', category: 'inspection', label: 'טסט שנתי', tracksLastDate: true },
  { itemType: 'brakes_semiannual', category: 'inspection', label: 'בדיקת בלמים חצי-שנתית', tracksLastDate: true },
  { itemType: 'winter_check', category: 'inspection', label: 'בדיקת חורף', tracksLastDate: true },
  { itemType: 'child_detection', category: 'inspection', label: 'בדיקת שכחת ילדים', tracksLastDate: true },
  { itemType: 'tachograph', category: 'inspection', label: 'טכוגרף' },
  { itemType: 'safety_officer', category: 'inspection', label: 'ביקורת קצב״ת', tracksLastDate: true },
];

export const DRIVER_COMPLIANCE: ComplianceItemDef[] = [
  { itemType: 'health_declaration', category: 'health', label: 'הצהרת בריאות' },

  { itemType: 'periodic_training', category: 'training', label: 'הדרכות תקופתיות', tracksLastDate: true },
  { itemType: 'procedure_6', category: 'training', label: 'נוהל 6 (הסעת ילדים)' },
  { itemType: 'crane_license', category: 'training', label: 'רישיון מנוף' },
  { itemType: 'rp_certificate', category: 'training', label: 'תוקף ר.פ' },
];

/** The few vehicle items whose badges appear in the vehicle list (A2). */
export const VEHICLE_LIST_BADGES = ['insurance_mandatory', 'annual_test'] as const;

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
  car: 'פרטי',
  minibus: 'מיניבוס',
  bus: 'אוטובוס',
  truck: 'משאית',
};

export const VEHICLE_STATUS_LABELS: Record<string, string> = {
  active: 'פעיל',
  maintenance: 'בטיפול',
  disabled: 'מושבת',
  archived: 'בארכיון',
};

/** Israeli driving licence classes, for the driver form. */
export const LICENSE_CLASSES = ['A', 'A1', 'A2', 'B', 'C', 'C1', 'C3', 'D', 'D1', 'D2', 'D3', 'E'];
