// 'דורש טיפול': טוען את הנתונים ומחשב לפי lib/attention.ts
import { supabase } from '../supabase';
import { listDrivers } from './drivers';
import { listVehicles } from './vehicles';
import { listComplianceForOwners } from './compliance';
import { listActiveVehicleDriversForVehicles } from './assignments';
import { fetchAllPages } from './paging';
import { LICENSE_DOCS_CATEGORY } from '../driverDocumentFolders';
import { attentionGroups, type AttentionGroup } from '../attention';
import { TRAFFIC_REPORTS_CATEGORY } from '../trafficReports';

// טוען את כל מה שדורש טיפול בחברה
export async function loadAttention(companyId: string): Promise<AttentionGroup[]> {
  const [drivers, vehicles] = await Promise.all([listDrivers(companyId), listVehicles(companyId)]);
  const [compliance, vehicleDrivers, licenseDocs, reports] = await Promise.all([
    listComplianceForOwners('vehicle', vehicles.map((v) => v.id)),
    listActiveVehicleDriversForVehicles(vehicles.map((v) => v.id)),
    fetchAllPages<{ owner_id: string; title: string }>((from, to) =>
      supabase.from('documents').select('owner_id, title').eq('company_id', companyId).eq('owner_type', 'driver').eq('category', LICENSE_DOCS_CATEGORY).order('id').range(from, to)
    ),
    fetchAllPages<{ owner_id: string; document_date: string | null; details: Record<string, string> }>((from, to) =>
      supabase.from('documents').select('owner_id, document_date, details').eq('company_id', companyId).eq('owner_type', 'driver').eq('category', TRAFFIC_REPORTS_CATEGORY).eq('details->>status', 'open').order('id').range(from, to)
    ),
  ]);
  const sides = new Map<string, Set<string>>();
  for (const doc of licenseDocs) (sides.get(doc.owner_id) ?? sides.set(doc.owner_id, new Set()).get(doc.owner_id)!).add(doc.title);
  return attentionGroups({
    vehicles,
    compliance,
    vehicleDrivers,
    drivers: drivers.map((driver) => ({ driver, licenseSides: sides.get(driver.id) ?? new Set() })),
    trafficReports: reports.map((r) => ({ ownerId: r.owner_id, documentDate: r.document_date, details: r.details ?? {} })),
  });
}
