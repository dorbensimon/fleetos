import { supabase, Company } from './supabase';

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
