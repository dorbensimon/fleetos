/* ------------------------------------------------------------------ */
/* Vehicle <-> driver assignments (vehicle_drivers)                    */
/*                                                                      */
/* Source of truth for "who currently drives this vehicle", replacing  */
/* vehicles.primary_driver_id (still present on the row for now — see  */
/* supabase/sql/34_vehicle_drivers.sql — but no longer read/written    */
/* here). A vehicle may have at most 2 *active* rows (unassigned_at is */
/* null): at most one is_primary. Removing a driver sets unassigned_at */
/* rather than deleting the row, so vehicle_driver_history-style audit */
/* is preserved on this table itself. The DB trigger enforces all of   */
/* this server-side; the checks here just give a fast, friendly error  */
/* before round-tripping to Postgres.                                  */
/* ------------------------------------------------------------------ */

import { supabase } from '../supabase';
import { VehicleDriverAssignment, VehicleDriverWithProfile, DriverVehicleAssignment } from './types';
import { chunkIds } from './paging';

const MAX_DRIVERS_PER_VEHICLE = 2;

/** Active (unassigned_at is null) driver assignments for one vehicle, primary first. */
export async function listActiveVehicleDrivers(vehicleId: string): Promise<VehicleDriverWithProfile[]> {
  const { data, error } = await supabase
    .from('vehicle_drivers')
    .select('*, profiles:driver_id(full_name, phone)')
    .eq('vehicle_id', vehicleId)
    .is('unassigned_at', null)
    .order('is_primary', { ascending: false })
    .order('assigned_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const { profiles, ...rest } = row;
    return {
      ...(rest as VehicleDriverAssignment),
      full_name: profiles?.full_name ?? null,
      phone: profiles?.phone ?? null,
    };
  });
}

/**
 * Same as `listActiveVehicleDrivers` but for many vehicles at once — used
 * by list screens (FleetScreen) so they don't issue one query per row.
 */
export async function listActiveVehicleDriversForVehicles(
  vehicleIds: string[]
): Promise<Map<string, VehicleDriverWithProfile[]>> {
  const map = new Map<string, VehicleDriverWithProfile[]>();
  if (vehicleIds.length === 0) return map;

  const rows: any[] = [];
  for (const vehicleIdBatch of chunkIds(vehicleIds)) {
    const { data, error } = await supabase
      .from('vehicle_drivers')
      .select('*, profiles:driver_id(full_name, phone)')
      .in('vehicle_id', vehicleIdBatch)
      .is('unassigned_at', null)
      .order('is_primary', { ascending: false })
      .order('assigned_at', { ascending: true });
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  for (const row of rows) {
    const { profiles, ...rest } = row;
    const assignment: VehicleDriverWithProfile = {
      ...(rest as VehicleDriverAssignment),
      full_name: profiles?.full_name ?? null,
      phone: profiles?.phone ?? null,
    };
    const list = map.get(assignment.vehicle_id) ?? [];
    list.push(assignment);
    map.set(assignment.vehicle_id, list);
  }
  return map;
}

/** Active vehicles a driver currently drives (0–2), primary first. */
export async function listActiveDriverVehicles(driverId: string): Promise<DriverVehicleAssignment[]> {
  const { data, error } = await supabase
    .from('vehicle_drivers')
    .select('*, vehicle:vehicle_id(*)')
    .eq('driver_id', driverId)
    .is('unassigned_at', null)
    .order('is_primary', { ascending: false })
    .order('assigned_at', { ascending: true });

  if (error) throw error;
  return (data ?? [])
    .filter((row: any) => !!row.vehicle)
    .map((row: any) => {
      const { vehicle, ...rest } = row;
      return { ...(rest as VehicleDriverAssignment), vehicle };
    });
}

/**
 * Assigns a driver to a vehicle without touching any existing active
 * assignment — the DB trigger rejects a 3rd active driver, a duplicate
 * active pair, or a 2nd active primary, but we check first so the UI can
 * show a clear Hebrew message immediately instead of a raw SQL error.
 */
export async function assignDriverToVehicle(
  vehicleId: string,
  driverId: string,
  isPrimary: boolean
): Promise<VehicleDriverAssignment> {
  const existing = await listActiveVehicleDrivers(vehicleId);

  if (existing.some((a) => a.driver_id === driverId)) {
    throw new Error('הנהג כבר משויך לרכב זה');
  }
  if (existing.length >= MAX_DRIVERS_PER_VEHICLE) {
    throw new Error('לא ניתן לשייך יותר משני נהגים לרכב אחד');
  }
  if (isPrimary && existing.some((a) => a.is_primary)) {
    throw new Error('לרכב זה כבר יש נהג ראשי פעיל — יש להסיר אותו לפני קביעת נהג ראשי חדש');
  }

  const { data, error } = await supabase
    .from('vehicle_drivers')
    .insert({ vehicle_id: vehicleId, driver_id: driverId, is_primary: isPrimary })
    .select()
    .single();
  if (error) throw error;
  return data as VehicleDriverAssignment;
}

/**
 * Removes a driver from a vehicle — a soft delete (`unassigned_at`), never
 * a physical delete, so the assignment's history stays queryable.
 */
export async function unassignVehicleDriver(assignmentId: string) {
  const { error } = await supabase
    .from('vehicle_drivers')
    .update({ unassigned_at: new Date().toISOString() })
    .eq('id', assignmentId);
  if (error) throw error;
}

/**
 * Makes one assignment the vehicle's primary driver — an explicit, separate
 * action from adding a driver (never an automatic side effect). Demotes
 * the current primary (if any) first: the DB only allows one active
 * `is_primary = true` row per vehicle at a time, so promoting before
 * demoting would collide with that constraint.
 */
export async function setPrimaryVehicleDriver(vehicleId: string, assignmentId: string) {
  const { error: demoteError } = await supabase
    .from('vehicle_drivers')
    .update({ is_primary: false })
    .eq('vehicle_id', vehicleId)
    .eq('is_primary', true)
    .is('unassigned_at', null)
    .neq('id', assignmentId);
  if (demoteError) throw demoteError;

  const { error } = await supabase.from('vehicle_drivers').update({ is_primary: true }).eq('id', assignmentId);
  if (error) throw error;
}
