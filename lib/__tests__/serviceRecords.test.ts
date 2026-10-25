jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));

import { inDateRange, totalBeforeVat, type ServiceRecord } from '../serviceRecords';

const rec = (service_date: string, amount_before_vat: number | null) => ({ id: service_date, service_date, amount_before_vat }) as ServiceRecord;
const rows = [rec('2026-01-10', 100), rec('2026-03-01', 250.5), rec('2026-06-30', null)];

describe('service records', () => {
  it('filters by an inclusive date range, either end optional', () => {
    expect(inDateRange(rows, '2026-03-01', '2026-06-30').map((r) => r.id)).toEqual(['2026-03-01', '2026-06-30']);
    expect(inDateRange(rows, null, '2026-01-10')).toHaveLength(1);
    expect(inDateRange(rows, null, null)).toHaveLength(3);
  });
  it('sums the amounts, skipping empty ones', () => {
    expect(totalBeforeVat(rows)).toBe(350.5);
  });
});
