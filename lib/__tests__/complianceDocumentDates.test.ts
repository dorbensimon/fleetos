import { documentDrivenDates, governingDocument } from '../compliance';

const doc = (expiry_date: string | null, created_at: string) => ({ expiry_date, created_at });

describe('governingDocument', () => {
  it('picks the latest entered expiry, not the latest upload', () => {
    const y2026 = doc('2026-12-31', '2026-01-01T00:00:00Z');
    const y2025 = doc('2025-12-31', '2026-06-01T00:00:00Z');
    expect(governingDocument([y2026, y2025])).toBe(y2026);
  });

  it('prefers dated documents and breaks ties by upload time', () => {
    const undated = doc(null, '2026-09-01T00:00:00Z');
    const older = doc('2026-12-31', '2026-01-01T00:00:00Z');
    const newer = doc('2026-12-31', '2026-02-01T00:00:00Z');
    expect(governingDocument([undated, older, newer])).toBe(newer);
  });

  it('returns null for an empty folder', () => {
    expect(governingDocument([])).toBeNull();
  });
});

describe('documentDrivenDates', () => {
  it('falls back to the next document when the latest one is deleted', () => {
    const remaining = [doc('2025-12-31', '2025-01-01T00:00:00Z')];
    expect(documentDrivenDates(remaining, { last_date: null })).toEqual({ expiryDate: '2025-12-31', lastDate: null });
  });

  it('clears both dates when the folder is empty', () => {
    expect(documentDrivenDates([], { last_date: '2025-08-15' })).toEqual({ expiryDate: null, lastDate: null });
  });

  it('keeps the last-test date while documents remain', () => {
    const remaining = [doc('2026-08-15', '2025-08-15T00:00:00Z')];
    expect(documentDrivenDates(remaining, { last_date: '2025-08-15' }).lastDate).toBe('2025-08-15');
  });
});
