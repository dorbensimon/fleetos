// קריאה ושמירה של חשבונות הלקוח של הבעלים
import { supabase } from './supabase';
import type { CompanyAccount, CompanyAccountInput } from './companyAccount';

/** Reads and writes of the owner's customer records (company_accounts, migration 102). */

// העמודות שמביאים מהטבלה
const ACCOUNT_COLUMNS =
  'company_id, status, plan, monthly_price, billing_cycle, trial_ends_at, renewal_date, vehicle_limit, contact_name, contact_phone, contact_email, notes, updated_at';

// רשימת כל החשבונות
export async function listCompanyAccounts(): Promise<CompanyAccount[]> {
  const { data, error } = await supabase.from('company_accounts').select(ACCOUNT_COLUMNS);
  if (error) throw error;
  return (data ?? []).map(normalize);
}

// חשבון של חברה אחת
export async function getCompanyAccount(companyId: string): Promise<CompanyAccount | null> {
  const { data, error } = await supabase.from('company_accounts').select(ACCOUNT_COLUMNS).eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  return data ? normalize(data) : null;
}

// שומר חשבון
export async function saveCompanyAccount(companyId: string, input: CompanyAccountInput): Promise<void> {
  const { error } = await supabase.from('company_accounts').upsert({ company_id: companyId, ...input }, { onConflict: 'company_id' });
  if (error) throw error;
}

// מסדר שורה מהשרת לצורה אחידה
function normalize(row: any): CompanyAccount {
  return { ...row, monthly_price: row.monthly_price == null ? null : Number(row.monthly_price) } as CompanyAccount;
}
