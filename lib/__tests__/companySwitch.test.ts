jest.mock('../supabase', () => ({ supabase: {} }));
import { lastUsedCompanyId, type MyCompany } from '../companySwitch';

const company = (id: string, last_used_at: string | null): MyCompany => ({
  id, name: id, logo_url: null, status: 'active', vehicles: 0, drivers: 0, last_used_at, is_current: false,
});

describe('lastUsedCompanyId', () => {
  it('picks the company entered most recently', () => {
    expect(lastUsedCompanyId([company('a', '2026-10-01T08:00:00Z'), company('b', '2026-10-20T08:00:00Z'), company('c', null)])).toBe('b');
  });

  it('is null when none was entered yet', () => {
    expect(lastUsedCompanyId([company('a', null)])).toBeNull();
  });
});
