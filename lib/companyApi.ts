// פעולות על חברה: פרטים, משתמשים, מנהלים ומחיקה
import { supabase, Company } from './supabase';

// מביא חברה
/** Owner/company administration data access. Screens should use this module
 * instead of constructing Supabase queries or Edge Function calls inline. */
export function getCompany(companyId: string) {
  return supabase.from('companies').select('*').eq('id', companyId).single<Company>();
}

// רשימת המשתמשים של החברה
export function listCompanyUsers(companyId: string) {
  return supabase.functions.invoke('list-company-users', { body: { companyId } });
}

// מעדכן שם וטלפון של משתמש
export function updateCompanyUser(userId: string, patch: { full_name: string; phone: string }) {
  return supabase.from('profiles').update(patch).eq('id', userId);
}

// מעדכן פרטי חברה (בעלים)
export function updateCompany(companyId: string, patch: Partial<Company>) {
  return supabase.from('companies').update(patch).eq('id', companyId);
}

// שומר את הגדרות החברה (מנהל)
/**
 * The one admin write path for company details (companies RLS is owner-only).
 * Partial: only the keys sent are validated and saved, e.g. `{ landline }`.
 */
export function updateCompanySettings(companyId: string, settings: Record<string, unknown>) {
  return supabase.functions.invoke<{ success: boolean; company: Company }>('update-company-settings', {
    body: { companyId, settings },
  });
}

// מוחק חברה (צריך להקליד את השם לאישור)
export function deleteCompany(companyId: string, confirmName: string) {
  return supabase.functions.invoke('delete-company', { body: { companyId, confirmName } });
}

// מוסיף מנהל לחברה
export function addCompanyAdmin(body: Record<string, unknown>) {
  return supabase.functions.invoke('add-company-admin', { body });
}

// מוחק משתמש
export function deleteCompanyUser(userId: string) {
  return supabase.functions.invoke('delete-company-user', { body: { userId } });
}

// מאפס סיסמה למשתמש
export function resetCompanyUserPassword(userId: string, newPassword: string, companyId: string) {
  return supabase.functions.invoke('reset-user-password', {
    body: { userId, newPassword, companyId },
  });
}
