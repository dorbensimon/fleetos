jest.mock('../supabase', () => ({ supabase: {} }));
import { isLive, monthKey, paidByMonth } from '../ownerTools';

describe('owner tools', () => {
  const now = new Date(2026, 9, 6); // 6 Oct 2026

  it('sums payments into the last months, oldest first, ignoring older ones', () => {
    const months = paidByMonth(
      [
        { period: '2026-10-01', amount: 500 },
        { period: '2026-10-01', amount: 250 },
        { period: '2026-08-01', amount: 900 },
        { period: '2026-01-01', amount: 999 },
      ],
      3,
      now,
    );
    expect(months).toEqual([
      { month: '2026-08-01', total: 900 },
      { month: '2026-09-01', total: 0 },
      { month: '2026-10-01', total: 750 },
    ]);
  });

  it('keys a month by its first day, across a year boundary', () => {
    expect(monthKey(new Date(2026, 0, 31))).toBe('2026-01-01');
    expect(paidByMonth([], 2, new Date(2026, 0, 5)).map((m) => m.month)).toEqual(['2025-12-01', '2026-01-01']);
  });

  it('treats an announcement as live between its start and end', () => {
    expect(isLive({ starts_at: '2026-10-01T00:00:00Z', ends_at: null }, now)).toBe(true);
    expect(isLive({ starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-10-02T00:00:00Z' }, now)).toBe(false);
    expect(isLive({ starts_at: '2026-11-01T00:00:00Z', ends_at: null }, now)).toBe(false);
  });
});
