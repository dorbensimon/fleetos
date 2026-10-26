import { EMPTY_TRAFFIC_REPORT, TRAFFIC_REPORT_TYPES, isOpenTrafficReport, trafficReportError, trafficReportUpload } from '../trafficReports';

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
});
