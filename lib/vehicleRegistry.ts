import { functionErrorMessage } from './functionError';
import { supabase } from './supabase';

export type VehicleRegistryDetails = {
  plateNumber: string;
  manufacturer: string | null;
  model: string | null;
  productionYear: number | null;
  color: string | null;
  licenseExpiry: string | null;
};

type VehicleRegistryResponse =
  | { found: false }
  | { found: true; vehicle: VehicleRegistryDetails };

/** Reads public vehicle data through the authenticated server-side lookup. */
export async function lookupVehicleRegistry(plateNumber: string): Promise<VehicleRegistryDetails | null> {
  const plate = plateNumber.replace(/\D/g, '');
  if (!/^\d{7,8}$/.test(plate)) {
    throw new Error('מספר הרישוי חייב להכיל 7–8 ספרות');
  }

  const { data, error } = await supabase.functions.invoke('lookup-vehicle-registry', {
    body: { plateNumber: plate },
  });
  const response = data as VehicleRegistryResponse | null;
  if (error || !response) {
    throw new Error(await functionErrorMessage(error, data, 'לא ניתן לחפש את פרטי הרכב כרגע'));
  }

  return response.found ? response.vehicle : null;
}
