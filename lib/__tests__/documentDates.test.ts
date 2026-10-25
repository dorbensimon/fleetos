import { findDates, pickDocumentDates, suggestedDates } from '../documentDates';

describe('suggestedDates', () => {
  const dates = { expiry: '2027-10-20', inspected: '2026-10-20', issued: '2026-10-20' };
  it('inspection folders: inspection date plus their months', () => {
    expect(suggestedDates(dates, 12)).toEqual({ inspected: '2026-10-20', expiry: '2027-10-20' });
    expect(suggestedDates({ ...dates, expiry: '2030-01-01' }, 6).expiry).toBe('2027-04-20');
  });
  it('other folders: the expiry read', () => {
    expect(suggestedDates(dates, null)).toEqual({ inspected: null, expiry: '2027-10-20' });
    expect(suggestedDates(null)).toEqual({ inspected: null, expiry: null });
  });
});

describe('findDates', () => {
  it('reads the common Israeli formats and skips impossible dates', () => {
    expect(findDates('הונפק 05.03.2026 · 31/12/26 · 2027-01-15 · 31/02/2026 · 12/13/2026').map((d) => d.iso))
      .toEqual(['2026-03-05', '2026-12-31', '2027-01-15']);
  });
});

describe('pickDocumentDates', () => {
  const today = '2026-10-25';

  it('takes the date after "בתוקף עד", not a later unrelated one', () => {
    const text = 'פוליסה מס 123 תאריך הפקה 01/10/2026 תקופת ביטוח מ-01/11/2026 בתוקף עד 31/10/2027 הודפס 02/11/2027';
    expect(pickDocumentDates(text, today).expiry).toBe('2027-10-31');
  });

  it('falls back to the latest date when no word is near', () => {
    expect(pickDocumentDates('01/01/2026 15/06/2027 03/03/2026', today).expiry).toBe('2027-06-15');
  });

  it('no guessed expiry when every date is past', () => {
    expect(pickDocumentDates('נחתם 01/01/2026 הודפס 03/03/2026', today).expiry).toBeNull();
  });

  it('inspection date is never in the future', () => {
    expect(pickDocumentDates('תאריך בדיקה 20/10/2026 בדיקה הבאה 20/10/2027', today).inspected).toBe('2026-10-20');
  });

  it('issued is the document date', () => {
    expect(pickDocumentDates('בתוקף עד 31/12/2027 תאריך: 14/09/2026', today).issued).toBe('2026-09-14');
  });

  it('nothing found', () => {
    expect(pickDocumentDates('אין כאן תאריך', today)).toEqual({ expiry: null, inspected: null, issued: null });
  });
});
