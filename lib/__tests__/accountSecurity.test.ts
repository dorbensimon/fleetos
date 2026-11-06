import { generateTemporaryPassword, isValidTemporaryPassword as isValidClientTempPassword } from '../validation';
import {
  authPasswordErrorMessage,
  isValidTemporaryPassword as isValidServerTempPassword,
  mayUseAuthenticatedCapabilities,
  mayManageAccount,
} from '../../supabase/functions/_shared/accountSecurity';

describe.each([
  ['client', isValidClientTempPassword],
  ['server', isValidServerTempPassword],
])('temporary password validation (%s)', (_name, validate) => {
  it.each(['8402716395', 'Ab3dEf7h', 'abcdefgh', '12345678'])('accepts 8+ non-space characters: %s', (value) => {
    expect(validate(value)).toBe(true);
  });

  it.each(['1234', '1357901', 'abc def12', 'a'.repeat(73), '', null, undefined])(
    'rejects short, spaced or oversized values: %s',
    (value) => {
      expect(validate(value as any)).toBe(false);
    },
  );
});

describe('generateTemporaryPassword', () => {
  it('produces valid, mixed, unambiguous passwords', () => {
    for (let i = 0; i < 200; i++) {
      const value = generateTemporaryPassword();
      expect(value).toHaveLength(10);
      expect(isValidClientTempPassword(value)).toBe(true);
      expect(isValidServerTempPassword(value)).toBe(true);
      expect(value).toMatch(/\d/);
      expect(value).toMatch(/[A-Za-z]/);
      expect(value).not.toMatch(/[0O1lI]/);
    }
  });
});

describe('authPasswordErrorMessage', () => {
  it('translates Supabase weak-password errors', () => {
    expect(authPasswordErrorMessage('Password is known to be weak and easy to guess, please choose a different one.')).toContain('נפוצה');
    expect(authPasswordErrorMessage('Password should be at least 6 characters.')).toContain('חלשה');
    expect(authPasswordErrorMessage('Something else')).toBeNull();
  });
});

describe('account-management authorization', () => {
  it('allows an owner to manage drivers and admins', () => {
    expect(mayManageAccount('owner', 'driver', 'c1', 'c1')).toBe(true);
    expect(mayManageAccount('owner', 'admin', 'c2', 'c1')).toBe(true);
  });

  it('allows a company admin to manage only drivers in that company', () => {
    expect(mayManageAccount('admin', 'driver', 'c1', 'c1')).toBe(true);
    expect(mayManageAccount('admin', 'driver', 'c2', 'c1')).toBe(false);
    expect(mayManageAccount('admin', 'admin', 'c1', 'c1')).toBe(false);
  });

  it('never lets a driver manage an account', () => {
    expect(mayManageAccount('driver', 'driver', 'c1', 'c1')).toBe(false);
  });
});

describe('pending-password capability gate', () => {
  it('blocks normal authenticated capabilities while setup is pending', () => {
    expect(mayUseAuthenticatedCapabilities(true)).toBe(false);
  });

  it('allows only the explicit password-setup exception', () => {
    expect(mayUseAuthenticatedCapabilities(true, true)).toBe(true);
    expect(mayUseAuthenticatedCapabilities(false)).toBe(true);
  });
});
