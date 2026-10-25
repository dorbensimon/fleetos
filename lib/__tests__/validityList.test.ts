jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));

import { filterValidity, validityTable, type ValidityRow } from '../validityList';
import { xlsxBytes } from '../xlsx';

const row = (over: Partial<ValidityRow>): ValidityRow => ({
  id: Math.random().toString(), ownerType: 'vehicle', ownerId: 'v1', folderKey: 'winter_inspection', folderLabel: 'בדיקת חורף',
  until: '2026-01-01', days: -5, name: '12-345-67', detail: 'וולבו B12B', department: '', ...over,
});

const rows = [
  row({ days: -5 }),
  row({ days: 10, folderKey: 'tachograph_calibration' }),
  row({ days: 200 }),
  row({ ownerType: 'driver', name: 'דני', folderKey: 'license_docs', days: -1 }),
];
const all = new Set<string>();

describe('filterValidity', () => {
  it('splits expired, soon and all by owner', () => {
    expect(filterValidity(rows, { ownerType: 'vehicle', folderKeys: all, state: 'expired', query: '' })).toHaveLength(1);
    expect(filterValidity(rows, { ownerType: 'vehicle', folderKeys: all, state: 'soon', query: '' })).toHaveLength(1);
    expect(filterValidity(rows, { ownerType: 'vehicle', folderKeys: all, state: 'all', query: '' })).toHaveLength(3);
    expect(filterValidity(rows, { ownerType: 'driver', folderKeys: all, state: 'expired', query: '' })).toHaveLength(1);
  });

  it('keeps only the chosen folders', () => {
    const got = filterValidity(rows, { ownerType: 'vehicle', folderKeys: new Set(['tachograph_calibration']), state: 'all', query: '' });
    expect(got.map((r) => r.days)).toEqual([10]);
  });

  it('finds a plate by its digits', () => {
    expect(filterValidity(rows, { ownerType: 'vehicle', folderKeys: all, state: 'all', query: '1234567' })).toHaveLength(3);
    expect(filterValidity(rows, { ownerType: 'vehicle', folderKeys: all, state: 'all', query: '999' })).toHaveLength(0);
  });
});

describe('validity export', () => {
  it('is an xlsx zip with a right-to-left sheet and escaped Hebrew', () => {
    const table = validityTable([row({ detail: 'דגם "מיוחד" & <חדש>' })], 'vehicle');
    expect(table).toHaveLength(2);
    const bytes = xlsxBytes(table, { sheetName: 'תוקפים' });
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('rightToLeft="1"');
    expect(text).toContain('דגם &quot;מיוחד&quot; &amp; &lt;חדש&gt;');
  });
});
