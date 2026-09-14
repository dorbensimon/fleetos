import { supabase } from './supabase';

export interface LicenseUpdateData {
  licenseNumber: string;
  licenseExpiry: string;
  licenseClasses: string;
}

export type LicenseUpdateOutcome = 'applied' | 'pending';

export interface LicenseUpdateRequest {
  id: string;
  driver_id: string;
  driver_name: string | null;
  requested_license_number: string;
  requested_license_expiry: string;
  requested_license_classes: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

/**
 * Submits a license update. A manager's submission (RLS: can_manage_company)
 * applies immediately; a driver's own submission is staged as 'pending'
 * until a manager reviews it — see 79_driver_license_update_requests.sql.
 * driver_details stays locked to direct writes for drivers either way.
 */
export async function submitLicenseUpdate(driverId: string, data: LicenseUpdateData): Promise<LicenseUpdateOutcome> {
  const { data: result, error } = await supabase.rpc('submit_license_update', {
    p_driver_id: driverId,
    p_license_number: data.licenseNumber,
    p_license_expiry: data.licenseExpiry,
    p_license_classes: data.licenseClasses,
  });
  if (error) throw error;
  return (result as { status: LicenseUpdateOutcome }).status;
}

function mapLicenseUpdateRequestRow(row: any): LicenseUpdateRequest {
  return {
    id: row.id,
    driver_id: row.driver_id,
    driver_name: row.profiles?.full_name ?? null,
    requested_license_number: row.requested_license_number,
    requested_license_expiry: row.requested_license_expiry,
    requested_license_classes: row.requested_license_classes,
    status: row.status,
    created_at: row.created_at,
  };
}

const LICENSE_UPDATE_REQUEST_COLUMNS =
  'id, driver_id, requested_license_number, requested_license_expiry, requested_license_classes, status, created_at, profiles:driver_id(full_name)';

/** Pending license update requests for the caller's company (managers only — RLS-enforced). */
export async function listPendingLicenseUpdateRequests(): Promise<LicenseUpdateRequest[]> {
  const { data, error } = await supabase
    .from('license_update_requests')
    .select(LICENSE_UPDATE_REQUEST_COLUMNS)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapLicenseUpdateRequestRow);
}

/** The one pending license update request for a specific driver, if any (managers only — RLS-enforced). */
export async function getPendingLicenseUpdateForDriver(driverId: string): Promise<LicenseUpdateRequest | null> {
  const { data, error } = await supabase
    .from('license_update_requests')
    .select(LICENSE_UPDATE_REQUEST_COLUMNS)
    .eq('driver_id', driverId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapLicenseUpdateRequestRow(data) : null;
}

/** Approves or rejects a pending request; approval writes driver_details. Managers only — RLS-enforced. */
export async function reviewLicenseUpdateRequest(requestId: string, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc('review_license_update_request', {
    p_request_id: requestId,
    p_approve: approve,
  });
  if (error) throw error;
}
