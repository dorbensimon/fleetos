import type { ComplianceItem, Vehicle, VehicleDriverWithProfile } from './adminApi';
import { formatPlate } from './plate';
import { daysUntilExpiry, formatDate } from './theme';

/**
 * The vehicle problems behind the desktop "דורש טיפול" menu, grouped by
 * problem. Every item says what exactly is wrong and where in the vehicle
 * page it gets fixed, so a click lands on the fix rather than the page top.
 * Driver licenses are left out: the dashboard's driver cards already cover them.
 */

export type VehicleAttentionKind = 'insurance' | 'registration' | 'unassigned';

export type VehicleAttentionItem = {
  vehicleId: string;
  plate: string;
  name: string;
  /** What is wrong, in plain words: "פג לפני 3 ימים · 12/09/2026". */
  detail: string;
  /** Where the fix is: a folder to open (lib/vehicleFolderAlerts.ts keys) or the drivers dialog. */
  target: { openFolder: string } | { openDrivers: true };
};

export type VehicleAttentionGroup = {
  kind: VehicleAttentionKind;
  title: string;
  /** The action one click performs, shown on each row. */
  action: string;
  tone: 'bad' | 'warn';
  items: VehicleAttentionItem[];
};

function vehicleName(vehicle: Vehicle): string {
  return [vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') || 'רכב ללא דגם';
}

/** "פג היום", "פג אתמול", "פג לפני 12 ימים" — then the date itself. */
function expiredWords(date: string): string {
  const days = Math.abs(daysUntilExpiry(date) ?? 0);
  const when = days === 0 ? 'פג היום' : days === 1 ? 'פג אתמול' : `פג לפני ${days} ימים`;
  return `${when} · ${formatDate(date)}`;
}

function expiryOf(compliance: ComplianceItem[] | undefined, itemType: string): string | null {
  return compliance?.find((c) => c.item_type === itemType)?.expiry_date ?? null;
}

export function vehicleAttentionGroups(
  vehicles: Vehicle[],
  compliance: Map<string, ComplianceItem[]>,
  vehicleDrivers: Map<string, VehicleDriverWithProfile[]>,
): VehicleAttentionGroup[] {
  const live = vehicles.filter((v) => v.status !== 'archived');
  const item = (v: Vehicle, detail: string, target: VehicleAttentionItem['target']): VehicleAttentionItem => ({
    vehicleId: v.id,
    plate: formatPlate(v.plate_number),
    name: vehicleName(v),
    detail,
    target,
  });

  const insurance: VehicleAttentionItem[] = [];
  const registration: VehicleAttentionItem[] = [];
  const unassigned: VehicleAttentionItem[] = [];
  for (const v of live) {
    const items = compliance.get(v.id);
    const insuranceExpiry = expiryOf(items, 'insurance_mandatory');
    const insuranceDays = daysUntilExpiry(insuranceExpiry);
    // Mandatory insurance is required by law: never entered counts as missing.
    if (insuranceDays == null) insurance.push(item(v, 'לא הוזן ביטוח חובה', { openFolder: 'insurance_mandatory' }));
    else if (insuranceDays < 0) insurance.push(item(v, expiredWords(insuranceExpiry!), { openFolder: 'insurance_mandatory' }));

    // Registration only once it lapsed: many fleets never enter it, and an empty folder isn't a fault.
    const registrationExpiry = expiryOf(items, 'vehicle_license');
    const registrationDays = daysUntilExpiry(registrationExpiry);
    if (registrationDays != null && registrationDays < 0) registration.push(item(v, expiredWords(registrationExpiry!), { openFolder: 'vehicle_license' }));

    if (!vehicleDrivers.get(v.id)?.length) unassigned.push(item(v, 'אין נהג משויך לרכב', { openDrivers: true }));
  }

  const groups: VehicleAttentionGroup[] = [
    { kind: 'insurance', title: 'ללא ביטוח חובה בתוקף', action: 'לביטוח', tone: 'bad', items: insurance },
    { kind: 'registration', title: 'רישיון רכב פג', action: 'לרישיון', tone: 'bad', items: registration },
    { kind: 'unassigned', title: 'רכבים ללא נהג', action: 'שיוך נהג', tone: 'warn', items: unassigned },
  ];
  return groups.filter((g) => g.items.length > 0);
}

/** Distinct vehicles and open problems — one vehicle can have several. */
export function vehicleAttentionTotals(groups: VehicleAttentionGroup[]): { vehicles: number; issues: number } {
  const vehicles = new Set(groups.flatMap((g) => g.items.map((i) => i.vehicleId)));
  return { vehicles: vehicles.size, issues: groups.reduce((sum, g) => sum + g.items.length, 0) };
}
