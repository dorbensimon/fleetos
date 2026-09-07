import { supabase } from '../supabase';
import { listDrivers } from './drivers';
import { listVehicles } from './vehicles';
import { listComplianceForOwners } from './compliance';
import { listActiveVehicleDriversForVehicles } from './assignments';
import { expiryState } from '../theme';
import { fetchAllPages } from './paging';

export type AttentionSummary = { license: number; insurance: number; unassignedVehicles: number; missingLicenseDocuments: number };

export async function getAttentionSummary(companyId: string): Promise<AttentionSummary> {
  const [drivers, allVehicles] = await Promise.all([listDrivers(companyId), listVehicles(companyId, true)]);
  const vehicles = allVehicles.filter((v) => v.status !== 'archived');
  const [compliance, assignments, licenseDocs] = await Promise.all([
    listComplianceForOwners('vehicle', vehicles.map((v) => v.id)),
    listActiveVehicleDriversForVehicles(vehicles.map((v) => v.id)),
    fetchAllPages<{ owner_id: string; title: string }>((from, to) => supabase.from('documents').select('owner_id, title').eq('company_id', companyId).eq('owner_type', 'driver').eq('category', 'license_docs').range(from, to)),
  ]);
  const sides = new Map<string, Set<string>>();
  for (const doc of licenseDocs) (sides.get(doc.owner_id) ?? sides.set(doc.owner_id, new Set()).get(doc.owner_id)!).add(doc.title);
  const invalidInsurance = vehicles.filter((v) => { const item = compliance.get(v.id)?.find((x) => x.item_type === 'insurance_mandatory'); const state = expiryState(item?.expiry_date); return state === 'missing' || state === 'expired'; }).length;
  return {
    license: drivers.filter((d) => { const state = expiryState(d.license_expiry); return state === 'soon' || state === 'expired'; }).length,
    insurance: invalidInsurance,
    unassignedVehicles: vehicles.filter((v) => !(assignments.get(v.id)?.length)).length,
    missingLicenseDocuments: drivers.filter((d) => { const driverSides = sides.get(d.id); return !driverSides?.has('צד קדמי') || !driverSides?.has('צד אחורי') || !d.license_expiry; }).length,
  };
}
