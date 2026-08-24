import { supabase } from './supabase';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type VehicleStatus = 'active' | 'maintenance' | 'disabled' | 'archived';
export type VehicleType = 'car' | 'minibus' | 'bus' | 'truck';
export type OwnerType = 'vehicle' | 'driver';

export interface Vehicle {
  id: string;
  company_id: string;
  department_id: string | null;
  primary_driver_id: string | null;
  plate_number: string;
  internal_code: string | null;
  vin: string | null;
  vehicle_type: VehicleType;
  manufacturer: string | null;
  model: string | null;
  production_year: number | null;
  production_month: number | null;
  usage_type: string | null;
  status: VehicleStatus;
  odometer: number;
  odometer_updated_at: string | null;
  last_service_km: number;
  service_interval_km: number | null;
  next_service_km: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DriverDetails {
  id: string;
  company_id: string;
  department_id: string | null;
  employee_number: string | null;
  national_id: string | null;
  birth_date: string | null;
  address: string | null;
  home_phone: string | null;
  marital_status: string | null;
  education: string | null;
  employment_start_date: string | null;
  license_number: string | null;
  license_classes: string | null;
  license_issue_date: string | null;
  license_expiry: string | null;
  status: 'active' | 'archived';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** A driver as the list and detail screens need them: profile + details. */
export interface DriverRow extends DriverDetails {
  full_name: string | null;
  phone: string | null;
  job_title: string | null;
  email?: string | null;
  vehicle_id?: string | null;
  vehicle_plate?: string | null;
}

export interface ComplianceItem {
  id: string;
  company_id: string;
  owner_type: OwnerType;
  owner_id: string;
  category: string;
  item_type: string;
  last_date: string | null;
  expiry_date: string | null;
  notes: string | null;
}

export interface DocumentRow {
  id: string;
  company_id: string;
  owner_type: OwnerType;
  owner_id: string;
  compliance_item_id: string | null;
  category: string;
  title: string;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  expiry_date: string | null;
  created_at: string;
}

export interface Department {
  id: string;
  company_id: string;
  name: string;
}

export interface Notification {
  id: string;
  company_id: string;
  actor_id: string | null;
  actor_name: string | null;
  message: string;
  read_at: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/* Vehicles                                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Drivers                                                             */
/* ------------------------------------------------------------------ */

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

  const [{ data: profiles }, { data: vehicles }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, phone, job_title').in('id', ids),
    supabase.from('vehicles').select('id, plate_number, primary_driver_id').in('primary_driver_id', ids),
  ]);

  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const vehicleByDriver = new Map((vehicles ?? []).map((v: any) => [v.primary_driver_id, v]));

  return rows.map((r) => ({
    ...r,
    full_name: profileById.get(r.id)?.full_name ?? null,
    phone: profileById.get(r.id)?.phone ?? null,
    job_title: profileById.get(r.id)?.job_title ?? null,
    vehicle_id: vehicleByDriver.get(r.id)?.id ?? null,
    vehicle_plate: vehicleByDriver.get(r.id)?.plate_number ?? null,
  }));
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

  const { data: vehicle, error: vehicleError } = await supabase
    .from('vehicles')
    .select('id, plate_number')
    .eq('primary_driver_id', driverId)
    .maybeSingle();
  if (vehicleError) throw vehicleError;

  return {
    ...(details as DriverDetails),
    full_name: (profile as any)?.full_name ?? null,
    phone: (profile as any)?.phone ?? null,
    job_title: (profile as any)?.job_title ?? null,
    vehicle_id: (vehicle as any)?.id ?? null,
    vehicle_plate: (vehicle as any)?.plate_number ?? null,
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

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

const NOTIFICATION_TTL_DAYS = 7;

function notificationCutoffIso(): string {
  return new Date(Date.now() - NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function listNotifications(companyId: string): Promise<Notification[]> {
  // No dedicated cron job for this — trim anything past its 7-day
  // lifetime whenever the list is actually opened, which is often
  // enough in practice, then read only what's left.
  await supabase.from('notifications').delete().eq('company_id', companyId).lt('created_at', notificationCutoffIso());

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function countUnreadNotifications(companyId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('read_at', null)
    .gte('created_at', notificationCutoffIso());

  if (error) throw error;
  return count ?? 0;
}

/** Marks a single notification as read — used when the admin opens that specific notification. */
export async function markNotificationRead(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null);

  if (error) throw error;
}

/** Marks every currently-unread notification as read — only via an explicit "קרא הכל" action. */
export async function markAllNotificationsRead(companyId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .is('read_at', null);

  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Compliance                                                          */
/* ------------------------------------------------------------------ */

export async function listCompliance(
  ownerType: OwnerType,
  ownerId: string
): Promise<ComplianceItem[]> {
  const { data, error } = await supabase
    .from('compliance_items')
    .select('*')
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId);

  if (error) throw error;
  return (data ?? []) as ComplianceItem[];
}

/** Compliance rows for many owners at once — used by the list screens. */
export async function listComplianceForOwners(
  ownerType: OwnerType,
  ownerIds: string[]
): Promise<Map<string, ComplianceItem[]>> {
  const map = new Map<string, ComplianceItem[]>();
  if (ownerIds.length === 0) return map;

  const { data } = await supabase
    .from('compliance_items')
    .select('*')
    .eq('owner_type', ownerType)
    .in('owner_id', ownerIds);

  for (const row of (data ?? []) as ComplianceItem[]) {
    const list = map.get(row.owner_id) ?? [];
    list.push(row);
    map.set(row.owner_id, list);
  }
  return map;
}

/** Creates or updates the row for one tracked item. */
export async function upsertCompliance(payload: {
  companyId: string;
  ownerType: OwnerType;
  ownerId: string;
  category: string;
  itemType: string;
  lastDate?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
}) {
  const { error } = await supabase.from('compliance_items').upsert(
    {
      company_id: payload.companyId,
      owner_type: payload.ownerType,
      owner_id: payload.ownerId,
      category: payload.category,
      item_type: payload.itemType,
      last_date: payload.lastDate ?? null,
      expiry_date: payload.expiryDate ?? null,
      notes: payload.notes ?? null,
    },
    { onConflict: 'owner_type,owner_id,item_type' }
  );
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Departments                                                         */
/* ------------------------------------------------------------------ */

export async function listDepartments(companyId: string): Promise<Department[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .eq('company_id', companyId)
    .order('name');

  if (error) throw error;
  return (data ?? []) as Department[];
}

export async function createDepartment(companyId: string, name: string) {
  const { data, error } = await supabase
    .from('departments')
    .insert({ company_id: companyId, name })
    .select()
    .single();
  if (error) throw error;
  return data as Department;
}

export async function updateDepartment(departmentId: string, name: string) {
  const { error } = await supabase.from('departments').update({ name }).eq('id', departmentId);
  if (error) throw error;
}

export async function deleteDepartment(departmentId: string) {
  const { error } = await supabase.from('departments').delete().eq('id', departmentId);
  if (error) throw error;
}
