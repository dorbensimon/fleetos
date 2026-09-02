import { supabase } from '../supabase';
import { ComplianceItem, OwnerType } from './types';
import { chunkIds, fetchAllPages } from './paging';

export async function listCompliance(
  ownerType: OwnerType,
  ownerId: string
): Promise<ComplianceItem[]> {
  const { data, error } = await supabase
    .from('compliance_items')
    .select('*')
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId);

  if (error) throw error;
  return (data ?? []) as ComplianceItem[];
}

/** Compliance rows for many owners at once — used by the list screens. */
export async function listComplianceForOwners(
  ownerType: OwnerType,
  ownerIds: string[]
): Promise<Map<string, ComplianceItem[]>> {
  const map = new Map<string, ComplianceItem[]>();
  if (ownerIds.length === 0) return map;

  const rows: ComplianceItem[] = [];
  for (const ownerIdBatch of chunkIds(ownerIds)) {
    rows.push(
      ...(await fetchAllPages<ComplianceItem>((from, to) =>
        supabase
          .from('compliance_items')
          .select('*')
          .eq('owner_type', ownerType)
          .in('owner_id', ownerIdBatch)
          .order('id', { ascending: true })
          .range(from, to)
      ))
    );
  }

  for (const row of rows) {
    const list = map.get(row.owner_id) ?? [];
    list.push(row);
    map.set(row.owner_id, list);
  }
  return map;
}

/** Creates or updates the row for one tracked item. */
export async function upsertCompliance(payload: {
  companyId: string;
  ownerType: OwnerType;
  ownerId: string;
  category: string;
  itemType: string;
  lastDate?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
}) {
  const { error } = await supabase.from('compliance_items').upsert(
    {
      company_id: payload.companyId,
      owner_type: payload.ownerType,
      owner_id: payload.ownerId,
      category: payload.category,
      item_type: payload.itemType,
      last_date: payload.lastDate ?? null,
      expiry_date: payload.expiryDate ?? null,
      notes: payload.notes ?? null,
    },
    { onConflict: 'owner_type,owner_id,item_type' }
  );
  if (error) throw error;
}
