import { daysUntilExpiry } from './theme';

/**
 * A company as the owner's customer (table company_accounts, migration 102):
 * where it stands commercially, what it pays and when it renews. Only the
 * owner can read or write these rows; the company never sees them. Pure
 * helpers here; reads and writes in lib/companyAccountApi.ts.
 */

export type AccountStatus = 'trial' | 'active' | 'overdue' | 'cancelled';
export type AccountPlan = 'basic' | 'pro' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';

export type CompanyAccount = {
  company_id: string;
  status: AccountStatus;
  plan: AccountPlan | null;
  /** What the company pays per month, before VAT (a yearly deal is entered per month too). */
  monthly_price: number | null;
  billing_cycle: BillingCycle;
  trial_ends_at: string | null;
  renewal_date: string | null;
  vehicle_limit: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  updated_at?: string;
};

export type AccountTone = 'ok' | 'warn' | 'bad' | 'off';

export const ACCOUNT_STATUSES: { value: AccountStatus; label: string; tone: AccountTone }[] = [
  { value: 'trial', label: 'ניסיון', tone: 'warn' },
  { value: 'active', label: 'משלם', tone: 'ok' },
  { value: 'overdue', label: 'בפיגור', tone: 'bad' },
  { value: 'cancelled', label: 'בוטל', tone: 'off' },
];

export const ACCOUNT_PLANS: { value: AccountPlan; label: string }[] = [
  { value: 'basic', label: 'בסיסי' },
  { value: 'pro', label: 'מקצועי' },
  { value: 'enterprise', label: 'ארגוני' },
];

export const BILLING_CYCLES: { value: BillingCycle; label: string }[] = [
  { value: 'monthly', label: 'חודשי' },
  { value: 'yearly', label: 'שנתי' },
];

export function statusLabel(status: AccountStatus | null | undefined): string {
  return ACCOUNT_STATUSES.find((s) => s.value === status)?.label ?? 'לא הוגדר';
}

export function statusTone(status: AccountStatus | null | undefined): AccountTone {
  return ACCOUNT_STATUSES.find((s) => s.value === status)?.tone ?? 'off';
}

export function planLabel(plan: AccountPlan | null | undefined): string {
  return ACCOUNT_PLANS.find((p) => p.value === plan)?.label ?? 'ללא מסלול';
}

/** ₪1,250, or "—" when no price was entered. */
export function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `₪${Math.round(value).toLocaleString('he-IL')}`;
}

/** ₪1.7K / ₪12K: the same money in a tile that has room for five characters. */
export function formatMoneyCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  if (Math.abs(value) < 1000) return `₪${Math.round(value)}`;
  const k = value / 1000;
  return `₪${k < 10 ? (Math.round(k * 10) / 10).toString() : Math.round(k).toString()}K`;
}

/** Monthly revenue the account brings in right now: paying (or overdue) accounts only. */
export function accountMrr(account: CompanyAccount | null | undefined): number {
  if (!account || (account.status !== 'active' && account.status !== 'overdue')) return 0;
  return Number(account.monthly_price ?? 0) || 0;
}

/** The one date that matters next for this account, in words. */
export function accountNextStep(account: CompanyAccount | null | undefined): { label: string; tone: AccountTone } | null {
  if (!account) return null;
  if (account.status === 'trial' && account.trial_ends_at) {
    const d = daysUntilExpiry(account.trial_ends_at);
    if (d == null) return null;
    if (d < 0) return { label: 'הניסיון הסתיים', tone: 'bad' };
    if (d === 0) return { label: 'הניסיון מסתיים היום', tone: 'bad' };
    return { label: d === 1 ? 'יום אחרון לניסיון מחר' : `עוד ${d} ימי ניסיון`, tone: d <= 7 ? 'warn' : 'ok' };
  }
  if ((account.status === 'active' || account.status === 'overdue') && account.renewal_date) {
    const d = daysUntilExpiry(account.renewal_date);
    if (d == null) return null;
    if (d < 0) return { label: 'מועד החידוש עבר', tone: 'bad' };
    if (d === 0) return { label: 'חידוש היום', tone: 'warn' };
    return { label: d === 1 ? 'חידוש מחר' : `חידוש בעוד ${d} ימים`, tone: d <= 14 ? 'warn' : 'ok' };
  }
  return null;
}

export type CompanyAccountInput = Omit<CompanyAccount, 'company_id' | 'updated_at'>;

// ── Form helpers ─────────────────────────────────────────────────────────

/** The account as editable strings, so inputs can hold half-typed values. */
export type AccountForm = {
  status: AccountStatus;
  plan: AccountPlan | '';
  monthlyPrice: string;
  billingCycle: BillingCycle;
  trialEndsAt: string;
  renewalDate: string;
  vehicleLimit: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  notes: string;
};

function isoIn(days: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function emptyAccountForm(now: Date = new Date()): AccountForm {
  return {
    status: 'trial',
    plan: '',
    monthlyPrice: '',
    billingCycle: 'monthly',
    trialEndsAt: isoIn(30, now),
    renewalDate: '',
    vehicleLimit: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    notes: '',
  };
}

export function accountToForm(account: CompanyAccount | null): AccountForm {
  if (!account) return emptyAccountForm();
  return {
    status: account.status,
    plan: account.plan ?? '',
    monthlyPrice: account.monthly_price == null ? '' : String(account.monthly_price),
    billingCycle: account.billing_cycle,
    trialEndsAt: account.trial_ends_at ?? '',
    renewalDate: account.renewal_date ?? '',
    vehicleLimit: account.vehicle_limit == null ? '' : String(account.vehicle_limit),
    contactName: account.contact_name ?? '',
    contactPhone: account.contact_phone ?? '',
    contactEmail: account.contact_email ?? '',
    notes: account.notes ?? '',
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Field errors keyed by AccountForm field; empty when the form can be saved. */
export function validateAccountForm(form: AccountForm): Partial<Record<keyof AccountForm, string>> {
  const errors: Partial<Record<keyof AccountForm, string>> = {};
  const price = form.monthlyPrice.trim();
  if (price && !(Number(price) >= 0)) errors.monthlyPrice = 'סכום לא תקין';
  const limit = form.vehicleLimit.trim();
  if (limit && !(Number.isInteger(Number(limit)) && Number(limit) > 0)) errors.vehicleLimit = 'מספר שלם גדול מ-0';
  if (form.trialEndsAt && !DATE_RE.test(form.trialEndsAt)) errors.trialEndsAt = 'תאריך לא תקין';
  if (form.renewalDate && !DATE_RE.test(form.renewalDate)) errors.renewalDate = 'תאריך לא תקין';
  if (form.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) errors.contactEmail = 'כתובת מייל לא תקינה';
  if (form.notes.length > 2000) errors.notes = 'עד 2000 תווים';
  return errors;
}

export function formToAccountInput(form: AccountForm): CompanyAccountInput {
  const text = (v: string) => v.trim() || null;
  return {
    status: form.status,
    plan: form.plan || null,
    monthly_price: form.monthlyPrice.trim() ? Number(form.monthlyPrice) : null,
    billing_cycle: form.billingCycle,
    trial_ends_at: form.trialEndsAt || null,
    renewal_date: form.renewalDate || null,
    vehicle_limit: form.vehicleLimit.trim() ? Number(form.vehicleLimit) : null,
    contact_name: text(form.contactName),
    contact_phone: form.contactPhone.replace(/[^\d+]/g, '') || null,
    contact_email: text(form.contactEmail),
    notes: text(form.notes),
  };
}
