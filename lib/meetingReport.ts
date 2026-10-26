// דוחות לכל טופס: מולא, לא הסתיים, צריך עכשיו, לא מולא
import { supabase } from './supabase';
import type { Company } from './supabase';
import type { DriverRow } from './adminApi';
import { listSigningTemplates } from './docuseal';
import { formatIsoDay, meetingState, readForm, todayIso, type MeetingState } from './checklistForms';
import { daysBetween, isDueSoon, loadMeetingPlan, type PlanRow } from './meetingPlan';
import { formatPhone } from './phone';
import { deliverTableReport, ReportCell, type TableReportOptions } from './reportTemplate';

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

// רשימת הטפסים של החברה
/** The company's checklist forms, by name. */
export async function listReportForms(companyId: string): Promise<ReportForm[]> {
  const templates = await listSigningTemplates(companyId);
  return templates
    .filter((tpl) => tpl.form_kind === 'checklist' && tpl.company_id === companyId)
    .map((tpl) => ({ id: tpl.id, title: tpl.title, repeatMonths: readForm(tpl.form_content)?.repeatMonths ?? 0, createdAt: tpl.created_at }))
    .sort((a, b) => a.title.localeCompare(b.title, 'he') || a.createdAt.localeCompare(b.createdAt));
}

// המילויים והתזמון של טופס אחד
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

// ארבעת הדוחות של הטופס
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

// תאריך לפני כמה חודשים
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

// בוחר אילו שורות נכנסות לכל דוח
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

// כמה שורות יש בדוח
/** How many rows the report has: the number shown beside it and the total in the file. */
export function formReportCount(category: FormReportCategory, pick: FormReportPick): number {
  return category === 'due' ? pick.plan.length : category === 'never' ? pick.drivers.length : pick.meetings.length;
}

// הסבר מה לעשות לכל מצב תקוע
const OPEN_NOTE: Record<Stuck, string> = {
  draft: 'יש טיוטה פתוחה',
  awaiting_driver: 'ממתין לחתימת הנהג',
  requires_attention: 'לא הושלם — ראו דוח ״לא הושלמו״',
};

// תדירות הטופס בעברית
/** The report is always in Hebrew, whatever the app language. */
function frequencyHe(months: number): string {
  if (months === 0) return 'טופס חד-פעמי';
  if (months === 1) return 'טופס חוזר כל חודש';
  if (months === 6) return 'טופס חוזר כל חצי שנה';
  if (months === 12) return 'טופס חוזר כל שנה';
  return `טופס חוזר כל ${months} חודשים`;
}

// כותרת הדוח
export function formReportTitle(form: ReportForm, category: FormReportCategory): string {
  const label = formReportCategories(form).find((c) => c.value === category)?.label ?? '';
  return `${form.title} — ${label}`;
}

// תא של מועד: באיחור, היום או בעוד כמה ימים
function dueCell(nextDue: string, today: string): ReportCell {
  const days = daysBetween(today, nextDue);
  const text = formatIsoDay(nextDue);
  if (days < 0) return { text, ltr: true, tone: 'bad', sub: `באיחור של ${-days} ימים` };
  return { text, ltr: true, sub: days === 0 ? 'היום' : days === 1 ? 'מחר' : `בעוד ${days} ימים` };
}

// מה לעשות עם מילוי תקוע
const STUCK_ACTION: Record<Stuck, string> = {
  awaiting_driver: 'להזכיר לנהג לחתום באפליקציה',
  draft: 'להמשיך את הטיוטה מתיק הנהג',
  requires_attention: 'לבטל מתיק הנהג ולמלא מחדש',
};

const FILLS = { one: 'מילוי אחד', many: 'מילויים' };
const DRIVERS = { one: 'נהג אחד', many: 'נהגים' };

// בונה את טבלת הדוח
function buildReport(company: Company, form: ReportForm, category: FormReportCategory, drivers: DriverRow[], data: FormReportData, pick: FormReportPick, today: string): TableReportOptions {
  const byId = new Map(drivers.map((d) => [d.id, d]));
  const plan = new Map(data.plan.map((row) => [row.driverId, row]));
  const note = (driverId: string): ReportCell => {
    const state = pick.open.get(driverId);
    return { text: state ? OPEN_NOTE[state] : null };
  };
  const driverCells = (d: DriverRow | undefined, fallbackName: string): ReportCell[] => [
    { text: d?.full_name ?? fallbackName },
    { text: d?.national_id, ltr: true },
  ];
  const common = { company: { name: company.name, businessId: company.business_id }, title: formReportTitle(form, category) };
  const frequency = frequencyHe(form.repeatMonths);

  if (category === 'filled') {
    const repeats = form.repeatMonths > 0;
    return ({
      ...common,
      unit: FILLS,
      columns: repeats
        ? [{ label: 'שם הנהג', width: 22 }, { label: 'ת.ז', width: 15 }, { label: 'תאריך המילוי', width: 18 }, { label: 'מילא מטעם החברה', width: 22 }, { label: 'המועד הבא', width: 23 }]
        : [{ label: 'שם הנהג', width: 26 }, { label: 'ת.ז', width: 18 }, { label: 'מילא מטעם החברה', width: 30 }, { label: 'תאריך המילוי', width: 26 }],
      sections: [{
        title: '',
        rows: pick.meetings.map(({ meeting }) => {
          const date: ReportCell = { text: formatIsoDay(meeting.meeting_date), ltr: true };
          const officer: ReportCell = { text: meeting.officer_name };
          const next = plan.get(meeting.driver_id);
          return repeats
            ? [...driverCells(byId.get(meeting.driver_id), ''), date, officer, next ? dueCell(next.nextDue, today) : { text: null }]
            : [...driverCells(byId.get(meeting.driver_id), ''), officer, date];
        }),
      }],
      grandTitle: 'סה״כ מילויים',
      note: repeats ? `${frequency}. מוצגים המילויים מהתקופה האחרונה.` : `${frequency}.`,
      emptyText: 'אין מילויים של הטופס',
    });
  }

  if (category === 'unfinished') {
    const row = ({ meeting, state }: FormReportPick['meetings'][number]): ReportCell[] => [
      ...driverCells(byId.get(meeting.driver_id), ''),
      { text: formatIsoDay(meeting.meeting_date), ltr: true },
      state === 'requires_attention'
        ? { text: meeting.request?.status === 'declined' ? 'הנהג סירב לחתום' : 'השליחה לנהג נכשלה', tone: 'bad' }
        : { text: state === 'draft' ? 'הקצין עוד לא חתם' : 'ממתין לחתימת הנהג' },
      { text: STUCK_ACTION[state as Stuck] },
    ];
    const of = (state: Stuck) => pick.meetings.filter((m) => m.state === state).map(row);
    return ({
      ...common,
      unit: FILLS,
      columns: [{ label: 'שם הנהג', width: 22 }, { label: 'ת.ז', width: 15 }, { label: 'תאריך', width: 14 }, { label: 'מצב', width: 20 }, { label: 'מה לעשות', width: 29 }],
      sections: [
        { title: 'סה״כ ממתינים לחתימת הנהג', rows: of('awaiting_driver') },
        { title: 'סה״כ טיוטות פתוחות', rows: of('draft') },
        { title: 'סה״כ סירבו או נכשלו', rows: of('requires_attention') },
      ],
      grandTitle: 'סה״כ מילויים שלא הושלמו',
      note: 'מילויים שנפתחו ולא הגיעו לחתימה של שני הצדדים.',
      emptyText: 'אין מילויים שלא הושלמו',
    });
  }

  if (category === 'due') {
    const row = (r: PlanRow): ReportCell[] => [
      ...driverCells(byId.get(r.driverId), r.driverName),
      r.lastMeeting ? { text: formatIsoDay(r.lastMeeting), ltr: true } : { text: 'פעם ראשונה', tone: 'muted' },
      note(r.driverId),
      dueCell(r.nextDue, today),
    ];
    return ({
      ...common,
      unit: DRIVERS,
      columns: [{ label: 'שם הנהג', width: 22 }, { label: 'ת.ז', width: 15 }, { label: 'מילוי אחרון', width: 16 }, { label: 'הערה', width: 21 }, { label: 'המועד', width: 26 }],
      sections: [
        { title: 'סה״כ באיחור', rows: pick.plan.filter((r) => daysBetween(today, r.nextDue) < 0).map(row) },
        { title: 'סה״כ בשבועיים הקרובים', rows: pick.plan.filter((r) => daysBetween(today, r.nextDue) >= 0).map(row) },
      ],
      grandTitle: 'סה״כ נהגים שצריכים למלא',
      note: `${frequency}. נהגים שהמועד שלהם עבר או שיגיע בשבועיים הקרובים.`,
      emptyText: 'אין נהגים שצריכים למלא עכשיו',
    });
  }

  return ({
    ...common,
    unit: DRIVERS,
    columns: [{ label: 'שם הנהג', width: 22 }, { label: 'ת.ז', width: 15 }, { label: 'טלפון', width: 18 }, { label: 'תחילת עבודה', width: 18 }, { label: 'הערה', width: 27 }],
    sections: [{
      title: '',
      rows: pick.drivers.map((d) => [
        ...driverCells(d, ''),
        { text: d.phone ? formatPhone(d.phone) : null, ltr: true },
        { text: d.employment_start_date ? formatIsoDay(d.employment_start_date) : null, ltr: true },
        note(d.id),
      ]),
    }],
    grandTitle: 'סה״כ נהגים שלא מילאו',
    note: 'נהגים שעוד אין להם מילוי חתום של הטופס.',
    emptyText: 'כל הנהגים כבר מילאו את הטופס',
  });
}

// מפיק ומוריד את הדוח
export async function exportFormReport(company: Company, drivers: DriverRow[], form: ReportForm, data: FormReportData, category: FormReportCategory): Promise<void> {
  const today = todayIso();
  const pick = selectFormReport(category, form, data, drivers, today);
  const title = formReportTitle(form, category);
  // Signed-form reports stay PDF only, so nobody can edit them.
  await deliverTableReport(buildReport(company, form, category, drivers, data, pick, today), title, 'pdf');
}
