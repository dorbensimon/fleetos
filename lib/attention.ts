// 'דורש טיפול': רשימה אחת לכל המערכת (טלפון, מחשב ומסוף הבעלים)
import type { ComplianceItem, DriverRow, Vehicle, VehicleDriverWithProfile } from './adminApi/types';
import { LICENSE_SIDE_STORED_TITLE } from './licenseSides';
import { formatPlate } from './plate';
import { daysUntilExpiry, formatDate } from './theme';
import { t } from './i18n';

/**
 * The one "דורש טיפול" list: the phone screen, the phone home line and the
 * desktop top-bar menu all show these groups, and the owner console counts
 * them. Only what blocks work today: mandatory insurance, a lapsed vehicle
 * licence, driving licences, unverified licence photos and vehicles with no
 * driver. Every other date lives in "תוקפים" (lib/validityList.ts).
 * Every item says what is wrong and opens the exact spot that fixes it.
 */

export type AttentionKind = 'insurance' | 'registration' | 'license' | 'licenseDocs' | 'unassigned';

export type AttentionTarget =
  | { openFolder: string }
  | { openDrivers: true }
  | { driverLicense: true }
  | { licenseDocs: true };

export type AttentionItem = {
  ownerType: 'vehicle' | 'driver';
  ownerId: string;
  /** The plate, or the driver's name. */
  title: string;
  /** Make and model; empty for drivers. */
  name: string;
  /** What is wrong, in plain words: "פג לפני 3 ימים · 12/09/2026". */
  detail: string;
  tone: 'bad' | 'warn';
  target: AttentionTarget;
};

export type AttentionGroup = {
  kind: AttentionKind;
  title: string;
  hint: string;
  /** The action one click performs, shown on each row. */
  action: string;
  tone: 'bad' | 'warn';
  items: AttentionItem[];
};

// שם הרכב (יצרן ודגם)
/** "טויוטה קורולה", or "רכב ללא דגם" when neither is known. */
export function vehicleName(vehicle: Vehicle): string {
  return [vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') || t('vehicle.noModel');
}

// מתי פג, במילים
/** "פג היום", "פג אתמול", "פג לפני 12 ימים" — then the date itself. */
function expiredWords(date: string): string {
  const days = Math.abs(daysUntilExpiry(date) ?? 0);
  const when = days === 0 ? t('expiry.expiredToday') : days === 1 ? t('expiry.expiredYesterday') : t('expiry.expiredDaysAgo', { days });
  return `${when} · ${formatDate(date)}`;
}

// תאריך הפקיעה של פריט ברכב
function expiryOf(compliance: ComplianceItem[] | undefined, itemType: string): string | null {
  return compliance?.find((c) => c.item_type === itemType)?.expiry_date ?? null;
}

// מקבץ את כל מה שדורש טיפול לפי סוג
/**
 * Pure: the callers bring the data. `drivers` is optional (the owner console
 * passes vehicles only); a driver's `licenseSides` holds the titles of the
 * licence photos on file, and is left out when they were not loaded.
 */
export function attentionGroups(input: {
  vehicles: Vehicle[];
  compliance: Map<string, ComplianceItem[]>;
  vehicleDrivers: Map<string, VehicleDriverWithProfile[]>;
  drivers?: { driver: DriverRow; licenseSides?: Set<string> }[];
}): AttentionGroup[] {
  const insurance: AttentionItem[] = [];
  const registration: AttentionItem[] = [];
  const unassigned: AttentionItem[] = [];
  const license: AttentionItem[] = [];
  const licenseDocs: AttentionItem[] = [];

  for (const v of input.vehicles.filter((x) => x.status !== 'archived')) {
    const item = (detail: string, tone: AttentionItem['tone'], target: AttentionTarget): AttentionItem => ({
      ownerType: 'vehicle', ownerId: v.id, title: formatPlate(v.plate_number), name: vehicleName(v), detail, tone, target,
    });
    const items = input.compliance.get(v.id);
    const insuranceExpiry = expiryOf(items, 'insurance_mandatory');
    const insuranceDays = daysUntilExpiry(insuranceExpiry);
    // Mandatory insurance is required by law: never entered counts as missing.
    if (insuranceDays == null) insurance.push(item(t('attention.noMandatoryInsurance'), 'bad', { openFolder: 'insurance_mandatory' }));
    else if (insuranceDays < 0) insurance.push(item(expiredWords(insuranceExpiry!), 'bad', { openFolder: 'insurance_mandatory' }));

    // Registration only once it lapsed: many fleets never enter it, and an empty folder isn't a fault.
    const registrationExpiry = expiryOf(items, 'vehicle_license');
    const registrationDays = daysUntilExpiry(registrationExpiry);
    if (registrationDays != null && registrationDays < 0) registration.push(item(expiredWords(registrationExpiry!), 'bad', { openFolder: 'vehicle_license' }));

    if (!input.vehicleDrivers.get(v.id)?.length) unassigned.push(item(t('attention.noDriverAssigned'), 'warn', { openDrivers: true }));
  }

  const byLicense = [...(input.drivers ?? [])].sort((a, b) => (a.driver.license_expiry ?? '').localeCompare(b.driver.license_expiry ?? ''));
  for (const { driver, licenseSides } of byLicense) {
    const item = (detail: string, tone: AttentionItem['tone'], target: AttentionTarget): AttentionItem => ({
      ownerType: 'driver', ownerId: driver.id, title: driver.full_name?.trim() || t('common.unnamed'), name: '', detail, tone, target,
    });
    const days = daysUntilExpiry(driver.license_expiry);
    if (days != null && days < 0) license.push(item(expiredWords(driver.license_expiry!), 'bad', { driverLicense: true }));
    else if (days != null && days <= 30) license.push(item(`${t('attention.willExpire')} ${formatDate(driver.license_expiry)} · ${t('validity.inDays', { count: days })}`, 'warn', { driverLicense: true }));

    if (licenseSides) {
      const missing = [
        !licenseSides.has(LICENSE_SIDE_STORED_TITLE.front) && t('documents.frontSide'),
        !licenseSides.has(LICENSE_SIDE_STORED_TITLE.back) && t('documents.backSide'),
        !driver.license_expiry && t('common.validity'),
      ].filter((x): x is string => !!x);
      if (missing.length) licenseDocs.push(item(t('attention.missingV1', { v1: missing.join(', ') }), 'warn', { licenseDocs: true }));
    }
  }

  const groups: AttentionGroup[] = [
    { kind: 'insurance', title: t('attention.noValidMandatoryInsurance'), hint: t('attention.missingInsuranceHint'), action: t('attention.toInsurance'), tone: 'bad', items: insurance },
    { kind: 'registration', title: t('attention.vehicleLicenseExpired'), hint: t('attention.vehicleLicenseExpiredHint'), action: t('attention.toLicense'), tone: 'bad', items: registration },
    { kind: 'license', title: t('attention.drivingLicenses'), hint: t('attention.expiredOrWithin30'), action: t('attention.toLicense'), tone: license.some((i) => i.tone === 'bad') ? 'bad' : 'warn', items: license },
    { kind: 'licenseDocs', title: t('attention.unverifiedLicenses'), hint: t('attention.missingLicensePhoto'), action: t('attention.toPhotos'), tone: 'warn', items: licenseDocs },
    { kind: 'unassigned', title: t('attention.vehiclesWithoutDriver'), hint: t('attention.noActiveAssignmentHint'), action: t('attention.assignDriver'), tone: 'warn', items: unassigned },
  ];
  return groups.filter((g) => g.items.length > 0);
}

// כמה רכבים ונהגים וכמה בעיות פתוחות
/** Distinct vehicles/drivers and open problems — one can have several. */
export function attentionTotals(groups: AttentionGroup[]): { owners: number; issues: number } {
  const owners = new Set(groups.flatMap((g) => g.items.map((i) => `${i.ownerType}|${i.ownerId}`)));
  return { owners: owners.size, issues: groups.reduce((sum, g) => sum + g.items.length, 0) };
}

// לאן לחיצה על פריט מובילה
/** The screen and params that open the fix; the same on phone and desktop. */
export function attentionRoute(item: AttentionItem):
  | { screen: 'VehicleDetail'; params: { vehicleId: string; openFolder?: string; openDrivers?: boolean; focus?: string } }
  | { screen: 'DriverDetail'; params: { driverId: string; focus?: string } }
  | { screen: 'DriverLicenseDocuments'; params: { driverId: string } } {
  const target = item.target;
  if ('openFolder' in target) return { screen: 'VehicleDetail', params: { vehicleId: item.ownerId, openFolder: target.openFolder, focus: target.openFolder } };
  if ('openDrivers' in target) return { screen: 'VehicleDetail', params: { vehicleId: item.ownerId, openDrivers: true, focus: 'drivers' } };
  if ('licenseDocs' in target) return { screen: 'DriverLicenseDocuments', params: { driverId: item.ownerId } };
  return { screen: 'DriverDetail', params: { driverId: item.ownerId, focus: 'license_expiry' } };
}
