// חיפוש נתוני רכב במאגר הציבורי
import { functionErrorMessage } from './functionError';
import { supabase } from './supabase';
import { t } from './i18n';
import type { VehicleType } from './adminApi';

export type VehicleRegistryDetails = {
  plateNumber: string;
  manufacturer: string | null;
  model: string | null;
  productionYear: number | null;
  color: string | null;
  licenseExpiry: string | null;
  /** The app's vehicle type when the registry says it clearly (missing from older server versions). */
  vehicleType?: VehicleType | null;
  vin?: string | null;
  roadRegistrationDate?: string | null;
  /** Everything else the registry has, by REGISTRY_DETAIL_FIELDS keys. */
  details?: Record<string, string>;
};

type VehicleRegistryResponse =
  | { found: false }
  | { found: true; vehicle: VehicleRegistryDetails };

// מביא נתוני רכב לפי מספר רישוי (דרך השרת)
/** Reads public vehicle data through the authenticated server-side lookup. */
export async function lookupVehicleRegistry(plateNumber: string): Promise<VehicleRegistryDetails | null> {
  const plate = plateNumber.replace(/\D/g, '');
  if (!/^\d{7,8}$/.test(plate)) {
    throw new Error(t('vehicle.plateDigits'));
  }

  const { data, error } = await supabase.functions.invoke('lookup-vehicle-registry', {
    body: { plateNumber: plate },
  });
  const response = data as VehicleRegistryResponse | null;
  if (error || !response) {
    throw new Error(await functionErrorMessage(error, data, t('vehicle.registryUnavailable')));
  }

  return response.found ? response.vehicle : null;
}
