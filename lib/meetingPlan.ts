// תזמון מילויי טפסים חוזרים לכל נהג (מתי המילוי הבא)
import { supabase } from './supabase';
import { functionErrorMessage } from './functionError';
import { formatIsoDay, todayIso } from './checklistForms';
import { t } from './i18n';

/**
 * Recurring meetings: which active driver needs a meeting on which repeating
 * "רשימת סעיפים" form, and by when. The rule lives in one place, the
 * database (supabase/sql/97_checklist_meeting_schedule.sql), which also
 * sends the managers their reminders; the app only reads it.
 */

export type PlanRow = {
  templateId: string;
  title: string;
  driverId: string;
  driverName: string;
  /** The last signed meeting, YYYY-MM-DD, or null before the first one. */
  lastMeeting: string | null;
  nextDue: string;
  firstMeeting: boolean;
};

// מספר הימים בין שני תאריכים
/** Days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  const [a, b] = [from, to].map((day) => {
    const [y, m, d] = day.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}

// כמה ימים מראש נחשב 'בקרוב'
/** A meeting counts as coming up two weeks ahead. */
export const SOON_DAYS = 14;

export type DueState = 'late' | 'today' | 'soon' | 'later';

// המצב של מילוי: באיחור, היום, בקרוב או בסדר
export function dueState(nextDue: string, today = todayIso()): DueState {
  const days = daysBetween(today, nextDue);
  if (days < 0) return 'late';
  if (days === 0) return 'today';
  return days <= SOON_DAYS ? 'soon' : 'later';
}

// שורה קצרה: באיחור, היום, בעוד כמה ימים
/** One short line for a list: "באיחור של 5 ימים", "היום", "בעוד 3 ימים", "עד 26/12/2026". */
export function dueText(nextDue: string, today = todayIso()): string {
  const days = daysBetween(today, nextDue);
  if (days < -1) return t('meeting.overdueDays', { v1: -days });
  if (days === -1) return t('meeting.overdueOneDay');
  if (days === 0) return t('common.today');
  if (days === 1) return t('common.tomorrow');
  if (days <= SOON_DAYS) return t('time.inDays', { days });
  return t('meeting.until', { nextDue: formatIsoDay(nextDue) });
}

// האם צריך לטפל עכשיו
/** Needs attention now: late, today, or within the next two weeks. */
export function isDueSoon(row: Pick<PlanRow, 'nextDue'>, today = todayIso()): boolean {
  return dueState(row.nextDue, today) !== 'later';
}

type RpcRow = {
  template_id: string;
  title: string;
  driver_id: string;
  driver_name: string;
  last_meeting: string | null;
  next_due: string;
  first_meeting: boolean;
};

// כל הנהגים בכל הטפסים החוזרים, הקרוב ראשון
/** Every active driver on every repeating form of the company, soonest first. */
export async function loadMeetingPlan(companyId: string): Promise<PlanRow[]> {
  const { data, error } = await supabase.rpc('list_checklist_meeting_plan', { p_company_id: companyId });
  if (error) throw error;
  return ((data ?? []) as RpcRow[]).map((row) => ({
    templateId: row.template_id,
    title: row.title,
    driverId: row.driver_id,
    driverName: row.driver_name,
    lastMeeting: row.last_meeting,
    nextDue: row.next_due,
    firstMeeting: row.first_meeting,
  }));
}

// התזמון של טופס אחד לפי נהג
/** One form's plan by driver id. */
export function planByDriver(rows: PlanRow[], templateId: string): Map<string, PlanRow> {
  return new Map(rows.filter((row) => row.templateId === templateId).map((row) => [row.driverId, row]));
}

// קורא לפונקציית השרת
async function invoke(body: Record<string, unknown>, fallback: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('checklist-meeting', { body });
  if (error || data?.error) throw new Error(await functionErrorMessage(error, data, fallback, false));
}

// מזיז את המילוי הבא של נהג ליום אחר
/** Moves one driver's next meeting on one form to another day. */
export async function setNextMeetingDate(companyId: string, templateId: string, driverId: string, nextDue: string): Promise<void> {
  await invoke({ action: 'set-next', companyId, templateId, driverId, nextDue }, t('common.saveDateFailed'));
}

// כל כמה זמן ממלאים את הטופס (0 = פעם אחת)
/** How often every driver needs this form: 0 for a one-time form. */
export async function setFormRepeat(companyId: string, templateId: string, repeatMonths: number): Promise<void> {
  await invoke({ action: 'set-repeat', companyId, templateId, repeatMonths }, t('meeting.saveFrequencyFailed'));
}
