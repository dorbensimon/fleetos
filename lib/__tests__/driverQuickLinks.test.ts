import { quickLinkMessage } from '../driverQuickLinks';
import { canAskDriverForDocument, type ValidityRow } from '../validityList';

jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock') // eslint-disable-line @typescript-eslint/no-require-imports
);

const row = (over: Partial<ValidityRow>): ValidityRow => ({
  id: 'r', ownerType: 'driver', ownerId: 'd1', folderKey: 'license_docs', folderLabel: 'רישיון', until: '2026-01-01',
  days: -3, name: 'דנה כהן', detail: '', department: '', ...over,
});

describe('quickLinkMessage', () => {
  it('greets by first name and carries the link', () => {
    const text = quickLinkMessage('odometer', { name: 'דנה כהן', company: 'הובלות', url: 'https://x/d/abc', plate: '12-345-67' });
    expect(text).toContain('דנה');
    expect(text).not.toContain('כהן');
    expect(text).toContain('https://x/d/abc');
    expect(text).toContain('12-345-67');
  });
});

describe('canAskDriverForDocument', () => {
  it('offers expired, soon and missing driver folders', () => {
    expect(canAskDriverForDocument(row({ days: -3 }))).toBe(true);
    expect(canAskDriverForDocument(row({ days: 10 }))).toBe(true);
    expect(canAskDriverForDocument(row({ days: null, until: null }))).toBe(true);
  });
  it('skips valid folders, vehicles and dates kept on the driver card', () => {
    expect(canAskDriverForDocument(row({ days: 200 }))).toBe(false);
    expect(canAskDriverForDocument(row({ ownerType: 'vehicle' }))).toBe(false);
    expect(canAskDriverForDocument(row({ folderKey: 'hazmat_permit_expiry' }))).toBe(false);
  });
});

describe('uploadMimeType', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { uploadMimeType } = require('../../screens/QuickLinkScreen') as typeof import('../../screens/QuickLinkScreen');
  it('fills a missing type from the extension and maps HEIF', () => {
    expect(uploadMimeType('scan.PDF', 'application/octet-stream')).toBe('application/pdf');
    expect(uploadMimeType('IMG_1.heif', '')).toBe('image/heic');
    expect(uploadMimeType('a.jpg', 'image/heif')).toBe('image/heic');
    expect(uploadMimeType('a.png', 'image/png')).toBe('image/png');
  });
});

describe('validExpiry (driver-quick-link upload)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { validExpiry } = require('../../supabase/functions/_shared/quickLinkExpiry') as typeof import('../../supabase/functions/_shared/quickLinkExpiry');
  it('takes real days from today up to 20 years ahead', () => {
    expect(validExpiry('2027-01-31', '2026-11-03')).toBe('2027-01-31');
    expect(validExpiry('2026-11-03', '2026-11-03')).toBe('2026-11-03');
    expect(validExpiry('2026-11-02', '2026-11-03')).toBeNull();
    expect(validExpiry('2027-02-30', '2026-11-03')).toBeNull();
    expect(validExpiry('2046-11-04', '2026-11-03')).toBeNull();
    expect(validExpiry(null, '2026-11-03')).toBeNull();
  });
});
