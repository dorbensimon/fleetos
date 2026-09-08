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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { VehicleDriverAssignment, VehicleDriverWithProfile, DriverVehicleAssignment } from './types';
import { chunkIds } from './paging';

const MAX_DRIVERS_PER_VEHICLE = 2;
const PENDING_ASSIGNMENT_OPERATIONS_KEY = 'fleetos.pending-assignment-operations.v1';

type PendingAssignmentOperation =
  | { type: 'assign'; userId: string; operationId: string; vehicleId: string; driverId: string; isPrimary: boolean }
  | { type: 'unassign'; userId: string; assignmentId: string }
  | { type: 'primary'; userId: string; vehicleId: string; assignmentId: string };
type PendingAssignmentOperationInput =
  | { type: 'assign'; operationId: string; vehicleId: string; driverId: string; isPrimary: boolean }
  | { type: 'unassign'; assignmentId: string }
  | { type: 'primary'; vehicleId: string; assignmentId: string };

export class PendingAssignmentSyncError extends Error {
  constructor() {
    super('הפעולה נשמרה ותסונכרן אוטומטית כשתחזור לרשת');
    this.name = 'PendingAssignmentSyncError';
  }
}

export function isPendingAssignmentSyncError(error: unknown): error is PendingAssignmentSyncError {
  return error instanceof PendingAssignmentSyncError;
}

const newOperationId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });

const isNetworkFailure = (error: any) =>
  !error?.code && /network|fetch|timeout|connection|offline|internet/i.test(String(error?.message ?? error));

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error('אין משתמש מחובר');
  return data.user.id;
}

async function readPendingOperations(): Promise<PendingAssignmentOperation[]> {
  const raw = await AsyncStorage.getItem(PENDING_ASSIGNMENT_OPERATIONS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as PendingAssignmentOperation[]; } catch { return []; }
}

async function savePendingOperations(operations: PendingAssignmentOperation[]) {
  await AsyncStorage.setItem(PENDING_ASSIGNMENT_OPERATIONS_KEY, JSON.stringify(operations));
}

async function queueAfterNetworkFailure(operation: PendingAssignmentOperationInput, originalError: any): Promise<never> {
  if (!isNetworkFailure(originalError)) throw originalError;
  const userId = await currentUserId();
  const pending = await readPendingOperations();
  const item = { ...operation, userId } as PendingAssignmentOperation;
  const duplicate = pending.some((candidate) => JSON.stringify(candidate) === JSON.stringify(item));
  if (!duplicate) await savePendingOperations([...pending, item]);
  throw new PendingAssignmentSyncError();
}

async function executePendingOperation(operation: PendingAssignmentOperation) {
  if (operation.type === 'assign') {
    const { error } = await supabase.rpc('assign_vehicle_driver', {
      p_vehicle_id: operation.vehicleId, p_driver_id: operation.driverId, p_is_primary: operation.isPrimary, p_operation_id: operation.operationId,
    });
    if (error) throw error;
    return;
  }
  if (operation.type === 'unassign') {
    const { error } = await supabase.rpc('unassign_vehicle_driver', { p_assignment_id: operation.assignmentId });
    if (error) throw error;
    return;
  }
  const { error } = await supabase.rpc('set_vehicle_primary_driver', { p_vehicle_id: operation.vehicleId, p_assignment_id: operation.assignmentId });
  if (error) throw error;
}

/** Retries queued work only for the currently authenticated administrator. */
export async function flushPendingAssignmentOperations() {
  const userId = await currentUserId();
  const pending = await readPendingOperations();
  const remaining: PendingAssignmentOperation[] = [];
  for (const operation of pending) {
    if (operation.userId !== userId) { remaining.push(operation); continue; }
    try { await executePendingOperation(operation); } catch { remaining.push(operation); }
  }
  await savePendingOperations(remaining);
}

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
  const operationId = newOperationId();
  try {
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

    const { data, error } = await supabase.rpc('assign_vehicle_driver', {
      p_vehicle_id: vehicleId, p_driver_id: driverId, p_is_primary: isPrimary, p_operation_id: operationId,
    });
    if (error) throw error;
    return data as VehicleDriverAssignment;
  } catch (error) {
    return queueAfterNetworkFailure({ type: 'assign', operationId, vehicleId, driverId, isPrimary }, error);
  }
}

/**
 * Removes a driver from a vehicle — a soft delete (`unassigned_at`), never
 * a physical delete, so the assignment's history stays queryable.
 */
export async function unassignVehicleDriver(assignmentId: string) {
  const { error } = await supabase.rpc('unassign_vehicle_driver', { p_assignment_id: assignmentId });
  if (error) await queueAfterNetworkFailure({ type: 'unassign', assignmentId }, error);
}

/**
 * Makes one assignment the vehicle's primary driver — an explicit, separate
 * action from adding a driver (never an automatic side effect). Demotes
 * the current primary (if any) first: the DB only allows one active
 * `is_primary = true` row per vehicle at a time, so promoting before
 * demoting would collide with that constraint.
 */
export async function setPrimaryVehicleDriver(vehicleId: string, assignmentId: string) {
  const { error } = await supabase.rpc('set_vehicle_primary_driver', {
    p_vehicle_id: vehicleId,
    p_assignment_id: assignmentId,
  });
  if (error) await queueAfterNetworkFailure({ type: 'primary', vehicleId, assignmentId }, error);
}
