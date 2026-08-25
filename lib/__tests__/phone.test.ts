import { formatPhone, isValidIsraeliPhone } from '../phone';

describe('formatPhone', () => {
  it('formats a mobile number with the 3-digit prefix split', () => {
    expect(formatPhone('0527898655')).toBe('052-7898655');
  });

  it('formats a landline number with the 2-digit prefix split', () => {
    expect(formatPhone('021234567')).toBe('02-1234567');
  });

  it('strips existing separators before reformatting', () => {
    expect(formatPhone('052-789-8655')).toBe('052-7898655');
  });

  it('returns an empty string for null/undefined/empty input', () => {
    expect(formatPhone(null)).toBe('');
    expect(formatPhone(undefined)).toBe('');
    expect(formatPhone('')).toBe('');
  });
});

describe('isValidIsraeliPhone', () => {
  it('accepts a valid mobile number', () => {
    expect(isValidIsraeliPhone('0527898655')).toBe(true);
  });

  it('accepts a valid landline number', () => {
    expect(isValidIsraeliPhone('021234567')).toBe(true);
  });

  it('rejects a number that is too short', () => {
    expect(isValidIsraeliPhone('0521234')).toBe(false);
  });

  it('rejects a number missing the leading 0', () => {
    expect(isValidIsraeliPhone('527898655')).toBe(false);
  });

  it('rejects null/undefined/empty input', () => {
    expect(isValidIsraeliPhone(null)).toBe(false);
    expect(isValidIsraeliPhone(undefined)).toBe(false);
    expect(isValidIsraeliPhone('')).toBe(false);
  });
});
