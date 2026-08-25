import { supabase } from '../supabase';
import { DriverDetails, DriverRow, DriverRowVehicle } from './types';
import { listActiveDriverVehicles } from './assignments';

/**
 * Drivers live across two tables: `profiles` (identity + auth link) and
 * `driver_details` (everything else). This joins them and attaches the
 * plate of the vehicle currently assigned to each driver.
 */
export async function listDrivers(companyId: string): Promise<DriverRow[]> {
  const { data: details, error } = await supabase
    .from('driver_details')
    .select('*')
    .eq('company_id', companyId)
    .neq('status', 'archived');

  if (error) throw error;
  const rows = (details ?? []) as DriverDetails[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  const [{ data: profiles }, { data: assignments, error: assignError }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, phone, job_title').in('id', ids),
    supabase
      .from('vehicle_drivers')
      .select('driver_id, is_primary, vehicle:vehicle_id(id, plate_number)')
      .in('driver_id', ids)
      .is('unassigned_at', null)
      .order('is_primary', { ascending: false }),
  ]);
  if (assignError) throw assignError;

  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const vehiclesByDriver = new Map<string, DriverRowVehicle[]>();
  for (const row of (assignments ?? []) as any[]) {
    if (!row.vehicle) continue;
    const list = vehiclesByDriver.get(row.driver_id) ?? [];
    list.push({ id: row.vehicle.id, plate_number: row.vehicle.plate_number, is_primary: row.is_primary });
    vehiclesByDriver.set(row.driver_id, list);
  }

  return rows.map((r) => {
    const vehicles = vehiclesByDriver.get(r.id) ?? [];
    return {
      ...r,
      full_name: profileById.get(r.id)?.full_name ?? null,
      phone: profileById.get(r.id)?.phone ?? null,
      job_title: profileById.get(r.id)?.job_title ?? null,
      vehicles,
      vehicle_id: vehicles[0]?.id ?? null,
      vehicle_plate: vehicles[0]?.plate_number ?? null,
    };
  });
}

export async function getDriver(driverId: string): Promise<DriverRow | null> {
  const [{ data: details, error: detailsError }, { data: profile, error: profileError }] = await Promise.all([
    supabase.from('driver_details').select('*').eq('id', driverId).single(),
    supabase.from('profiles').select('id, full_name, phone, job_title').eq('id', driverId).single(),
  ]);

  // PGRST116 = "no rows found" — genuine "not found", safe to return null.
  // Any other error (network, RLS/permissions) must propagate.
  if (detailsError && detailsError.code !== 'PGRST116') throw detailsError;
  if (profileError && profileError.code !== 'PGRST116') throw profileError;
  if (!details) return null;

  const assignments = await listActiveDriverVehicles(driverId);
  const vehicles: DriverRowVehicle[] = assignments.map((a) => ({
    id: a.vehicle.id,
    plate_number: a.vehicle.plate_number,
    is_primary: a.is_primary,
  }));

  return {
    ...(details as DriverDetails),
    full_name: (profile as any)?.full_name ?? null,
    phone: (profile as any)?.phone ?? null,
    job_title: (profile as any)?.job_title ?? null,
    vehicles,
    vehicle_id: vehicles[0]?.id ?? null,
    vehicle_plate: vehicles[0]?.plate_number ?? null,
  };
}

/** Updates the driver across both tables in one call. */
export async function updateDriver(
  driverId: string,
  patch: Partial<DriverDetails> & { full_name?: string | null; phone?: string | null }
) {
  const { full_name, phone, ...details } = patch;

  if (full_name !== undefined || phone !== undefined) {
    const profilePatch: Record<string, unknown> = {};
    if (full_name !== undefined) profilePatch.full_name = full_name;
    if (phone !== undefined) profilePatch.phone = phone;
    const { error } = await supabase.from('profiles').update(profilePatch).eq('id', driverId);
    if (error) throw error;
  }

  if (Object.keys(details).length > 0) {
    const { error } = await supabase.from('driver_details').update(details).eq('id', driverId);
    if (error) throw error;
  }
}

export async function archiveDriver(driverId: string) {
  const { error } = await supabase
    .from('driver_details')
    .update({ status: 'archived' })
    .eq('id', driverId);
  if (error) throw error;
}

/**
 * Creating a driver needs an Auth account, which the client cannot do —
 * it runs server-side with the service role.
 */
export async function createDriverAccount(payload: {
  companyId: string;
  email: string;
  password: string;
  fullName: string;
  phone: string;
  details: Partial<DriverDetails>;
}): Promise<{ ok: true; driverId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('create-company-driver', {
    body: {
      companyId: payload.companyId,
      email: payload.email,
      password: payload.password,
      fullName: payload.fullName,
      phone: payload.phone,
      details: payload.details,
    },
  });

  if (error || !data?.success) {
    let message = data?.error || 'יצירת הנהג נכשלה';
    const ctx = (error as any)?.context;
    if (ctx?.json) {
      try {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      } catch {
        /* keep the generic message */
      }
    }
    return { ok: false, error: message };
  }

  return { ok: true, driverId: data.driverId };
}

/**
 * Permanently removes a driver's account. Only the admin of the same
 * company (or the owner) may do this — enforced server-side, not just
 * by hiding the button.
 */
export async function deleteDriver(
  driverId: string,
  companyId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('delete-company-driver', {
    body: { driverId, companyId },
  });

  if (error || !data?.success) {
    let message = data?.error || 'מחיקת הנהג נכשלה';
    const ctx = (error as any)?.context;
    if (ctx?.json) {
      try {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      } catch {
        /* keep the generic message */
      }
    }
    return { ok: false, error: message };
  }

  return { ok: true };
}

/**
 * Permanently deletes EVERY driver in the company. Intentionally separate
 * from deleting an admin account (deleteDriver deletes one driver at a
 * time; deleting an admin never touches drivers at all) — this must be a
 * deliberate, explicit action the caller opts into, with its own
 * confirmation UI. Irreversible.
 */
export async function deleteAllCompanyDrivers(
  companyId: string
): Promise<
  | { ok: true; deletedCount: number; totalCount: number; failedIds: string[] }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.functions.invoke('delete-company-drivers', {
    body: { companyId, confirm: true },
  });

  if (error || !data?.success) {
    let message = data?.error || 'מחיקת הנהגים נכשלה';
    const ctx = (error as any)?.context;
    if (ctx?.json) {
      try {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      } catch {
        /* keep the generic message */
      }
    }
    return { ok: false, error: message };
  }

  return {
    ok: true,
    deletedCount: data.deletedCount ?? 0,
    totalCount: data.totalCount ?? 0,
    failedIds: data.failedIds ?? [],
  };
}

/**
 * Resets a driver's password and forces them to set their own new one
 * on next login (must_change_password=true) — same flow as when the
 * account was first created.
 */
export async function resetDriverPassword(
  driverId: string,
  companyId: string,
  newPassword: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('reset-user-password', {
    body: { userId: driverId, newPassword, companyId },
  });

  if (error || !data?.success) {
    let message = data?.error || 'איפוס הסיסמה נכשל';
    const ctx = (error as any)?.context;
    if (ctx?.json) {
      try {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      } catch {
        /* keep the generic message */
      }
    }
    return { ok: false, error: message };
  }

  return { ok: true };
}

/** The login email of a driver/admin — not on `profiles`, only in auth.users. */
export async function getUserEmail(userId: string, companyId: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('get-user-email', {
    body: { userId, companyId },
  });
  if (error || !data?.success) return null;
  return data.email ?? null;
}
