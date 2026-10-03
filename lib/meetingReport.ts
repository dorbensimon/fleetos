import { supabase } from './supabase';
import type { Company } from './supabase';
import type { DriverRow } from './adminApi';
import { listSigningTemplates } from './docuseal';
import { formatIsoDay, meetingState, readForm, todayIso, type MeetingState } from './checklistForms';
import { daysBetween, dueText, isDueSoon, loadMeetingPlan, type PlanRow } from './meetingPlan';
import { formatPhone } from './phone';
import { buildReportDocument, emptyState, esc, printOrShareReport, statusTag } from './reportTemplate';

/**
 * "ייצוא דוחות" → "טפסים לנהגים": reports on ONE "רשימת סעיפים" form at a
 * time, so a training never counts as a conversation meeting. Who filled it
 * in (within the form's own cycle), what got stuck, who is due now (repeating
 * forms only) and who never filled it in. Cancelled fills never count;
 * archived drivers and fills of a deleted form are left out.
 */

export type FormReportCategory = 'filled' | 'unfinished' | 'due' | 'never';

export type ReportForm = { id: string; title: string; repeatMonths: number; createdAt: string };

export type ReportMeeting = {
  id: string;
  template_id: string | null;
  driver_id: string;
  meeting_date: string;
  officer_name: string | null;
  status: 'draft' | 'signed';
  created_at: string;
  signed_at: string | null;
  request: { status: string } | null;
};

export type FormReportData = { meetings: ReportMeeting[]; plan: PlanRow[] };

/** The company's checklist forms, by name. */
export async function listReportForms(companyId: string): Promise<ReportForm[]> {
  const templates = await listSigningTemplates(companyId);
  return templates
    .filter((tpl) => tpl.form_kind === 'checklist' && tpl.company_id === companyId)
    .map((tpl) => ({ id: tpl.id, title: tpl.title, repeatMonths: readForm(tpl.form_content)?.repeatMonths ?? 0, createdAt: tpl.created_at }))
    .sort((a, b) => a.title.localeCompare(b.title, 'he') || a.createdAt.localeCompare(b.createdAt));
}

/** One form's fills (draft or signed) and, for a repeating form, its plan. */
export async function loadFormReportData(companyId: string, form: ReportForm): Promise<FormReportData> {
  const [rows, plan] = await Promise.all([
    supabase
      .from('checklist_meetings')
      .select('id, template_id, driver_id, meeting_date, officer_name, status, created_at, signed_at, request:signature_requests(status)')
      .eq('company_id', companyId)
      .eq('template_id', form.id)
      .in('status', ['draft', 'signed'])
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      }),
    form.repeatMonths > 0 ? loadMeetingPlan(companyId) : Promise.resolve([] as PlanRow[]),
  ]);
  const meetings = (rows as unknown as (Omit<ReportMeeting, 'request'> & { request: { status: string } | { status: string }[] | null })[]).map((row) => ({
    ...row,
    request: Array.isArray(row.request) ? row.request[0] ?? null : row.request,
  }));
  return { meetings, plan: plan.filter((row) => row.templateId === form.id) };
}

/** The four reports for this form; a one-time form has no "due". */
export function formReportCategories(form: ReportForm): { value: FormReportCategory; label: string; hint?: string; icon: string }[] {
  const months = form.repeatMonths;
  const filled = months === 0 ? 'מילאו את הטופס' : months === 1 ? 'מילאו בחודש האחרון' : `מילאו ב־${months} החודשים האחרונים`;
  return [
    { value: 'filled', label: filled, icon: 'checkmark-done-outline' },
    { value: 'unfinished', label: 'לא הושלמו', hint: 'טיוטה, ממתין לחתימה או סירוב', icon: 'time-outline' },
    ...(months > 0 ? [{ value: 'due' as const, label: 'צריכים למלא עכשיו', hint: 'באיחור או בשבועיים הקרובים', icon: 'alert-circle-outline' }] : []),
    { value: 'never', label: 'עוד לא מילאו', icon: 'person-remove-outline' },
  ];
}

/** `months` months before `today` (same day, clamped to the month's end), YYYY-MM-DD. */
export function monthsBefore(today: string, months: number): string {
  const [y, m, d] = today.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(d, last));
  return start.toISOString().slice(0, 10);
}

type Stuck = Exclude<MeetingState, 'completed' | 'cancelled'>;

export type FormReportPick = {
  meetings: { meeting: ReportMeeting; state: MeetingState }[];
  plan: PlanRow[];
  drivers: DriverRow[];
  /** A driver's open (stuck) fill on this form, noted in "due" and "never". */
  open: Map<string, Stuck>;
};

/** Which rows belong in each report. Exported for the tests. */
export function selectFormReport(
  category: FormReportCategory,
  form: ReportForm,
  data: FormReportData,
  drivers: DriverRow[],
  today = todayIso(),
): FormReportPick {
  const active = new Set(drivers.map((d) => d.id));
  const live = data.meetings
    .filter((m) => m.template_id === form.id && active.has(m.driver_id))
    .map((meeting) => ({ meeting, state: meetingState(meeting, meeting.request?.status) }))
    .filter((row) => row.state !== 'cancelled');

  // A stuck fill stops counting once the same driver completed a newer one.
  const lastCompleted = new Map<string, string>();
  for (const { meeting, state } of live) {
    if (state === 'completed' && meeting.created_at > (lastCompleted.get(meeting.driver_id) ?? '')) lastCompleted.set(meeting.driver_id, meeting.created_at);
  }
  const stuck = live
    .filter((row) => row.state !== 'completed' && row.meeting.created_at > (lastCompleted.get(row.meeting.driver_id) ?? ''))
    .sort((a, b) => a.meeting.meeting_date.localeCompare(b.meeting.meeting_date) || a.meeting.created_at.localeCompare(b.meeting.created_at));
  const open = new Map<string, Stuck>();
  // The newest stuck fill is the one to act on.
  for (const row of [...stuck].sort((a, b) => a.meeting.created_at.localeCompare(b.meeting.created_at))) open.set(row.meeting.driver_id, row.state as Stuck);

  const pick: FormReportPick = { meetings: [], plan: [], drivers: [], open };
  if (category === 'filled') {
    const since = form.repeatMonths > 0 ? monthsBefore(today, form.repeatMonths) : '';
    pick.meetings = live
      .filter((row) => row.state === 'completed' && row.meeting.meeting_date <= today && row.meeting.meeting_date >= since)
      .sort((a, b) => b.meeting.meeting_date.localeCompare(a.meeting.meeting_date));
  } else if (category === 'unfinished') {
    pick.meetings = stuck;
  } else if (category === 'due') {
    if (form.repeatMonths > 0) pick.plan = data.plan.filter((row) => row.templateId === form.id && active.has(row.driverId) && isDueSoon(row, today));
  } else {
    // The same rule as the reminders: a fill the officer signed counts.
    const signed = new Set(live.filter((row) => row.meeting.status === 'signed').map((row) => row.meeting.driver_id));
    pick.drivers = drivers
      .filter((d) => !signed.has(d.id))
      .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'he'));
  }
  return pick;
}

/** How many rows the report has: the number shown beside it and the total in the file. */
export function formReportCount(category: FormReportCategory, pick: FormReportPick): number {
  return category === 'due' ? pick.plan.length : category === 'never' ? pick.drivers.length : pick.meetings.length;
}

const OPEN_NOTE: Record<Stuck, string> = {
  draft: 'יש טיוטה פתוחה',
  awaiting_driver: 'ממתין לחתימת הנהג',
  requires_attention: 'לא הושלם — ראו דוח ״לא הושלמו״',
};

function stuckCells(meeting: ReportMeeting, state: MeetingState): string {
  const status = meeting.request?.status;
  if (state === 'draft') return `<td>${statusTag('הקצין עוד לא חתם', 'outline')}</td><td>להמשיך את הטיוטה מתיק הנהג</td>`;
  if (state === 'awaiting_driver') return `<td>${statusTag('ממתין לחתימת הנהג', 'outline')}</td><td>להזכיר לנהג לחתום באפליקציה</td>`;
  const label = status === 'declined' ? 'הנהג סירב לחתום' : 'השליחה לנהג נכשלה';
  return `<td>${statusTag(label, 'accent2')}</td><td>לבטל מתיק הנהג ולמלא מחדש</td>`;
}

function driverCells(d: DriverRow | undefined, fallbackName: string): string {
  return `<td>${esc(d?.full_name ?? fallbackName) || '—'}</td><td class="ltr">${esc(d?.national_id) || '—'}</td>`;
}

/** The report is always in Hebrew, whatever the app language. */
function frequencyHe(months: number): string {
  if (months === 0) return 'טופס חד-פעמי';
  if (months === 1) return 'טופס חוזר כל חודש';
  if (months === 6) return 'טופס חוזר כל חצי שנה';
  if (months === 12) return 'טופס חוזר כל שנה';
  return `טופס חוזר כל ${months} חודשים`;
}

export function formReportTitle(form: ReportForm, category: FormReportCategory): string {
  const label = formReportCategories(form).find((c) => c.value === category)?.label ?? '';
  return `${form.title} — ${label}`;
}

function buildHtml(company: Company, form: ReportForm, category: FormReportCategory, drivers: DriverRow[], data: FormReportData, pick: FormReportPick, today: string): string {
  const byId = new Map(drivers.map((d) => [d.id, d]));
  const plan = new Map(data.plan.map((row) => [row.driverId, row]));
  const note = (driverId: string) => {
    const state = pick.open.get(driverId);
    return state ? esc(OPEN_NOTE[state]) : '—';
  };
  let head = '';
  let rows = '';

  if (category === 'filled') {
    head = `<th>שם הנהג</th><th>ת.ז</th><th>תאריך המילוי</th><th>מילא מטעם החברה</th>${form.repeatMonths > 0 ? '<th>המועד הבא</th>' : ''}`;
    rows = pick.meetings.map(({ meeting }) => {
      const next = plan.get(meeting.driver_id);
      return `
        <tr>
          ${driverCells(byId.get(meeting.driver_id), '')}
          <td>${esc(formatIsoDay(meeting.meeting_date))}</td>
          <td>${esc(meeting.officer_name) || '—'}</td>
          ${form.repeatMonths > 0 ? `<td>${next ? esc(formatIsoDay(next.nextDue)) : '—'}</td>` : ''}
        </tr>`;
    }).join('');
  } else if (category === 'unfinished') {
    head = '<th>שם הנהג</th><th>ת.ז</th><th>תאריך</th><th>מצב</th><th>מה לעשות</th>';
    rows = pick.meetings.map(({ meeting, state }) => `
        <tr>
          ${driverCells(byId.get(meeting.driver_id), '')}
          <td>${esc(formatIsoDay(meeting.meeting_date))}</td>
          ${stuckCells(meeting, state)}
        </tr>`).join('');
  } else if (category === 'due') {
    head = '<th>שם הנהג</th><th>ת.ז</th><th>מילוי אחרון</th><th>המועד</th><th>מצב</th><th>הערה</th>';
    rows = pick.plan.map((row) => `
        <tr>
          ${driverCells(byId.get(row.driverId), row.driverName)}
          <td>${row.lastMeeting ? esc(formatIsoDay(row.lastMeeting)) : 'פעם ראשונה'}</td>
          <td>${esc(formatIsoDay(row.nextDue))}</td>
          <td>${statusTag(dueText(row.nextDue, today), daysBetween(today, row.nextDue) < 0 ? 'accent2' : 'outline')}</td>
          <td>${note(row.driverId)}</td>
        </tr>`).join('');
  } else {
    head = '<th>שם הנהג</th><th>ת.ז</th><th>טלפון</th><th>תחילת עבודה</th><th>הערה</th>';
    rows = pick.drivers.map((d) => `
        <tr>
          ${driverCells(d, '')}
          <td class="ltr">${esc(d.phone ? formatPhone(d.phone) : null) || '—'}</td>
          <td>${d.employment_start_date ? esc(formatIsoDay(d.employment_start_date)) : '—'}</td>
          <td>${note(d.id)}</td>
        </tr>`).join('');
  }

  const count = formReportCount(category, pick);
  const bodyHtml = count === 0
    ? emptyState('אין נהגים בקטגוריה זו')
    : `<table class="table" dir="rtl"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;

  return buildReportDocument({
    company: { name: company.name, businessId: company.business_id },
    title: formReportTitle(form, category),
    metaColumns: [
      { label: 'קצין רכב', value: company.safety_officer_name ?? '' },
      { label: 'קצין רכב נייד', value: company.safety_officer_phone ?? '', ltr: true },
      { label: category === 'filled' || category === 'unfinished' ? 'סה״כ מילויים' : 'סה״כ נהגים', value: String(count), sub: frequencyHe(form.repeatMonths), big: true, pushEnd: true },
    ],
    bodyHtml,
  });
}

export async function exportFormReport(company: Company, drivers: DriverRow[], form: ReportForm, data: FormReportData, category: FormReportCategory): Promise<void> {
  const today = todayIso();
  const pick = selectFormReport(category, form, data, drivers, today);
  const title = formReportTitle(form, category);
  await printOrShareReport(buildHtml(company, form, category, drivers, data, pick, today), title);
}
