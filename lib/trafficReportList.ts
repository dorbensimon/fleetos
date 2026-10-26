// כל דוחות התעבורה של החברה במקום אחד: טעינה, סינון, סיכום וטבלה לאקסל
import { supabase } from './supabase';
import { listVehicles } from './adminApi/vehicles';
import { chunkIds, fetchAllPages } from './adminApi/paging';
import type { DocumentRow } from './adminApi/types';
import { daysUntilExpiry, formatDate } from './theme';
import { TRAFFIC_REPORTS_CATEGORY, trafficReportResponsibilityLabel, trafficReportStatusLabel, trafficReportTypeLabel } from './trafficReports';
import { t } from './i18n';

/**
 * The company-wide "דוחות תעבורה" screen. Reports stay files in each
 * driver's folder (lib/trafficReports.ts); this gathers them with the
 * driver's name and the vehicle's plate, newest deadline first.
 */

export interface TrafficReportListRow {
  doc: DocumentRow;
  driverId: string;
  driverName: string;
  vehicleId: string | null;
  plate: string;
  typeLabel: string;
  status: string;
  amount: number;
  /** The nearer of the payment and transfer dates, while the report is open. */
  nextDue: string | null;
}

/** 'open' is what still needs handling; 'closed' is paid, transferred, appealed or cancelled. */
export type TrafficReportView = 'open' | 'closed' | 'all';

/** "קרוב": a deadline within this many days. */
export const TRAFFIC_REPORT_SOON_DAYS = 7;

export function toListRow(doc: DocumentRow, driverName: string): TrafficReportListRow {
  const d = doc.details ?? {};
  const status = d.status ?? '';
  const dues = status === 'open' ? [d.pay_by, d.responsibility === 'company' ? undefined : d.transfer_by].filter((x): x is string => !!x).sort() : [];
  return {
    doc,
    driverId: doc.owner_id,
    driverName,
    vehicleId: d.vehicle_id ?? null,
    plate: d.vehicle_plate ?? '',
    typeLabel: d.report_type ? trafficReportTypeLabel(d.report_type) : t('trafficReport.report'),
    status,
    amount: Number(d.amount) || 0,
    nextDue: dues[0] ?? null,
  };
}

// טוען את כל הדוחות של החברה (או של רכב אחד)
export async function loadTrafficReports(companyId: string, vehicleId?: string): Promise<TrafficReportListRow[]> {
  const docs = await fetchAllPages<DocumentRow>((from, to) => {
    let q = supabase
      .from('documents')
      .select('*')
      .eq('company_id', companyId)
      .eq('owner_type', 'driver')
      .eq('category', TRAFFIC_REPORTS_CATEGORY);
    if (vehicleId) q = q.eq('details->>vehicle_id', vehicleId);
    return q.order('id', { ascending: true }).range(from, to);
  });
  const names = new Map<string, string>();
  for (const batch of chunkIds([...new Set(docs.map((d) => d.owner_id))])) {
    const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', batch);
    if (error) throw error;
    for (const p of data ?? []) names.set(p.id, p.full_name?.trim() || t('common.unnamed'));
  }
  return sortTrafficReports(docs.map((doc) => toListRow(doc, names.get(doc.owner_id) ?? t('common.unnamed'))));
}

// פתוחים לפי המועד הקרוב, אחריהם השאר מהחדש לישן
export function sortTrafficReports(rows: TrafficReportListRow[]): TrafficReportListRow[] {
  const open = (r: TrafficReportListRow) => (r.status === 'open' ? 0 : 1);
  return [...rows].sort((a, b) =>
    open(a) - open(b)
    || (a.nextDue ?? '9999').localeCompare(b.nextDue ?? '9999')
    || (b.doc.document_date ?? '').localeCompare(a.doc.document_date ?? ''));
}

export function filterTrafficReports(
  rows: TrafficReportListRow[],
  f: { view: TrafficReportView; query: string; fromIso: string | null; toIso: string | null },
): TrafficReportListRow[] {
  const q = f.query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  return rows.filter((r) => {
    if (f.view === 'open' && r.status !== 'open') return false;
    if (f.view === 'closed' && r.status === 'open') return false;
    const day = r.doc.document_date ?? '';
    if (f.fromIso && day < f.fromIso) return false;
    if (f.toIso && day > f.toIso) return false;
    if (!q) return true;
    const d = r.doc.details ?? {};
    const text = [r.driverName, r.typeLabel, d.issuer, d.report_number, d.description].join(' ').toLowerCase();
    return text.includes(q) || (!!qDigits && (r.plate.replace(/\D/g, '').includes(qDigits) || (d.report_number ?? '').includes(qDigits)));
  });
}

// המספרים שבראש המסך
export function trafficReportTotals(rows: TrafficReportListRow[]) {
  const open = rows.filter((r) => r.status === 'open');
  const days = open.map((r) => daysUntilExpiry(r.nextDue)).filter((x): x is number => x != null);
  return {
    open: open.length,
    openAmount: open.reduce((sum, r) => sum + r.amount, 0),
    overdue: days.filter((x) => x < 0).length,
    soon: days.filter((x) => x >= 0 && x <= TRAFFIC_REPORT_SOON_DAYS).length,
  };
}

// הטבלה לאקסל
export function trafficReportTable(rows: TrafficReportListRow[]): string[][] {
  const date = (iso?: string | null) => (iso ? formatDate(iso) : '');
  return [
    [
      t('trafficReport.driver'), t('trafficReport.vehicle'), t('trafficReport.typeLabel'), t('trafficReport.offenseDate'),
      t('trafficReport.reportNumber'), t('trafficReport.issuer'), t('trafficReport.amount'), t('trafficReport.payBy'),
      t('trafficReport.receivedAt'), t('trafficReport.transferBy'), t('trafficReport.statusLabel'),
      t('trafficReport.responsibilityLabel'), t('trafficReport.description'),
    ],
    ...rows.map((r) => {
      const d = r.doc.details ?? {};
      return [
        r.driverName, r.plate, r.typeLabel, date(r.doc.document_date),
        d.report_number ?? '', d.issuer ?? '', d.amount ?? '', date(d.pay_by),
        date(d.received_at), date(d.transfer_by), d.status ? trafficReportStatusLabel(d.status) : '',
        d.responsibility ? trafficReportResponsibilityLabel(d.responsibility) : '', d.description ?? '',
      ];
    }),
  ];
}
