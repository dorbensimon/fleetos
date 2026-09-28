import { buildPlatformOverview, lastSeenLabel, type PlatformRows } from '../platformOverview';
import { filterCompanies } from '../../components/owner/ownerConsole';
import type { Company } from '../supabase';

const NOW = new Date('2026-09-27T10:00:00');

function company(id: string, name: string, extra: Partial<Company> = {}): Company {
  return {
    id,
    name,
    logo_url: null,
    status: 'active',
    company_type: null,
    business_id: null,
    address: null,
    phone: null,
    safety_officer_name: null,
    safety_officer_phone: null,
    created_at: '2026-01-01T00:00:00Z',
    ...extra,
  };
}

function rows(partial: Partial<PlatformRows>): PlatformRows {
  return {
    companies: [],
    profiles: [],
    drivers: [],
    vehicles: [],
    compliance: [],
    assignments: [],
    signatures: [],
    activity: [],
    ...partial,
  };
}

const recent = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();

describe('buildPlatformOverview', () => {
  it('marks a healthy, active company ok and counts its people and vehicles', () => {
    const o = buildPlatformOverview(
      rows({
        companies: [company('a', 'אלמוג')],
        profiles: [
          { company_id: 'a', role: 'admin', must_change_password: false },
          { company_id: 'a', role: 'driver', must_change_password: false },
        ],
        drivers: [{ company_id: 'a', status: 'active', license_expiry: '2027-06-01' }],
        vehicles: [{ id: 'v1', company_id: 'a', status: 'active', plate_number: '1234567', manufacturer: null, model: null }],
        compliance: [{ owner_id: 'v1', company_id: 'a', item_type: 'insurance_mandatory', expiry_date: '2027-01-01' }],
        assignments: [{ vehicle_id: 'v1', company_id: 'a' }],
        signatures: [{ company_id: 'a', status: 'pending' }],
        activity: [{ company_id: 'a', created_at: recent(1) }],
      }),
      NOW,
    );
    const a = o.companies[0];
    expect(a.tone).toBe('ok');
    expect([a.admins, a.drivers, a.vehicles, a.pendingSignatures, a.activity7d]).toEqual([1, 1, 1, 1, 1]);
    expect(o.issues).toEqual([]);
    expect(o.totals.activeCompanies).toBe(1);
  });

  it('flags missing admins, broken vehicles, expired licenses and an expired carrier license', () => {
    const o = buildPlatformOverview(
      rows({
        companies: [company('b', 'בני', { carrier_license_expiry: '2026-09-01' })],
        profiles: [{ company_id: 'b', role: 'driver', must_change_password: true }],
        drivers: [{ company_id: 'b', status: 'active', license_expiry: '2026-08-01' }],
        vehicles: [{ id: 'v2', company_id: 'b', status: 'active', plate_number: '7654321', manufacturer: null, model: null }],
        activity: [{ company_id: 'b', created_at: recent(2) }],
      }),
      NOW,
    );
    const b = o.companies[0];
    expect(b.tone).toBe('bad');
    expect(b.issues.map((i) => i.title)).toEqual(
      expect.arrayContaining(['אין מנהל לחברה', 'רישיון המוביל פג', 'רכב אחד לא תקין', 'רישיון נהיגה אחד פג']),
    );
    expect(b.notActivated).toBe(1);
    expect(b.unassignedVehicles).toBe(1);
  });

  it('leaves a disabled company off the attention queue', () => {
    const o = buildPlatformOverview(rows({ companies: [company('c', 'גל', { status: 'disabled' })] }), NOW);
    expect(o.companies[0].tone).toBe('off');
    expect(o.issues).toEqual([]);
  });

  it('calls out an idle company and buckets activity by day', () => {
    const o = buildPlatformOverview(
      rows({
        companies: [company('d', 'דקל')],
        profiles: [{ company_id: 'd', role: 'admin', must_change_password: false }],
        activity: [{ company_id: 'x', created_at: recent(0) }],
      }),
      NOW,
    );
    expect(o.companies[0].issues[0].title).toBe('אין פעילות בחודש האחרון');
    expect(o.activityByDay).toHaveLength(30);
    expect(o.activityByDay[29].count).toBe(1);
  });
});

describe('filterCompanies', () => {
  it('puts companies that need attention first and filters by state and search', () => {
    const o = buildPlatformOverview(
      rows({
        companies: [company('ok', 'אורן'), company('bad', 'ברוש'), company('off', 'גפן', { status: 'disabled' })],
        profiles: [
          { company_id: 'ok', role: 'admin', must_change_password: false },
          { company_id: 'bad', role: 'driver', must_change_password: false },
        ],
        activity: [{ company_id: 'ok', created_at: recent(1) }, { company_id: 'bad', created_at: recent(1) }],
      }),
      NOW,
    );
    expect(filterCompanies(o.companies, 'all', '', 'health').map((c) => c.company.id)).toEqual(['bad', 'ok', 'off']);
    expect(filterCompanies(o.companies, 'attention', '', 'health').map((c) => c.company.id)).toEqual(['bad']);
    expect(filterCompanies(o.companies, 'all', 'גפ', 'health').map((c) => c.company.id)).toEqual(['off']);
  });
});

describe('lastSeenLabel', () => {
  it('reads recent activity in words', () => {
    expect(lastSeenLabel(null, NOW)).toBe('לא החודש');
    expect(lastSeenLabel(recent(1), NOW)).toBe('אתמול');
    expect(lastSeenLabel(recent(5), NOW)).toBe('לפני 5 ימים');
  });
});

describe('the customer side', () => {
  const account = (company_id: string, extra: Partial<import('../companyAccount').CompanyAccount>) => ({
    company_id,
    status: 'active' as const,
    plan: null,
    monthly_price: null,
    billing_cycle: 'monthly' as const,
    trial_ends_at: null,
    renewal_date: null,
    vehicle_limit: null,
    contact_name: null,
    contact_phone: null,
    contact_email: null,
    notes: null,
    ...extra,
  });
  const admin = (company_id: string) => ({ company_id, role: 'admin', must_change_password: false });
  const inDays = (d: number) => {
    const x = new Date();
    x.setDate(x.getDate() + d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };

  it('adds up monthly revenue from paying and overdue companies only', () => {
    const o = buildPlatformOverview(
      rows({
        companies: [company('a', 'א'), company('b', 'ב'), company('c', 'ג'), company('d', 'ד', { status: 'disabled' })],
        profiles: [admin('a'), admin('b'), admin('c')],
        accounts: [
          account('a', { monthly_price: 500 }),
          account('b', { status: 'overdue', monthly_price: 300 }),
          account('c', { status: 'trial', monthly_price: 900, trial_ends_at: inDays(20) }),
          account('d', { monthly_price: 1000 }),
        ],
      }),
    );
    expect(o.totals.mrr).toBe(800);
    expect([o.totals.paying, o.totals.trials, o.totals.overdue]).toEqual([2, 1, 1]);
    expect(o.companies.find((c) => c.company.id === 'b')!.issues.map((i) => i.title)).toContain('התשלום בפיגור');
  });

  it('flags an ending trial, a passed renewal and a full vehicle quota', () => {
    const o = buildPlatformOverview(
      rows({
        companies: [company('t', 'ניסיון'), company('r', 'חידוש'), company('q', 'מכסה')],
        profiles: [admin('t'), admin('r'), admin('q')],
        vehicles: [{ id: 'v1', company_id: 'q', status: 'active', plate_number: '1', manufacturer: null, model: null }],
        accounts: [
          account('t', { status: 'trial', trial_ends_at: inDays(3) }),
          account('r', { renewal_date: inDays(-2) }),
          account('q', { vehicle_limit: 1 }),
        ],
      }),
    );
    const titles = (id: string) => o.companies.find((c) => c.company.id === id)!.issues.map((i) => i.title);
    expect(titles('t')).toContain('תקופת הניסיון מסתיימת');
    expect(titles('r')).toContain('מועד החידוש עבר');
    expect(titles('q')).toContain('הגיעה למכסת הרכבים');
    expect(o.totals.trialsEndingSoon).toBe(1);
  });
});
