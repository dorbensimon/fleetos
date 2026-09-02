import { supabase } from '../supabase';
import { Vehicle } from './types';
import { functionErrorMessage } from '../functionError';

export async function listVehicles(companyId: string, includeArchived = false): Promise<Vehicle[]> {
  let query = supabase.from('vehicles').select('*').eq('company_id', companyId);
  if (!includeArchived) query = query.neq('status', 'archived');

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Vehicle[];
}

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

export async function createVehicle(payload: Partial<Vehicle> & { company_id: string; plate_number: string }) {
  const { data, error } = await supabase.from('vehicles').insert(payload).select().single();
  if (error) throw error;
  return data as Vehicle;
}

export async function updateVehicle(vehicleId: string, patch: Partial<Vehicle>) {
  const { error } = await supabase.from('vehicles').update(patch).eq('id', vehicleId);
  if (error) throw error;
}

export async function archiveVehicle(vehicleId: string) {
  await updateVehicle(vehicleId, { status: 'archived' });
}

export async function restoreVehicle(vehicleId: string) {
  await updateVehicle(vehicleId, { status: 'active' });
}

export async function deleteVehicle(vehicleId: string, companyId: string) {
  const { data, error } = await supabase.functions.invoke('delete-company-vehicle', {
    body: { vehicleId, companyId },
  });
  if (error || !data?.success) {
    throw new Error(await functionErrorMessage(error, data, 'מחיקת הרכב נכשלה', false));
  }
}
