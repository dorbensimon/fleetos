// רכבים: רשימה, פרטים, יצירה, עדכון, ארכיון ומחיקה
import { supabase } from '../supabase';
import { Vehicle } from './types';
import { functionErrorMessage } from '../functionError';
import { fetchAllPages } from './paging';
import { t } from '../i18n';

// רשימת הרכבים של החברה
export async function listVehicles(companyId: string, includeArchived = false): Promise<Vehicle[]> {
  return fetchAllPages<Vehicle>(async (from, to) => {
    let query = supabase.from('vehicles').select('*').eq('company_id', companyId);
    if (!includeArchived) query = query.neq('status', 'archived');
    return query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to);
  });
}

// מביא רכב אחד לפי מזהה
export async function getVehicle(vehicleId: string): Promise<Vehicle | null> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', vehicleId)
    .single();

  // PGRST116 = "no rows found" — a genuine "not found", safe to return null.
  // Any other error (network, RLS/permissions, etc) must propagate so the
  // screen can show a real error state instead of a misleading "not found".
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as Vehicle;
}

// יוצר רכב חדש
export async function createVehicle(payload: Partial<Vehicle> & { company_id: string; plate_number: string }) {
  const { data, error } = await supabase.from('vehicles').insert(payload).select().single();
  if (error) throw error;
  return data as Vehicle;
}

// מעדכן פרטי רכב
export async function updateVehicle(vehicleId: string, patch: Partial<Vehicle>) {
  const { error } = await supabase.from('vehicles').update(patch).eq('id', vehicleId);
  if (error) throw error;
}

// מעביר רכב לארכיון
export async function archiveVehicle(vehicleId: string) {
  // Like archiving a driver: close the vehicle's active assignments first, so
  // an archived vehicle stops showing on its drivers' cards and alerts.
  const { data: links, error } = await supabase.from('vehicle_drivers').select('id').eq('vehicle_id', vehicleId).is('unassigned_at', null);
  if (error) throw error;
  for (const link of links ?? []) {
    const { error: unassignError } = await supabase.rpc('unassign_vehicle_driver', { p_assignment_id: link.id });
    if (unassignError) throw unassignError;
  }
  await updateVehicle(vehicleId, { status: 'archived' });
}

// מחזיר רכב מהארכיון
export async function restoreVehicle(vehicleId: string) {
  await updateVehicle(vehicleId, { status: 'active' });
}

// מוחק רכב לצמיתות
export async function deleteVehicle(vehicleId: string, companyId: string) {
  const { data, error } = await supabase.functions.invoke('delete-company-vehicle', {
    body: { vehicleId, companyId },
  });
  if (error || !data?.success) {
    throw new Error(await functionErrorMessage(error, data, t('vehicle.deleteFailed'), false));
  }
}
