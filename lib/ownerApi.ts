import { supabase, Company } from './supabase';
import { ACTIVITY_DAYS, type PlatformRows } from './platformOverview';
import type { CompanyAccount } from './companyAccount';

/** Platform-owner data access. Keeps Supabase details out of OwnerHomeScreen. */
export function listCompanies() {
  return supabase.from('companies').select('*').order('created_at', { ascending: false });
}

export function listCompanyProfileRoles() {
  return supabase.from('profiles').select('company_id, role').not('company_id', 'is', null);
}

export function updateCompanyStatus(companyId: string, status: Company['status']) {
  return supabase.from('companies').update({ status }).eq('id', companyId);
}

export function deleteOwnedCompany(companyId: string, confirmName: string) {
  return supabase.functions.invoke('delete-company', { body: { companyId, confirmName } });
}

export function createCompanyAdmin(body: Record<string, unknown>) {
  return supabase.functions.invoke('create-company-admin', { body });
}

/**
 * Every row the owner's control room aggregates, fetched in parallel. Each
 * select names only the columns the counts need — no drivers' names, ID
 * numbers or phones — so personal data never reaches the platform view. The
 * one exception is the owner's own customer record (company_accounts), which
 * holds the billing contact the owner entered themselves.
 */
export async function loadPlatformRows(): Promise<PlatformRows> {
  const since = new Date(Date.now() - ACTIVITY_DAYS * 86_400_000).toISOString();
  const [companies, profiles, drivers, vehicles, compliance, assignments, signatures, activity, accounts] = await Promise.all([
    supabase.from('companies').select('*').order('created_at', { ascending: false }),
    supabase.from('profiles').select('company_id, role, must_change_password').not('company_id', 'is', null),
    supabase.from('driver_details').select('company_id, status, license_expiry'),
    supabase.from('vehicles').select('id, company_id, status, plate_number, manufacturer, model'),
    supabase.from('compliance_items').select('owner_id, company_id, item_type, expiry_date').eq('owner_type', 'vehicle'),
    supabase.from('vehicle_drivers').select('vehicle_id, company_id').is('unassigned_at', null),
    supabase.from('signature_requests').select('company_id, status').is('deleted_at', null).is('archived_at', null).eq('status', 'pending'),
    supabase.from('activity_logs').select('company_id, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(5000),
    supabase
      .from('company_accounts')
      .select('company_id, status, plan, monthly_price, billing_cycle, trial_ends_at, renewal_date, vehicle_limit, contact_name, contact_phone, contact_email, notes'),
  ]);
  const failed = [companies, profiles, drivers, vehicles, compliance, assignments, signatures, activity, accounts].find((r) => r.error);
  if (failed?.error) throw failed.error;
  return {
    companies: (companies.data ?? []) as Company[],
    profiles: profiles.data ?? [],
    drivers: drivers.data ?? [],
    vehicles: (vehicles.data ?? []) as PlatformRows['vehicles'],
    compliance: compliance.data ?? [],
    assignments: assignments.data ?? [],
    signatures: signatures.data ?? [],
    activity: activity.data ?? [],
    accounts: (accounts.data ?? []).map((a) => ({ ...a, monthly_price: a.monthly_price == null ? null : Number(a.monthly_price) })) as CompanyAccount[],
  };
}
