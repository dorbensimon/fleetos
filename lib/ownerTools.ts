import { supabase } from './supabase';

/**
 * The owner's running-the-business tools (migration 109): payments a company
 * made, a dated internal log per company, announcements shown to managers,
 * and the onboarding steps a new company goes through. Owner-only except the
 * live announcement, which every signed-in user may read.
 */

export type PaymentMethod = 'transfer' | 'card' | 'check' | 'cash' | 'other';
export const PAYMENT_METHODS: PaymentMethod[] = ['transfer', 'card', 'check', 'cash', 'other'];

export type CompanyPayment = {
  id: string;
  company_id: string;
  /** First day of the month the payment covers (YYYY-MM-01). */
  period: string;
  amount: number;
  paid_on: string;
  method: PaymentMethod | null;
  note: string | null;
};

export type CompanyNote = { id: string; body: string; created_at: string };

export type Announcement = {
  id: string;
  message: string;
  tone: 'info' | 'warn';
  audience: 'admins' | 'everyone';
  starts_at: string;
  ends_at: string | null;
};

const PAYMENT_COLUMNS = 'id, company_id, period, amount, paid_on, method, note';
const toPayment = (row: any): CompanyPayment => ({ ...row, amount: Number(row.amount) });

/* ---------------- payments ---------------- */

export async function listCompanyPayments(companyId: string): Promise<CompanyPayment[]> {
  const { data, error } = await supabase.from('company_payments').select(PAYMENT_COLUMNS).eq('company_id', companyId).order('period', { ascending: false }).order('paid_on', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toPayment);
}

/** Every payment since `sinceMonth` (YYYY-MM-01), for the revenue chart. */
export async function listPaymentsSince(sinceMonth: string): Promise<CompanyPayment[]> {
  const { data, error } = await supabase.from('company_payments').select(PAYMENT_COLUMNS).gte('period', sinceMonth);
  if (error) throw error;
  return (data ?? []).map(toPayment);
}

export async function addCompanyPayment(input: Omit<CompanyPayment, 'id'>): Promise<void> {
  const { error } = await supabase.from('company_payments').insert(input);
  if (error) throw error;
}

export async function deleteCompanyPayment(id: string): Promise<void> {
  const { error } = await supabase.from('company_payments').delete().eq('id', id);
  if (error) throw error;
}

/** YYYY-MM-01 of a date, in local time. */
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** The last `count` months, oldest first, each with what was paid for it. */
export function paidByMonth(payments: Pick<CompanyPayment, 'period' | 'amount'>[], count: number, now: Date = new Date()): { month: string; total: number }[] {
  const months: { month: string; total: number }[] = [];
  for (let i = count - 1; i >= 0; i--) months.push({ month: monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)), total: 0 });
  const at = new Map(months.map((m, i) => [m.month, i]));
  for (const p of payments) {
    const i = at.get(p.period.slice(0, 10));
    if (i != null) months[i].total += p.amount;
  }
  return months;
}

/* ---------------- notes ---------------- */

export async function listCompanyNotes(companyId: string): Promise<CompanyNote[]> {
  const { data, error } = await supabase.from('company_notes').select('id, body, created_at').eq('company_id', companyId).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addCompanyNote(companyId: string, body: string): Promise<void> {
  const { error } = await supabase.from('company_notes').insert({ company_id: companyId, body: body.trim() });
  if (error) throw error;
}

export async function deleteCompanyNote(id: string): Promise<void> {
  const { error } = await supabase.from('company_notes').delete().eq('id', id);
  if (error) throw error;
}

/* ---------------- announcements ---------------- */

const ANNOUNCEMENT_COLUMNS = 'id, message, tone, audience, starts_at, ends_at';

/** The owner's list: live and past, newest first. */
export async function listAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase.from('system_announcements').select(ANNOUNCEMENT_COLUMNS).order('starts_at', { ascending: false }).limit(20);
  if (error) throw error;
  return (data ?? []) as Announcement[];
}

/** What a signed-in user sees now (RLS returns only live ones meant for them). */
export async function liveAnnouncement(): Promise<Announcement | null> {
  const { data, error } = await supabase.from('system_announcements').select(ANNOUNCEMENT_COLUMNS).order('starts_at', { ascending: false }).limit(1);
  if (error) return null;
  const row = (data?.[0] ?? null) as Announcement | null;
  return row && isLive(row) ? row : null;
}

export function isLive(a: Pick<Announcement, 'starts_at' | 'ends_at'>, now: Date = new Date()): boolean {
  return new Date(a.starts_at) <= now && (!a.ends_at || new Date(a.ends_at) > now);
}

export async function publishAnnouncement(input: Pick<Announcement, 'message' | 'tone' | 'audience'> & { days: number | null }): Promise<void> {
  // One live message at a time: publishing ends the one before it.
  await endAnnouncements();
  const ends = input.days ? new Date(Date.now() + input.days * 86_400_000).toISOString() : null;
  const { error } = await supabase.from('system_announcements').insert({ message: input.message.trim(), tone: input.tone, audience: input.audience, ends_at: ends });
  if (error) throw error;
}

export async function endAnnouncements(): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('system_announcements').update({ ends_at: now }).or(`ends_at.is.null,ends_at.gt.${now}`).lte('starts_at', now);
  if (error) throw error;
}

/* ---------------- onboarding ---------------- */

export type OnboardingStep = { key: 'manager' | 'drivers' | 'form' | 'signed'; done: boolean };

/**
 * Where a new company stands: a manager signed in, drivers were added, a form
 * exists in the driver file, and a first document was signed.
 */
export async function loadOnboarding(companyId: string, managerActive: boolean, drivers: number): Promise<OnboardingStep[]> {
  const [forms, signed] = await Promise.all([
    supabase.from('signing_templates').select('id', { count: 'exact', head: true }).eq('company_id', companyId).is('archived_at', null),
    supabase.from('signature_requests').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'completed'),
  ]);
  return [
    { key: 'manager', done: managerActive },
    { key: 'drivers', done: drivers > 0 },
    { key: 'form', done: (forms.count ?? 0) > 0 },
    { key: 'signed', done: (signed.count ?? 0) > 0 },
  ];
}
