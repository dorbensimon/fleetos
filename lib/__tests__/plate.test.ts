import { formatPlate } from '../plate';

describe('formatPlate', () => {
  it('formats an 8-digit plate as 3-2-3', () => {
    expect(formatPlate('12345678')).toBe('123-45-678');
  });

  it('formats a 7-digit plate as 2-3-2', () => {
    expect(formatPlate('1234567')).toBe('12-345-67');
  });

  it('formats a 6-digit plate as 3-3', () => {
    expect(formatPlate('123456')).toBe('123-456');
  });

  it('formats a 5-digit plate as 2-3', () => {
    expect(formatPlate('12345')).toBe('12-345');
  });

  it('strips existing separators before reformatting', () => {
    expect(formatPlate('12-345-678')).toBe('123-45-678');
  });

  it('returns an empty string for null/undefined input', () => {
    expect(formatPlate(null)).toBe('');
    expect(formatPlate(undefined)).toBe('');
  });

  it('falls back to raw digits for an unsupported length', () => {
    expect(formatPlate('123')).toBe('123');
  });
});
