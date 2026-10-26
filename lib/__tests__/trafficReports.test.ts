import { EMPTY_TRAFFIC_REPORT, TRAFFIC_REPORT_TYPES, driversOnDate, isOpenTrafficReport, trafficReportFromDoc, withReceivedDate, trafficReportError, trafficReportUpload } from '../trafficReports';

describe('traffic reports', () => {
  it('needs a type and an offense date, and a numeric amount', () => {
    expect(trafficReportError(EMPTY_TRAFFIC_REPORT)).not.toBeNull();
    const ok = { ...EMPTY_TRAFFIC_REPORT, type: 'speeding' as const, offenseDateIso: '2026-10-20' };
    expect(trafficReportError(ok)).toBeNull();
    expect(trafficReportError({ ...ok, amount: '25O' })).not.toBeNull();
  });

  it('stores the offense date as the document date and drops empty fields', () => {
    const out = trafficReportUpload({ ...EMPTY_TRAFFIC_REPORT, type: 'parking', offenseDateIso: '2026-10-20', amount: ' 250 ', issuer: '' });
    expect(out).toEqual({ documentDate: '2026-10-20', details: { report_type: 'parking', amount: '250', status: 'open' } });
  });

  it('counts only reports marked open', () => {
    expect(isOpenTrafficReport({ category: 'traffic_reports', details: { status: 'open' } })).toBe(true);
    expect(isOpenTrafficReport({ category: 'traffic_reports', details: {} })).toBe(false);
    expect(isOpenTrafficReport({ category: 'traffic_reports', details: { status: 'paid' } })).toBe(false);
  });

  it("keeps 'other' last", () => {
    expect(TRAFFIC_REPORT_TYPES[TRAFFIC_REPORT_TYPES.length - 1]).toBe('other');
    expect(new Set(TRAFFIC_REPORT_TYPES).size).toBe(23);
  });

  it('moves the transfer date with the received date until it is changed by hand', () => {
    const r = withReceivedDate(EMPTY_TRAFFIC_REPORT, '2026-10-01');
    expect(r.transferByIso).toBe('2026-10-31');
    expect(withReceivedDate(r, '2026-12-15').transferByIso).toBe('2027-01-14');
    const manual = { ...r, transferByIso: '2026-11-05' };
    expect(withReceivedDate(manual, '2026-12-15').transferByIso).toBe('2026-11-05');
  });

  it('reads a saved report back into the form', () => {
    const upload = trafficReportUpload({ ...EMPTY_TRAFFIC_REPORT, type: 'parking', offenseDateIso: '2026-10-20', transferByIso: '2026-11-19', amount: '250' });
    const back = trafficReportFromDoc({ details: upload.details, document_date: upload.documentDate });
    expect(back).toEqual({ ...EMPTY_TRAFFIC_REPORT, type: 'parking', offenseDateIso: '2026-10-20', transferByIso: '2026-11-19', amount: '250' });
  });

  it('finds who drove the vehicle on the offense date', () => {
    const history = [
      { driver_id: 'a', assigned_at: '2026-01-01T08:00:00Z', unassigned_at: '2026-06-30T12:00:00Z' },
      { driver_id: 'b', assigned_at: '2026-06-30T13:00:00Z', unassigned_at: null },
    ];
    expect(driversOnDate(history, '2026-03-10').map((a) => a.driver_id)).toEqual(['a']);
    expect(driversOnDate(history, '2026-06-30').map((a) => a.driver_id)).toEqual(['a', 'b']);
    expect(driversOnDate(history, '2025-12-31')).toEqual([]);
  });
});
