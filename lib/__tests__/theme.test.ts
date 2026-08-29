import { formatDate, parseDateValue } from '../theme';

describe('date-only formatting', () => {
  it('keeps a database date on the same calendar day', () => {
    const parsed = parseDateValue('2026-08-29');

    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7);
    expect(parsed.getDate()).toBe(29);
    expect(formatDate('2026-08-29')).toBe('29/08/2026');
  });

  it('keeps timestamp support for existing created_at fields', () => {
    expect(formatDate('2026-08-29T12:00:00.000Z')).not.toBe('—');
  });
});
