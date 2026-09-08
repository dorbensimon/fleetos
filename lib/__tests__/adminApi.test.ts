jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    auth: { getUser: jest.fn() },
    functions: { invoke: jest.fn() },
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  assignDriverToVehicle,
  unassignVehicleDriver,
  setPrimaryVehicleDriver,
  getVehicle,
  getDriver,
  listDrivers,
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
  ['select', 'eq', 'neq', 'in', 'is', 'gte', 'lt', 'order', 'range', 'insert', 'update', 'delete', 'upsert'].forEach((m) => {
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
    mockFromSequence(listBuilder);
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: inserted, error: null });

    const result = await assignDriverToVehicle('v1', 'd-new', false);

    expect(result).toEqual(inserted);
    expect(supabase.rpc).toHaveBeenCalledWith('assign_vehicle_driver', expect.objectContaining({
      p_vehicle_id: 'v1', p_driver_id: 'd-new', p_is_primary: false,
    }));
  });

  it('propagates a DB error from the insert (e.g. RLS/trigger rejection)', async () => {
    const listBuilder = chain({ data: [], error: null });
    mockFromSequence(listBuilder);
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message: 'permission denied', code: '42501' } });

    await expect(assignDriverToVehicle('v1', 'd-new', false)).rejects.toEqual({
      message: 'permission denied',
      code: '42501',
    });
  });

  it('queues an assignment when its preflight read fails while offline', async () => {
    mockFromSequence(chain({ data: null, error: { message: 'Network request failed' } }));
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    await expect(assignDriverToVehicle('v1', 'd-new', false)).rejects.toThrow('הפעולה נשמרה');

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'fleetos.pending-assignment-operations.v1',
      expect.stringContaining('"type":"assign"')
    );
  });
});

describe('unassignVehicleDriver', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the atomic database operation rather than a blind client update', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });

    await unassignVehicleDriver('a1');

    expect(supabase.rpc).toHaveBeenCalledWith('unassign_vehicle_driver', { p_assignment_id: 'a1' });
  });

  it('throws when the update fails', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(unassignVehicleDriver('a1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('setPrimaryVehicleDriver', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the atomic database operation', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });

    await setPrimaryVehicleDriver('v1', 'a2');

    expect(supabase.rpc).toHaveBeenCalledWith('set_vehicle_primary_driver', {
      p_vehicle_id: 'v1',
      p_assignment_id: 'a2',
    });
  });

  it('propagates an atomic operation failure', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message: 'promotion failed' } });

    await expect(setPrimaryVehicleDriver('v1', 'a2')).rejects.toEqual({ message: 'promotion failed' });
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

  it('fetches subsequent deterministic pages instead of silently truncating a large fleet', async () => {
    const firstPage = chain({ data: Array.from({ length: 200 }, (_, index) => ({ id: `v-${index}` })), error: null });
    const finalPage = chain({ data: [{ id: 'v-200' }], error: null });
    mockFromSequence(firstPage, finalPage);

    const vehicles = await listVehicles('c1', true);

    expect(vehicles).toHaveLength(201);
    expect(firstPage.range).toHaveBeenCalledWith(0, 199);
    expect(finalPage.range).toHaveBeenCalledWith(200, 399);
  });
});

describe('listDrivers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('propagates a profile lookup failure instead of rendering anonymous driver cards', async () => {
    const detailsBuilder = chain({
      data: [{ id: 'd1', company_id: 'c1', status: 'active' }],
      error: null,
    });
    const profileBuilder = chain({ data: null, error: { message: 'profile read denied', code: '42501' } });
    const assignmentBuilder = chain({ data: [], error: null });
    mockFromSequence(detailsBuilder, profileBuilder, assignmentBuilder);

    await expect(listDrivers('c1')).rejects.toEqual({ message: 'profile read denied', code: '42501' });
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
