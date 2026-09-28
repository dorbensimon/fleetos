import { supabase } from './supabase';
import type { Company } from './supabase';
import type { DriverRow } from './adminApi';
import { formatIsoDay, todayIso } from './checklistForms';
import { daysBetween, dueText, isDueSoon, loadMeetingPlan, type PlanRow } from './meetingPlan';
import { formatPhone } from './phone';
import { buildReportDocument, emptyState, esc, printOrShareReport, statusTag } from './reportTemplate';

/**
 * "ייצוא דוחות" → meetings with drivers ("רשימת סעיפים" forms): who met in
 * the last three months, who has not signed yet, who needs a meeting now, and
 * who never had one. Cancelled meetings never count.
 */

export type MeetingReportCategory = 'met_quarter' | 'awaiting_driver' | 'due' | 'never';

export const MEETING_REPORT_CATEGORIES: { value: MeetingReportCategory; label: string; icon: string }[] = [
  { value: 'met_quarter', label: 'נפגשו ב־3 החודשים האחרונים', icon: 'checkmark-done-outline' },
  { value: 'awaiting_driver', label: 'ממתינים לחתימת הנהג', icon: 'time-outline' },
  { value: 'due', label: 'צריכים מפגש (באיחור או בשבועיים הקרובים)', icon: 'alert-circle-outline' },
  { value: 'never', label: 'עוד לא התקיים איתם מפגש', icon: 'person-remove-outline' },
];

const TITLES: Record<MeetingReportCategory, string> = {
  met_quarter: 'דוח מפגשים עם נהגים ב־3 החודשים האחרונים',
  awaiting_driver: 'דוח מפגשים שממתינים לחתימת הנהג',
  due: 'דוח נהגים שצריכים מפגש',
  never: 'דוח נהגים שעוד לא התקיים איתם מפגש',
};

type ReportMeeting = {
  driver_id: string;
  title: string;
  meeting_date: string;
  officer_name: string | null;
  request: { status: string } | null;
};

async function listSignedMeetings(companyId: string): Promise<ReportMeeting[]> {
  const { data, error } = await supabase
    .from('checklist_meetings')
    .select('driver_id, title, meeting_date, officer_name, request:signature_requests(status)')
    .eq('company_id', companyId)
    .eq('status', 'signed')
    .order('meeting_date', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as (ReportMeeting & { request: { status: string } | { status: string }[] | null })[]).map((row) => ({
    ...row,
    request: Array.isArray(row.request) ? row.request[0] ?? null : row.request,
  }));
}

/** The date three months before today, YYYY-MM-DD. */
function quarterStart(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 4, 1));
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(d, last));
  return start.toISOString().slice(0, 10);
}

/** Which rows belong in each report. Exported for the tests. */
export function selectMeetingReport(
  category: MeetingReportCategory,
  data: { drivers: DriverRow[]; meetings: ReportMeeting[]; plan: PlanRow[] },
  today = todayIso(),
) {
  const active = new Map(data.drivers.map((d) => [d.id, d]));
  const live = data.meetings.filter((m) => m.request?.status !== 'cancelled' && active.has(m.driver_id));
  if (category === 'met_quarter') {
    const since = quarterStart(today);
    return { meetings: live.filter((m) => m.meeting_date >= since && m.meeting_date <= today), plan: [], drivers: [] };
  }
  if (category === 'awaiting_driver') {
    return { meetings: live.filter((m) => m.request?.status === 'pending'), plan: [], drivers: [] };
  }
  if (category === 'due') {
    return { meetings: [], plan: data.plan.filter((row) => active.has(row.driverId) && isDueSoon(row, today)), drivers: [] };
  }
  const met = new Set(live.map((m) => m.driver_id));
  return { meetings: [], plan: [], drivers: data.drivers.filter((d) => !met.has(d.id)) };
}

function driverCells(d: DriverRow | undefined, fallbackName: string): string {
  return `<td>${esc(d?.full_name ?? fallbackName) || '—'}</td><td class="ltr">${esc(d?.national_id) || '—'}</td>`;
}

function buildHtml(company: Company, category: MeetingReportCategory, drivers: DriverRow[], picked: ReturnType<typeof selectMeetingReport>, today: string): string {
  const byId = new Map(drivers.map((d) => [d.id, d]));
  let head = '';
  let rows = '';
  let count = 0;

  if (category === 'met_quarter' || category === 'awaiting_driver') {
    count = picked.meetings.length;
    head = '<th>שם הנהג</th><th>ת.ז</th><th>הטופס</th><th>תאריך המפגש</th><th>חתם מטעם החברה</th><th>חתימת הנהג</th>';
    rows = picked.meetings.map((m) => `
        <tr>
          ${driverCells(byId.get(m.driver_id), '')}
          <td>${esc(m.title)}</td>
          <td>${esc(formatIsoDay(m.meeting_date))}</td>
          <td>${esc(m.officer_name) || '—'}</td>
          <td>${m.request?.status === 'completed' ? statusTag('נחתם', 'accent') : statusTag('ממתין', 'outline')}</td>
        </tr>`).join('');
  } else if (category === 'due') {
    count = picked.plan.length;
    head = '<th>שם הנהג</th><th>ת.ז</th><th>הטופס</th><th>מפגש אחרון</th><th>המועד</th><th>מצב</th>';
    rows = picked.plan.map((row) => `
        <tr>
          ${driverCells(byId.get(row.driverId), row.driverName)}
          <td>${esc(row.title)}</td>
          <td>${row.lastMeeting ? esc(formatIsoDay(row.lastMeeting)) : 'מפגש ראשון'}</td>
          <td>${esc(formatIsoDay(row.nextDue))}</td>
          <td>${statusTag(dueText(row.nextDue, today), daysBetween(today, row.nextDue) < 0 ? 'accent2' : 'outline')}</td>
        </tr>`).join('');
  } else {
    count = picked.drivers.length;
    head = '<th>שם הנהג</th><th>ת.ז</th><th>טלפון</th><th>תחילת עבודה</th>';
    rows = picked.drivers.map((d) => `
        <tr>
          ${driverCells(d, '')}
          <td class="ltr">${esc(d.phone ? formatPhone(d.phone) : null) || '—'}</td>
          <td>${d.employment_start_date ? esc(formatIsoDay(d.employment_start_date)) : '—'}</td>
        </tr>`).join('');
  }

  const bodyHtml = count === 0
    ? emptyState(category === 'due' ? 'אין נהגים שצריכים מפגש בשבועיים הקרובים' : 'אין נהגים בקטגוריה זו')
    : `<table class="table" dir="rtl"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;

  return buildReportDocument({
    company: { name: company.name, businessId: company.business_id },
    title: TITLES[category],
    metaColumns: [
      { label: 'קצין רכב', value: company.safety_officer_name ?? '' },
      { label: 'קצין רכב נייד', value: company.safety_officer_phone ?? '', ltr: true },
      { label: category === 'met_quarter' || category === 'awaiting_driver' ? 'סה״כ מפגשים בדוח' : 'סה״כ נהגים בדוח', value: String(count), big: true, pushEnd: true },
    ],
    bodyHtml,
  });
}

export async function exportMeetingsReport(company: Company, drivers: DriverRow[], category: MeetingReportCategory): Promise<void> {
  const [meetings, plan] = await Promise.all([
    category === 'due' ? Promise.resolve([]) : listSignedMeetings(company.id),
    category === 'due' ? loadMeetingPlan(company.id) : Promise.resolve([]),
  ]);
  const today = todayIso();
  const picked = selectMeetingReport(category, { drivers, meetings, plan }, today);
  await printOrShareReport(buildHtml(company, category, drivers, picked, today), TITLES[category]);
}
