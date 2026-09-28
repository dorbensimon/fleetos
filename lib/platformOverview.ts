import type { Company } from './supabase';
import type { ComplianceItem, Vehicle, VehicleDriverWithProfile } from './adminApi';
import { vehicleAttentionGroups } from './vehicleAttention';
import { daysUntilExpiry, expiryState, formatDate } from './theme';
import { accountMrr, type CompanyAccount } from './companyAccount';
import { t } from './i18n';

/**
 * The owner's control room, computed from raw rows. Only counts, dates and
 * statuses cross into the screen: no names, IDs, phones or document contents,
 * so the platform view never shows one company's people to anyone scanning
 * the whole system. Pure functions, so the rules are testable without a
 * database.
 */

export type PlatformRows = {
  companies: Company[];
  profiles: { company_id: string | null; role: string; must_change_password: boolean | null }[];
  drivers: { company_id: string; status: string | null; license_expiry: string | null }[];
  vehicles: Pick<Vehicle, 'id' | 'company_id' | 'status' | 'plate_number' | 'manufacturer' | 'model'>[];
  compliance: Pick<ComplianceItem, 'owner_id' | 'company_id' | 'item_type' | 'expiry_date'>[];
  assignments: { vehicle_id: string; company_id: string }[];
  signatures: { company_id: string; status: string }[];
  activity: { company_id: string | null; created_at: string }[];
  /** The owner's customer records (migration 102); missing before it. */
  accounts?: CompanyAccount[];
};

export type Tone = 'ok' | 'warn' | 'bad' | 'off';

export type CompanyIssue = {
  companyId: string;
  companyName: string;
  tone: 'warn' | 'bad';
  title: string;
  detail: string;
};

export type CompanyHealth = {
  company: Company;
  active: boolean;
  admins: number;
  drivers: number;
  vehicles: number;
  /** Accounts still on the temporary password they were created with. */
  notActivated: number;
  adminsNotActivated: number;
  /** Vehicles without valid mandatory insurance or with an expired registration. */
  vehicleIssues: number;
  unassignedVehicles: number;
  licensesExpired: number;
  licensesSoon: number;
  pendingSignatures: number;
  lastActivity: string | null;
  activity7d: number;
  /** The company as the owner's customer, or null before one was set up. */
  account: CompanyAccount | null;
  /** Monthly revenue from this company right now. */
  mrr: number;
  issues: CompanyIssue[];
  tone: Tone;
};

export type PlatformOverview = {
  companies: CompanyHealth[];
  totals: {
    companies: number;
    activeCompanies: number;
    admins: number;
    drivers: number;
    vehicles: number;
    pendingSignatures: number;
    notActivated: number;
    activity7d: number;
    needAttention: number;
    /** Monthly revenue from paying (and overdue) companies. */
    mrr: number;
    paying: number;
    trials: number;
    overdue: number;
    /** Paying companies that renew in the next 30 days, and trials that end in the next 7. */
    renewalsSoon: number;
    trialsEndingSoon: number;
  };
  issues: CompanyIssue[];
  /** Actions per day, oldest first, ending today. */
  activityByDay: { day: string; count: number }[];
};

export const ACTIVITY_DAYS = 30;
const IDLE_DAYS = 30;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`;
}

function groupBy<T>(rows: T[], key: (row: T) => string | null | undefined): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (!k) continue;
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

export function buildPlatformOverview(rows: PlatformRows, now: Date = new Date()): PlatformOverview {
  const profilesBy = groupBy(rows.profiles, (p) => p.company_id);
  const driversBy = groupBy(
    rows.drivers.filter((d) => d.status !== 'archived'),
    (d) => d.company_id,
  );
  const vehiclesBy = groupBy(rows.vehicles, (v) => v.company_id);
  const complianceBy = groupBy(rows.compliance, (c) => c.owner_id);
  const assignedBy = groupBy(rows.assignments, (a) => a.vehicle_id);
  const signaturesBy = groupBy(rows.signatures.filter((s) => s.status === 'pending'), (s) => s.company_id);
  const activityBy = groupBy(rows.activity, (a) => a.company_id);
  const accountBy = new Map((rows.accounts ?? []).map((a) => [a.company_id, a]));

  const weekAgo = now.getTime() - 7 * 86_400_000;
  const idleSince = now.getTime() - IDLE_DAYS * 86_400_000;

  const companies: CompanyHealth[] = rows.companies.map((company) => {
    const active = company.status === 'active';
    const people = profilesBy.get(company.id) ?? [];
    const admins = people.filter((p) => p.role === 'admin');
    const drivers = driversBy.get(company.id) ?? [];
    const vehicles = (vehiclesBy.get(company.id) ?? []).filter((v) => v.status !== 'archived');
    const activity = activityBy.get(company.id) ?? [];

    const groups = vehicleAttentionGroups(
      vehicles as Vehicle[],
      new Map(vehicles.map((v) => [v.id, (complianceBy.get(v.id) ?? []) as ComplianceItem[]])),
      new Map(vehicles.map((v) => [v.id, (assignedBy.get(v.id) ?? []) as unknown as VehicleDriverWithProfile[]])),
    );
    const problemVehicles = new Set(
      groups.filter((g) => g.kind !== 'unassigned').flatMap((g) => g.items.map((i) => i.vehicleId)),
    );
    const unassigned = groups.find((g) => g.kind === 'unassigned')?.items.length ?? 0;

    const licenseStates = drivers.map((d) => expiryState(d.license_expiry));
    const licensesExpired = licenseStates.filter((s) => s === 'expired').length;
    const licensesSoon = licenseStates.filter((s) => s === 'soon').length;

    let lastActivity: string | null = null;
    let activity7d = 0;
    for (const a of activity) {
      if (!lastActivity || a.created_at > lastActivity) lastActivity = a.created_at;
      if (new Date(a.created_at).getTime() >= weekAgo) activity7d += 1;
    }

    const notActivated = people.filter((p) => (p.role === 'admin' || p.role === 'driver') && p.must_change_password).length;
    const adminsNotActivated = admins.filter((p) => p.must_change_password).length;

    const account = accountBy.get(company.id) ?? null;
    const issues: CompanyIssue[] = [];
    const add = (tone: CompanyIssue['tone'], title: string, detail: string) =>
      issues.push({ companyId: company.id, companyName: company.name, tone, title, detail });

    // A disabled company is switched off on purpose; its paperwork isn't the owner's problem today.
    if (active) {
      if (admins.length === 0) add('bad', t('owner.health.noManager'), t('owner.health.noManagerDetail'));
      else if (adminsNotActivated === admins.length) {
        add('warn', admins.length === 1 ? t('owner.health.managerNotLoggedIn') : t('owner.health.managersNotLoggedIn'), t('owner.health.tempPasswordDetail'));
      }

      const carrierDays = daysUntilExpiry(company.carrier_license_expiry ?? null);
      if (carrierDays != null && carrierDays < 0) add('bad', t('owner.health.carrierLicenseExpired'), t('owner.health.expiredOn', { v1: formatDate(company.carrier_license_expiry!) }));
      else if (carrierDays != null && carrierDays <= 30) {
        add('warn', t('owner.health.carrierLicenseExpiring'), carrierDays === 0 ? t('expiry.expiredToday') : t('common.inTime', { v1: plural(carrierDays, t('common.oneDay'), t('common.days')) }));
      }

      if (problemVehicles.size) {
        add('bad', plural(problemVehicles.size, t('owner.health.oneVehicleInvalid'), t('owner.health.vehiclesInvalid')), t('owner.health.vehiclesInvalidDetail'));
      }
      if (licensesExpired) add('bad', plural(licensesExpired, t('owner.health.oneLicenseExpired'), t('owner.health.licensesExpired')), t('owner.health.licensesExpiredDetail'));

      if (people.length > 0 && (!lastActivity || new Date(lastActivity).getTime() < idleSince)) {
        add('warn', t('owner.health.noActivity'), t('owner.health.noActivityDetail'));
      }

      // The customer side: money and dates the owner has to act on.
      if (account?.status === 'overdue') add('bad', t('owner.health.paymentOverdue'), t('owner.health.paymentOverdueDetail'));
      if (account?.status === 'trial' && account.trial_ends_at) {
        const d = daysUntilExpiry(account.trial_ends_at);
        if (d != null && d < 0) add('bad', t('owner.health.trialEnded'), t('owner.health.endedOn', { v1: formatDate(account.trial_ends_at) }));
        else if (d != null && d <= 7) add('warn', t('owner.health.trialEnding'), d === 0 ? t('owner.health.endsToday') : t('common.inTime', { v1: plural(d, t('common.oneDay'), t('common.days')) }));
      }
      if ((account?.status === 'active' || account?.status === 'overdue') && account.renewal_date) {
        const d = daysUntilExpiry(account.renewal_date);
        if (d != null && d < 0) add('bad', t('account.renewalPassed'), t('owner.health.wasOn', { v1: formatDate(account.renewal_date) }));
        else if (d != null && d <= 14) add('warn', t('owner.health.renewalApproaching'), d === 0 ? t('common.today') : t('common.inTime', { v1: plural(d, t('common.oneDay'), t('common.days')) }));
      }
      if (account?.vehicle_limit && vehicles.length >= account.vehicle_limit) {
        add('warn', t('owner.health.vehicleQuotaReached'), t('owner.health.vehicleQuotaDetail', { length: vehicles.length, vehicle_limit: account.vehicle_limit }));
      }
    }

    // Worst first, so the one line a card has room for is the most urgent.
    issues.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'bad' ? -1 : 1));
    const tone: Tone = !active ? 'off' : issues.some((i) => i.tone === 'bad') ? 'bad' : issues.length ? 'warn' : 'ok';

    return {
      company,
      active,
      admins: admins.length,
      drivers: drivers.length,
      vehicles: vehicles.length,
      notActivated,
      adminsNotActivated,
      vehicleIssues: problemVehicles.size,
      unassignedVehicles: unassigned,
      licensesExpired,
      licensesSoon,
      pendingSignatures: signaturesBy.get(company.id)?.length ?? 0,
      lastActivity,
      activity7d,
      account,
      mrr: active ? accountMrr(account) : 0,
      issues,
      tone,
    };
  });

  const days: { day: string; count: number }[] = [];
  const index = new Map<string, number>();
  for (let i = ACTIVITY_DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    index.set(dayKey(d), days.length);
    days.push({ day: dayKey(d), count: 0 });
  }
  for (const a of rows.activity) {
    const at = index.get(dayKey(new Date(a.created_at)));
    if (at != null) days[at].count += 1;
  }

  const issues = companies
    .flatMap((c) => c.issues)
    .sort((a, b) => (a.tone === b.tone ? a.companyName.localeCompare(b.companyName, 'he') : a.tone === 'bad' ? -1 : 1));

  const sum = (pick: (c: CompanyHealth) => number) => companies.reduce((n, c) => n + pick(c), 0);

  return {
    companies,
    totals: {
      companies: companies.length,
      activeCompanies: companies.filter((c) => c.active).length,
      admins: sum((c) => c.admins),
      drivers: sum((c) => c.drivers),
      vehicles: sum((c) => c.vehicles),
      pendingSignatures: sum((c) => c.pendingSignatures),
      notActivated: sum((c) => (c.active ? c.notActivated : 0)),
      activity7d: sum((c) => c.activity7d),
      needAttention: companies.filter((c) => c.tone === 'bad' || c.tone === 'warn').length,
      mrr: sum((c) => c.mrr),
      paying: companies.filter((c) => c.active && (c.account?.status === 'active' || c.account?.status === 'overdue')).length,
      trials: companies.filter((c) => c.active && c.account?.status === 'trial').length,
      overdue: companies.filter((c) => c.active && c.account?.status === 'overdue').length,
      renewalsSoon: companies.filter((c) => {
        const a = c.account;
        if (!c.active || !a?.renewal_date || (a.status !== 'active' && a.status !== 'overdue')) return false;
        const d = daysUntilExpiry(a.renewal_date);
        return d != null && d <= 30;
      }).length,
      trialsEndingSoon: companies.filter((c) => {
        const a = c.account;
        if (!c.active || a?.status !== 'trial' || !a.trial_ends_at) return false;
        const d = daysUntilExpiry(a.trial_ends_at);
        return d != null && d <= 7;
      }).length,
    },
    issues,
    activityByDay: days,
  };
}

/** "עכשיו", "לפני 3 שעות", "אתמול", "לפני 12 ימים", or the date once it's old. */
export function lastSeenLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return t('time.notThisMonth');
  const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t('time.now');
  if (mins < 60) return t('time.minutesAgo', { mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('time.hoursAgo', { hours });
  const daysAgo = Math.floor(hours / 24);
  if (daysAgo === 1) return t('time.yesterday');
  if (daysAgo < 30) return t('time.daysAgoLong', { daysAgo });
  return formatDate(iso);
}
