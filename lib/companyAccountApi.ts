import { supabase } from './supabase';
import type { CompanyAccount, CompanyAccountInput } from './companyAccount';

/** Reads and writes of the owner's customer records (company_accounts, migration 102). */

const ACCOUNT_COLUMNS =
  'company_id, status, plan, monthly_price, billing_cycle, trial_ends_at, renewal_date, vehicle_limit, contact_name, contact_phone, contact_email, notes, updated_at';

export async function listCompanyAccounts(): Promise<CompanyAccount[]> {
  const { data, error } = await supabase.from('company_accounts').select(ACCOUNT_COLUMNS);
  if (error) throw error;
  return (data ?? []).map(normalize);
}

export async function getCompanyAccount(companyId: string): Promise<CompanyAccount | null> {
  const { data, error } = await supabase.from('company_accounts').select(ACCOUNT_COLUMNS).eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  return data ? normalize(data) : null;
}

export async function saveCompanyAccount(companyId: string, input: CompanyAccountInput): Promise<void> {
  const { error } = await supabase.from('company_accounts').upsert({ company_id: companyId, ...input }, { onConflict: 'company_id' });
  if (error) throw error;
}

function normalize(row: any): CompanyAccount {
  return { ...row, monthly_price: row.monthly_price == null ? null : Number(row.monthly_price) } as CompanyAccount;
}
