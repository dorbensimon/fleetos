import { supabase, Company } from './supabase';

/** Owner/company administration data access. Screens should use this module
 * instead of constructing Supabase queries or Edge Function calls inline. */
export function getCompany(companyId: string) {
  return supabase.from('companies').select('*').eq('id', companyId).single<Company>();
}

export function listCompanyUsers(companyId: string) {
  return supabase.functions.invoke('list-company-users', { body: { companyId } });
}

export function updateCompanyUser(userId: string, patch: { full_name: string; phone: string }) {
  return supabase.from('profiles').update(patch).eq('id', userId);
}

export function updateCompany(companyId: string, patch: Partial<Company>) {
  return supabase.from('companies').update(patch).eq('id', companyId);
}

export function deleteCompany(companyId: string, confirmName: string) {
  return supabase.functions.invoke('delete-company', { body: { companyId, confirmName } });
}

export function addCompanyAdmin(body: Record<string, unknown>) {
  return supabase.functions.invoke('add-company-admin', { body });
}

export function deleteCompanyUser(userId: string) {
  return supabase.functions.invoke('delete-company-user', { body: { userId } });
}

export function resetCompanyUserPassword(userId: string, newPassword: string, companyId: string) {
  return supabase.functions.invoke('reset-user-password', {
    body: { userId, newPassword, companyId },
  });
}
