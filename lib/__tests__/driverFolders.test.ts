jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));

import { driverFolderRequiresExpiry } from '../driverDocumentFolders';

describe('driver folders', () => {
  it('require a date except notes, traffic reports and procedure 6', () => {
    expect(driverFolderRequiresExpiry('hazmat')).toBe(true);
    expect(driverFolderRequiresExpiry('general')).toBe(true);
    expect(driverFolderRequiresExpiry('procedure_6')).toBe(false);
    expect(driverFolderRequiresExpiry('notes_feedback')).toBe(false);
  });
});
