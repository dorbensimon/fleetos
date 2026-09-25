import { supabase } from '../supabase';
import { listDrivers } from './drivers';
import { listVehicles } from './vehicles';
import { listComplianceForOwners } from './compliance';
import { listActiveVehicleDriversForVehicles } from './assignments';
import { expiryState } from '../theme';
import { fetchAllPages } from './paging';
import type { DriverRow, Vehicle } from './types';

export type AttentionSummary = { license: number; insurance: number; unassignedVehicles: number; missingLicenseDocuments: number };

/** The same four checks as `AttentionSummary`, with the drivers and vehicles behind each count. */
export type AttentionDetails = {
  /** Licenses that already lapsed, then those lapsing within 30 days. */
  licenseDrivers: DriverRow[];
  /** Mandatory insurance missing or expired; `expiry` is null when it was never entered. */
  insuranceVehicles: { vehicle: Vehicle; expiry: string | null }[];
  unassignedVehicles: Vehicle[];
  /** Missing the license's front or back photo, or its expiry date. */
  missingLicenseDocuments: { driver: DriverRow; missing: string[] }[];
};

export async function getAttentionDetails(companyId: string): Promise<AttentionDetails> {
  const [drivers, allVehicles] = await Promise.all([listDrivers(companyId), listVehicles(companyId, true)]);
  const vehicles = allVehicles.filter((v) => v.status !== 'archived');
  const [compliance, assignments, licenseDocs] = await Promise.all([
    listComplianceForOwners('vehicle', vehicles.map((v) => v.id)),
    listActiveVehicleDriversForVehicles(vehicles.map((v) => v.id)),
    fetchAllPages<{ owner_id: string; title: string }>((from, to) => supabase.from('documents').select('owner_id, title').eq('company_id', companyId).eq('owner_type', 'driver').eq('category', 'license_docs').range(from, to)),
  ]);
  const sides = new Map<string, Set<string>>();
  for (const doc of licenseDocs) (sides.get(doc.owner_id) ?? sides.set(doc.owner_id, new Set()).get(doc.owner_id)!).add(doc.title);

  const licenseDrivers = drivers
    .filter((d) => {
      const state = expiryState(d.license_expiry);
      return state === 'soon' || state === 'expired';
    })
    .sort((a, b) => (a.license_expiry ?? '').localeCompare(b.license_expiry ?? ''));

  const insuranceVehicles = vehicles.flatMap((vehicle) => {
    const expiry = compliance.get(vehicle.id)?.find((x) => x.item_type === 'insurance_mandatory')?.expiry_date ?? null;
    const state = expiryState(expiry);
    return state === 'missing' || state === 'expired' ? [{ vehicle, expiry }] : [];
  });

  const missingLicenseDocuments = drivers.flatMap((driver) => {
    const driverSides = sides.get(driver.id);
    const missing = [
      !driverSides?.has('צד קדמי') && 'צד קדמי',
      !driverSides?.has('צד אחורי') && 'צד אחורי',
      !driver.license_expiry && 'תוקף',
    ].filter((x): x is string => !!x);
    return missing.length ? [{ driver, missing }] : [];
  });

  return {
    licenseDrivers,
    insuranceVehicles,
    unassignedVehicles: vehicles.filter((v) => !assignments.get(v.id)?.length),
    missingLicenseDocuments,
  };
}

export function summarizeAttention(details: AttentionDetails): AttentionSummary {
  return {
    license: details.licenseDrivers.length,
    insurance: details.insuranceVehicles.length,
    unassignedVehicles: details.unassignedVehicles.length,
    missingLicenseDocuments: details.missingLicenseDocuments.length,
  };
}

export async function getAttentionSummary(companyId: string): Promise<AttentionSummary> {
  return summarizeAttention(await getAttentionDetails(companyId));
}
