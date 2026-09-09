import { isValidTemporaryPassword as isValidClientTempPassword } from '../validation';
import {
  isValidTemporaryPassword as isValidServerTempPassword,
  mayUseAuthenticatedCapabilities,
  mayManageAccount,
} from '../../supabase/functions/_shared/accountSecurity';

describe.each([
  ['client', isValidClientTempPassword],
  ['server', isValidServerTempPassword],
])('temporary password validation (%s)', (_name, validate) => {
  it.each(['0000', '1234', '123456'])('accepts at least four digits: %s', (value) => {
    expect(validate(value)).toBe(true);
  });

  it.each(['123', 'abcd', '12ab', '１２３４', '', null, undefined])(
    'rejects non-numeric or too-short values: %s',
    (value) => {
      expect(validate(value as any)).toBe(false);
    },
  );
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
