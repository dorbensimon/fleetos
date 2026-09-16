import { expiryDecision, processExpiry, signingDeadline } from '../supabase/functions/_shared/signingExpiry';

const sent = '2026-09-01T12:00:00.000Z';
const deadline = '2026-09-03T12:00:00.000Z';
const now = Date.parse(deadline);
const local = { status: 'pending', expires_at: deadline };
const expired = { status: 'expired', expire_at: deadline };

describe('48-hour signing cleanup, isolated from live services', () => {
  test('deadline is exactly 48 hours, independent of local timezone', () => {
    expect(signingDeadline(sent)).toBe(deadline);
    expect(expiryDecision(local, expired, now - 1)).toBe('keep');
    expect(expiryDecision(local, expired, now)).toBe('remove-unsigned');
  });
  test('preserves a last-moment signature even when its webhook is late', () => {
    expect(expiryDecision(local, { ...expired, submitters: [{ completed_at: '2026-09-03T11:59:59.999Z' }] }, now)).toBe('preserve-signed');
    expect(expiryDecision({ ...local, status: 'completed' }, expired, now)).toBe('keep');
    expect(expiryDecision({ ...local, signed_file_path: 'evidence.pdf' }, expired, now)).toBe('keep');
  });
  test('does not infer remote expiry or invent a legacy deadline', () => {
    expect(expiryDecision(local, { status: 'pending' }, now)).toBe('verify-expiration');
    expect(expiryDecision({ status: 'pending' }, expired, now)).toBe('keep');
    expect(expiryDecision(local, { status: 'expired', expire_at: 'invalid' }, now)).toBe('verify-expiration');
  });
  test('remote failure prevents any local deletion', async () => {
    const removeLocal = jest.fn();
    await expect(processExpiry(local, {
      readRemote: async () => expired,
      preserveSigned: jest.fn(),
      removeRemote: async () => { throw new Error('provider unavailable'); },
      removeLocal,
    }, now)).rejects.toThrow('provider unavailable');
    expect(removeLocal).not.toHaveBeenCalled();
  });
  test('remote deletion must finish before local deletion', async () => {
    const steps: string[] = [];
    await processExpiry(local, {
      readRemote: async () => expired,
      preserveSigned: jest.fn(),
      removeRemote: async () => { steps.push('remote'); },
      removeLocal: async () => { steps.push('local'); },
    }, now);
    expect(steps).toEqual(['remote', 'local']);
  });
});
