jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

import { supabase } from '../supabase';
import {
  assignDriverToVehicle,
  unassignVehicleDriver,
  setPrimaryVehicleDriver,
  getVehicle,
  getDriver,
  listVehicles,
  createDriverAccount,
  deleteAllCompanyDrivers,
} from '../adminApi';

/**
 * Builds a `supabase.from()` chain mock, recording every call it receives
 * so assertions can inspect exactly which filters/mutations were applied —
 * needed here because the same builder instance is reused across the whole
 * chain (select().eq().is().order() etc all return `this`).
 */
function chain(result: { data: any; error: any; count?: number }) {
  const builder: any = { __calls: {} as Record<string, any[][]> };
  ['select', 'eq', 'neq', 'in', 'is', 'gte', 'lt', 'order', 'insert', 'update', 'delete', 'upsert'].forEach((m) => {
    builder[m] = jest.fn((...args: any[]) => {
      builder.__calls[m] = builder.__calls[m] ?? [];
      builder.__calls[m].push(args);
      return builder;
    });
  });
  builder.single = jest.fn(() => Promise.resolve(result));
  builder.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function mockFromSequence(...builders: any[]) {
  const fromMock = supabase.from as jest.Mock;
  fromMock.mockReset();
  builders.forEach((b) => fromMock.mockReturnValueOnce(b));
}

const driverA = {
  id: 'a1',
  company_id: 'c1',
  vehicle_id: 'v1',
  driver_id: 'd-a',
  is_primary: true,
  assigned_at: '2026-01-01',
  unassigned_at: null,
};

const driverB = {
  id: 'a2',
  company_id: 'c1',
  vehicle_id: 'v1',
  driver_id: 'd-b',
  is_primary: false,
  assigned_at: '2026-01-02',
  unassigned_at: null,
};

describe('assignDriverToVehicle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a driver who is already actively assigned to the vehicle', async () => {
    mockFromSequence(chain({ data: [driverA], error: null }));

    await expect(assignDriverToVehicle('v1', 'd-a', false)).rejects.toThrow('הנהג כבר משויך לרכב זה');
    // No insert should have been attempted.
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('rejects a 3rd driver once the vehicle already has 2 active drivers', async () => {
    mockFromSequence(chain({ data: [driverA, driverB], error: null }));

    await expect(assignDriverToVehicle('v1', 'd-c', false)).rejects.toThrow(
      'לא ניתן לשייך יותר משני נהגים לרכב אחד'
    );
  });

  it('rejects setting a 2nd primary driver while one is already active', async () => {
    mockFromSequence(chain({ data: [driverA], error: null }));

    await expect(assignDriverToVehicle('v1', 'd-b', true)).rejects.toThrow(
      'לרכב זה כבר יש נהג ראשי פעיל — יש להסיר אותו לפני קביעת נהג ראשי חדש'
    );
  });

  it('inserts the assignment and returns it when there is no conflict', async () => {
    const inserted = { ...driverB, id: 'a3' };
    const listBuilder = chain({ data: [driverA], error: null });
    const insertBuilder = chain({ data: inserted, error: null });
    mockFromSequence(listBuilder, insertBuilder);

    const result = await assignDriverToVehicle('v1', 'd-new', false);

    expect(result).toEqual(inserted);
    expect(insertBuilder.insert).toHaveBeenCalledWith({
      vehicle_id: 'v1',
      driver_id: 'd-new',
      is_primary: false,
    });
  });

  it('propagates a DB error from the insert (e.g. RLS/trigger rejection)', async () => {
    const listBuilder = chain({ data: [], error: null });
    const insertBuilder = chain({ data: null, error: { message: 'permission denied', code: '42501' } });
    mockFromSequence(listBuilder, insertBuilder);

    await expect(assignDriverToVehicle('v1', 'd-new', false)).rejects.toEqual({
      message: 'permission denied',
      code: '42501',
    });
  });
});

describe('unassignVehicleDriver', () => {
  beforeEach(() => jest.clearAllMocks());

  it('soft-deletes by setting unassigned_at rather than removing the row', async () => {
    const builder = chain({ data: null, error: null });
    mockFromSequence(builder);

    await unassignVehicleDriver('a1');

    expect(builder.update).toHaveBeenCalledTimes(1);
    const [patch] = builder.update.mock.calls[0];
    expect(patch).toHaveProperty('unassigned_at');
    expect(typeof patch.unassigned_at).toBe('string');
    expect(builder.eq).toHaveBeenCalledWith('id', 'a1');
  });

  it('throws when the update fails', async () => {
    mockFromSequence(chain({ data: null, error: { message: 'boom' } }));

    await expect(unassignVehicleDriver('a1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('setPrimaryVehicleDriver', () => {
  beforeEach(() => jest.clearAllMocks());

  it('demotes the current primary before promoting the target assignment', async () => {
    const demoteBuilder = chain({ data: null, error: null });
    const promoteBuilder = chain({ data: null, error: null });
    mockFromSequence(demoteBuilder, promoteBuilder);

    await setPrimaryVehicleDriver('v1', 'a2');

    expect(demoteBuilder.update).toHaveBeenCalledWith({ is_primary: false });
    expect(demoteBuilder.neq).toHaveBeenCalledWith('id', 'a2');
    expect(promoteBuilder.update).toHaveBeenCalledWith({ is_primary: true });
  });

  it('stops and throws if the demote step fails, without promoting', async () => {
    const demoteBuilder = chain({ data: null, error: { message: 'demote failed' } });
    mockFromSequence(demoteBuilder);

    await expect(setPrimaryVehicleDriver('v1', 'a2')).rejects.toEqual({ message: 'demote failed' });
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });
});

describe('getVehicle — not-found vs RLS/permission errors', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null for a genuine "no rows" result (PGRST116)', async () => {
    mockFromSequence(chain({ data: null, error: { code: 'PGRST116', message: 'no rows' } }));

    const result = await getVehicle('missing-id');
    expect(result).toBeNull();
  });

  it('propagates an RLS/permission error instead of masking it as "not found"', async () => {
    mockFromSequence(chain({ data: null, error: { code: '42501', message: 'permission denied' } }));

    await expect(getVehicle('other-company-vehicle')).rejects.toEqual({
      code: '42501',
      message: 'permission denied',
    });
  });
});

describe('getDriver — not-found vs RLS/permission errors', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when the driver_details row genuinely does not exist', async () => {
    const detailsBuilder = chain({ data: null, error: { code: 'PGRST116' } });
    const profileBuilder = chain({ data: null, error: { code: 'PGRST116' } });
    mockFromSequence(detailsBuilder, profileBuilder);

    const result = await getDriver('missing-id');
    expect(result).toBeNull();
  });

  it('propagates a non-not-found error from driver_details (RLS-blocked cross-company read)', async () => {
    const detailsBuilder = chain({ data: null, error: { code: '42501', message: 'permission denied' } });
    const profileBuilder = chain({ data: null, error: { code: 'PGRST116' } });
    mockFromSequence(detailsBuilder, profileBuilder);

    await expect(getDriver('other-company-driver')).rejects.toEqual({
      code: '42501',
      message: 'permission denied',
    });
  });
});

describe('listVehicles', () => {
  beforeEach(() => jest.clearAllMocks());

  it('excludes archived vehicles by default', async () => {
    const builder = chain({ data: [], error: null });
    mockFromSequence(builder);

    await listVehicles('c1');

    expect(builder.neq).toHaveBeenCalledWith('status', 'archived');
  });

  it('includes archived vehicles when explicitly requested', async () => {
    const builder = chain({ data: [], error: null });
    mockFromSequence(builder);

    await listVehicles('c1', true);

    expect(builder.neq).not.toHaveBeenCalled();
  });
});

describe('createDriverAccount — edge function error mapping', () => {
  beforeEach(() => jest.clearAllMocks());

  const payload = {
    companyId: 'c1',
    email: 'a@b.com',
    password: 'pw',
    fullName: 'Test',
    phone: '0500000000',
    details: {},
  };

  it('returns ok with the new driver id on success', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
      data: { success: true, driverId: 'new-id' },
      error: null,
    });

    const result = await createDriverAccount(payload);
    expect(result).toEqual({ ok: true, driverId: 'new-id' });
  });

  it('surfaces a business error returned in the function body', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
      data: { success: false, error: 'האימייל כבר קיים' },
      error: null,
    });

    const result = await createDriverAccount(payload);
    expect(result).toEqual({ ok: false, error: 'האימייל כבר קיים' });
  });

  it('falls back to a generic Hebrew message when nothing else is available', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: { message: 'network failure' },
    });

    const result = await createDriverAccount(payload);
    expect(result).toEqual({ ok: false, error: 'יצירת הנהג נכשלה' });
  });

  it('prefers the JSON error body from the function error context when present', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: async () => ({ error: 'החברה מושבתת' }) },
      },
    });

    const result = await createDriverAccount(payload);
    expect(result).toEqual({ ok: false, error: 'החברה מושבתת' });
  });
});

describe('deleteAllCompanyDrivers — edge function result mapping', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the counts and failed ids reported by the function', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
      data: { success: true, deletedCount: 4, totalCount: 5, failedIds: ['d-1'] },
      error: null,
    });

    const result = await deleteAllCompanyDrivers('c1');
    expect(result).toEqual({ ok: true, deletedCount: 4, totalCount: 5, failedIds: ['d-1'] });
  });

  it('returns a failure result when the function reports an error', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
      data: { success: false, error: 'אין הרשאה' },
      error: null,
    });

    const result = await deleteAllCompanyDrivers('c1');
    expect(result).toEqual({ ok: false, error: 'אין הרשאה' });
  });
});
