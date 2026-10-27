// בודק אם מייל כבר שייך לחשבון קיים
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type ExistingAccount = { id: string; role: string | null; fullName: string | null };

// The account that already uses this email, or null when it is free.
export async function findAccountByEmail(adminClient: SupabaseClient, email: string): Promise<ExistingAccount | null> {
  const { data, error } = await adminClient.rpc('find_account_by_email', { p_email: email });
  if (error) throw error;
  const row = (data ?? [])[0] as { id: string; role: string | null; full_name: string | null } | undefined;
  return row ? { id: row.id, role: row.role, fullName: row.full_name } : null;
}

// Why an existing account cannot be made a company manager; null when it can.
export function managerLinkBlock(account: ExistingAccount): string | null {
  if (account.role === 'admin') return null;
  if (account.role === 'driver') return 'המייל שייך לנהג ולא ניתן לשייך אותו כמנהל';
  if (account.role === 'owner') return 'לא ניתן לשייך את חשבון הבעלים כמנהל חברה';
  return 'המייל כבר רשום במערכת ולא ניתן לשייך אותו';
}
