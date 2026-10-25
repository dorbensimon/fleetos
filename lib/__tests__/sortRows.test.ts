import { nextSort, sortRows } from '../sortRows';

const rows = [{ n: 'a', v: 40 }, { n: 'b', v: null }, { n: 'c', v: -3 }, { n: 'd', v: 5 }];
const value = (r: { v: number | null }) => r.v;

describe('sortRows', () => {
  it('expired and closest first, empty last', () => {
    expect(sortRows(rows, value, 'asc').map((r) => r.n)).toEqual(['c', 'd', 'a', 'b']);
  });
  it('farthest first, empty still last', () => {
    expect(sortRows(rows, value, 'desc').map((r) => r.n)).toEqual(['a', 'd', 'c', 'b']);
  });
  it('no sort keeps the order', () => {
    expect(sortRows(rows, undefined)).toBe(rows);
  });
  it('a header cycles asc, desc, off', () => {
    const a = nextSort(null, 'x');
    const d = nextSort(a, 'x');
    expect([a, d, nextSort(d, 'x'), nextSort(d, 'y')]).toEqual([{ key: 'x', dir: 'asc' }, { key: 'x', dir: 'desc' }, null, { key: 'y', dir: 'asc' }]);
  });
});
