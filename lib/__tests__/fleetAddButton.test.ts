import { addFloats, type ListMetrics } from '../../screens/admin/mobile/FleetMobile';

jest.mock('../supabase', () => ({ supabase: {} }));

// A hero of 300, the pinned filter bar of 60, twelve rows of 90, the add
// button at the end (80) and 24 of room under it, seen through a 600 window.
const list = (scrollY: number, over: Partial<ListMetrics> = {}): ListMetrics => ({
  scrollY,
  viewport: 600,
  content: 300 + 60 + 12 * 90 + 80 + 24,
  header: 300,
  rows: Array(12).fill(90),
  rowCount: 12,
  end: 80,
  bottomPadding: 24,
  ...over,
});

describe('the fleet add button', () => {
  it('stays in the list until four rows have slid under the filter bar', () => {
    expect(addFloats(list(0))).toBe(false);
    expect(addFloats(list(300 + 4 * 90 - 1))).toBe(false);
  });

  it('floats once they have', () => {
    expect(addFloats(list(300 + 4 * 90))).toBe(true);
  });

  it('stops floating when the button at the end of the list shows', () => {
    expect(addFloats(list(900))).toBe(false);
  });

  it('never floats on a list of four or fewer', () => {
    expect(addFloats(list(2000, { rowCount: 4, rows: Array(4).fill(90) }))).toBe(false);
  });

  it('waits until the first rows are measured', () => {
    expect(addFloats(list(700, { rows: [90, 90] }))).toBe(false);
  });
});
