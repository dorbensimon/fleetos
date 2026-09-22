/**
 * Service schedule rule, shared by every screen that edits maintenance data:
 * the next service is due at the last service's odometer reading plus the
 * service interval. `next_service_km` is still stored (the fleet list,
 * reports and the daily notification scan all read it), so it has to be
 * derived from these two fields whenever either of them changes — never
 * from the current odometer.
 *
 * Without an interval there is nothing to derive from, and a manually
 * entered `next_service_km` stays the source of truth.
 */
export function deriveNextServiceKm(lastServiceKm: number, serviceIntervalKm: number | null | undefined): number | null {
  if (serviceIntervalKm == null || serviceIntervalKm <= 0) return null;
  return lastServiceKm + serviceIntervalKm;
}

/**
 * The next-service reading to display for a vehicle. Prefers the derived
 * value, so rows saved before this rule existed (next = odometer + interval)
 * still show the right status until they are corrected in the database.
 */
export function nextServiceKmOf(vehicle: {
  last_service_km: number;
  service_interval_km: number | null;
  next_service_km: number | null;
}): number | null {
  return deriveNextServiceKm(vehicle.last_service_km, vehicle.service_interval_km) ?? vehicle.next_service_km;
}
