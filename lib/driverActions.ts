import { supabase } from './supabase';
import type { Vehicle } from './adminApi';

export async function updateOwnVehicleOdometer(vehicleId: string, odometer: number): Promise<Vehicle> {
  const { data, error } = await supabase.rpc('update_own_vehicle_odometer', {
    p_vehicle_id: vehicleId,
    p_odometer: odometer,
  });
  if (error) throw error;
  return data as Vehicle;
}
