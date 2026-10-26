// דוחות תעבורה בתיק הנהג: סוגי הדוח, סטטוס, ואיך הפרטים נשמרים ליד הקובץ
import type { DocumentRow } from './adminApi/types';
import { t } from './i18n';

/**
 * A traffic report is one file in the driver's "דוחות תעבורה" folder with
 * its fields in `documents.details` (migration 124), like procedure 6. The
 * offense date is the document's date. Only an admin adds reports. A report
 * stays on "דורש טיפול" while its status is open.
 */

export const TRAFFIC_REPORTS_CATEGORY = 'traffic_reports';

// סוגי הדוח, בסדר מעורבב; 'אחר' תמיד אחרון
export const TRAFFIC_REPORT_TYPES = [
  'seatbelt', 'right_of_way', 'red_light', 'shoulder', 'cleanliness', 'speeding', 'vehicle_grounding',
  'registration_insurance', 'driving_hours', 'sign', 'driving_license', 'tachograph', 'roadworthiness',
  'overtaking', 'distance', 'phone', 'cargo_weight', 'bus_lane', 'toll_roads', 'parking', 'dui',
  'traffic_offense', 'other',
] as const;
export type TrafficReportType = (typeof TRAFFIC_REPORT_TYPES)[number];

export const TRAFFIC_REPORT_STATUSES = ['open', 'paid', 'transferred', 'appeal', 'cancelled'] as const;
export type TrafficReportStatus = (typeof TRAFFIC_REPORT_STATUSES)[number];

export const TRAFFIC_REPORT_RESPONSIBILITIES = ['driver', 'transfer', 'company'] as const;
export type TrafficReportResponsibility = (typeof TRAFFIC_REPORT_RESPONSIBILITIES)[number];

export interface TrafficReport {
  type: TrafficReportType | null;
  offenseDateIso: string | null;
  payByIso: string | null;
  receivedIso: string | null;
  /** Last day to transfer the report to the driver; received + 30 days unless changed. */
  transferByIso: string | null;
  amount: string;
  status: TrafficReportStatus;
  responsibility: TrafficReportResponsibility | null;
  vehicleId: string | null;
  vehiclePlate: string;
  vehicleName: string;
  issuer: string;
  reportNumber: string;
  description: string;
}

export const EMPTY_TRAFFIC_REPORT: TrafficReport = {
  type: null, offenseDateIso: null, payByIso: null, receivedIso: null, transferByIso: null, amount: '', status: 'open',
  responsibility: null, vehicleId: null, vehiclePlate: '', vehicleName: '', issuer: '', reportNumber: '', description: '',
};

export const trafficReportTypeLabel = (type: string) => t(`trafficReport.type.${type}`);
export const trafficReportStatusLabel = (status: string) => t(`trafficReport.status.${status}`);
export const trafficReportResponsibilityLabel = (r: string) => t(`trafficReport.responsibility.${r}`);

// בודק את השדות לפני השמירה
/** The type and the offense date are required; the amount, when given, is a number. */
export function trafficReportError(report: TrafficReport): string | null {
  const missing = [
    !report.type && t('trafficReport.typeLabel'),
    !report.offenseDateIso && t('trafficReport.offenseDate'),
  ].filter((x): x is string => !!x);
  if (missing.length) return `${t('validation.required')}: ${missing.join(', ')}`;
  if (report.amount.trim() && !/^\d+(\.\d{1,2})?$/.test(report.amount.trim())) return `${t('trafficReport.amount')}: ${t('validation.invalidAmount')}`;
  return null;
}

// מה שנשמר ליד הקובץ
/** The offense date becomes the document's date; the rest is kept as details (empty fields left out). */
export function trafficReportUpload(report: TrafficReport): { documentDate: string | null; details: Record<string, string> } {
  const pairs: [string, string | null][] = [
    ['report_type', report.type],
    ['pay_by', report.payByIso],
    ['received_at', report.receivedIso],
    ['transfer_by', report.transferByIso],
    ['amount', report.amount],
    ['status', report.status],
    ['responsibility', report.responsibility],
    ['vehicle_id', report.vehicleId],
    ['vehicle_plate', report.vehiclePlate],
    ['vehicle_name', report.vehicleName],
    ['issuer', report.issuer],
    ['report_number', report.reportNumber],
    ['description', report.description],
  ];
  const details: Record<string, string> = {};
  for (const [key, value] of pairs) if (value?.trim()) details[key] = value.trim();
  return { documentDate: report.offenseDateIso, details };
}

// ימים להסבת דוח מיום הקבלה
export const TRANSFER_DAYS = 30;

const plusDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// תאריך הקבלה משנה גם את מועד ההסבה, אלא אם המנהל שינה אותו ידנית
/** Moves "transfer by" along with the received date while it still holds the automatic value. */
export function withReceivedDate(report: TrafficReport, receivedIso: string | null): TrafficReport {
  const auto = report.receivedIso ? plusDays(report.receivedIso, TRANSFER_DAYS) : null;
  const followed = !report.transferByIso || report.transferByIso === auto;
  return {
    ...report,
    receivedIso,
    transferByIso: followed ? (receivedIso ? plusDays(receivedIso, TRANSFER_DAYS) : null) : report.transferByIso,
  };
}

// דוח שמור בחזרה לטופס (לעריכה)
export function trafficReportFromDoc(doc: Pick<DocumentRow, 'details' | 'document_date'>): TrafficReport {
  const d = doc.details ?? {};
  return {
    type: (d.report_type as TrafficReportType) ?? null,
    offenseDateIso: doc.document_date ?? null,
    payByIso: d.pay_by ?? null,
    receivedIso: d.received_at ?? null,
    transferByIso: d.transfer_by ?? null,
    amount: d.amount ?? '',
    status: (d.status as TrafficReportStatus) ?? 'open',
    responsibility: (d.responsibility as TrafficReportResponsibility) ?? null,
    vehicleId: d.vehicle_id ?? null,
    vehiclePlate: d.vehicle_plate ?? '',
    vehicleName: d.vehicle_name ?? '',
    issuer: d.issuer ?? '',
    reportNumber: d.report_number ?? '',
    description: d.description ?? '',
  };
}

// מי נהג ברכב ביום העבירה
/** Drivers assigned to the vehicle on that day (an assignment that ended that day still counts). */
export function driversOnDate<A extends { driver_id: string; assigned_at: string; unassigned_at: string | null }>(history: A[], dateIso: string): A[] {
  return history.filter((a) => a.assigned_at.slice(0, 10) <= dateIso && (!a.unassigned_at || a.unassigned_at.slice(0, 10) >= dateIso));
}

// האם הדוח עדיין פתוח
/** Files added before the report form have no status and are not counted as open. */
export function isOpenTrafficReport(doc: Pick<DocumentRow, 'category' | 'details'>): boolean {
  return doc.category === TRAFFIC_REPORTS_CATEGORY && doc.details?.status === 'open';
}

// שורת סיכום של דוח (בטלפון)
/** "עבירת מהירות" and "₪250 · פתוח · לתשלום עד 12/11/2026", or null for a plain file. */
export function trafficReportSummary(doc: Pick<DocumentRow, 'details' | 'document_date'>, formatDate: (iso: string) => string): { title: string; meta: string } | null {
  const d = doc.details ?? {};
  if (!d.report_type) return null;
  const meta = [
    doc.document_date ? formatDate(doc.document_date) : '',
    d.amount ? `₪${d.amount}` : '',
    d.status ? trafficReportStatusLabel(d.status) : '',
    d.pay_by ? t('trafficReport.payByShort', { date: formatDate(d.pay_by) }) : '',
  ].filter(Boolean).join(' · ');
  return { title: trafficReportTypeLabel(d.report_type), meta };
}
