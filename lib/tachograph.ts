import type { VehicleType } from './adminApi';

/**
 * The current fleet model distinguishes heavy goods vehicles and buses, but
 * does not store gross vehicle weight or a paid-passenger-service flag.
 * Until those fields exist, only these two unambiguous categories receive a
 * tachograph-expiry document requirement.
 */
export function requiresTachograph(vehicleType: VehicleType): boolean {
  return vehicleType === 'truck' || vehicleType === 'bus';
}
