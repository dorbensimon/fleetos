jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: { signOut: jest.fn() },
  },
}));

import { supabase } from '../supabase';
import { resolveRouteForUser, ROLE_ROUTES } from '../session';

/**
 * Builds a `supabase.from()` chain mock. Every chain method (select/eq/
 * single/...) returns the same object, which resolves to `result` when
 * awaited or when `.single()` is called — mirroring how the real
 * postgrest-js builder is both chainable and thenable.
 */
function chain(result: { data: any; error: any }) {
  const builder: any = {};
  ['select', 'eq', 'neq', 'in', 'is', 'gte', 'lt', 'order', 'insert', 'update', 'delete', 'upsert'].forEach((m) => {
    builder[m] = jest.fn(() => builder);
  });
  builder.single = jest.fn(() => Promise.resolve(result));
  builder.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

const baseProfile = {
  id: 'u1',
  role: 'admin' as const,
  company_id: 'c1',
  job_title: null,
  full_name: 'Test User',
  phone: null,
  must_change_password: false,
  created_at: '2026-01-01',
};

describe('resolveRouteForUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('signs out and returns an error when the profile fails to load', async () => {
    (supabase.from as jest.Mock).mockReturnValueOnce(chain({ data: null, error: { message: 'boom' } }));

    const result = await resolveRouteForUser('u1');

    expect(result).toEqual({ ok: false, error: 'שגיאה בטעינת פרופיל המשתמש' });
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('signs out and returns an error when the profile row is missing', async () => {
    (supabase.from as jest.Mock).mockReturnValueOnce(chain({ data: null, error: null }));

    const result = await resolveRouteForUser('u1');

    expect(result).toEqual({ ok: false, error: 'שגיאה בטעינת פרופיל המשתמש' });
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('routes to SetPassword before any company check when must_change_password is true', async () => {
    (supabase.from as jest.Mock).mockReturnValueOnce(
      chain({ data: { ...baseProfile, must_change_password: true }, error: null })
    );

    const result = await resolveRouteForUser('u1');

    expect(result).toEqual({ ok: true, route: 'SetPassword' });
    // Only the profiles lookup should have happened — no company query.
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('routes an owner straight to OwnerHome without checking a company', async () => {
    (supabase.from as jest.Mock).mockReturnValueOnce(
      chain({ data: { ...baseProfile, role: 'owner', company_id: null }, error: null })
    );

    const result = await resolveRouteForUser('u1');

    expect(result).toEqual({ ok: true, route: 'OwnerHome' });
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('routes an admin to AdminHome when their company is active', async () => {
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(chain({ data: baseProfile, error: null }))
      .mockReturnValueOnce(chain({ data: { status: 'active' }, error: null }));

    const result = await resolveRouteForUser('u1');

    expect(result).toEqual({ ok: true, route: 'AdminHome' });
  });

  it('blocks a driver with no company assignment', async () => {
    (supabase.from as jest.Mock).mockReturnValueOnce(
      chain({ data: { ...baseProfile, role: 'driver', company_id: null }, error: null })
    );

    const result = await resolveRouteForUser('u1');

    expect(result).toEqual({ ok: false, error: 'המשתמש אינו משויך לחברה' });
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('blocks an unknown role instead of navigating to an undefined route', async () => {
    (supabase.from as jest.Mock).mockReturnValueOnce(
      chain({ data: { ...baseProfile, role: 'super-admin' }, error: null })
    );

    const result = await resolveRouteForUser('u1');

    expect(result).toEqual({ ok: false, error: 'תפקיד המשתמש אינו תקין' });
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('signs out and blocks access when the company is disabled', async () => {
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(chain({ data: baseProfile, error: null }))
      .mockReturnValueOnce(chain({ data: { status: 'disabled' }, error: null }));

    const result = await resolveRouteForUser('u1');

    expect(result).toEqual({ ok: false, error: 'החשבון מושבת זמנית' });
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('signs out and returns an error when the company fails to load', async () => {
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(chain({ data: baseProfile, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: { message: 'boom' } }));

    const result = await resolveRouteForUser('u1');

    expect(result).toEqual({ ok: false, error: 'שגיאה בטעינת נתוני החברה' });
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('maps every role to its expected home route', () => {
    expect(ROLE_ROUTES).toEqual({
      owner: 'OwnerHome',
      admin: 'AdminHome',
      driver: 'DriverHome',
    });
  });
});
