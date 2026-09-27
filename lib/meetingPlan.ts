import { supabase } from './supabase';
import { functionErrorMessage } from './functionError';
import { formatIsoDay, todayIso } from './checklistForms';

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

/** Days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  const [a, b] = [from, to].map((day) => {
    const [y, m, d] = day.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}

/** A meeting counts as coming up two weeks ahead. */
export const SOON_DAYS = 14;

export type DueState = 'late' | 'today' | 'soon' | 'later';

export function dueState(nextDue: string, today = todayIso()): DueState {
  const days = daysBetween(today, nextDue);
  if (days < 0) return 'late';
  if (days === 0) return 'today';
  return days <= SOON_DAYS ? 'soon' : 'later';
}

/** One short line for a list: "באיחור של 5 ימים", "היום", "בעוד 3 ימים", "עד 26/12/2026". */
export function dueText(nextDue: string, today = todayIso()): string {
  const days = daysBetween(today, nextDue);
  if (days < -1) return `באיחור של ${-days} ימים`;
  if (days === -1) return 'באיחור של יום';
  if (days === 0) return 'היום';
  if (days === 1) return 'מחר';
  if (days <= SOON_DAYS) return `בעוד ${days} ימים`;
  return `עד ${formatIsoDay(nextDue)}`;
}

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

/** One form's plan by driver id. */
export function planByDriver(rows: PlanRow[], templateId: string): Map<string, PlanRow> {
  return new Map(rows.filter((row) => row.templateId === templateId).map((row) => [row.driverId, row]));
}

async function invoke(body: Record<string, unknown>, fallback: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('checklist-meeting', { body });
  if (error || data?.error) throw new Error(await functionErrorMessage(error, data, fallback, false));
}

/** Moves one driver's next meeting on one form to another day. */
export async function setNextMeetingDate(companyId: string, templateId: string, driverId: string, nextDue: string): Promise<void> {
  await invoke({ action: 'set-next', companyId, templateId, driverId, nextDue }, 'שמירת התאריך נכשלה');
}

/** How often every driver needs this form: 0 for a one-time form. */
export async function setFormRepeat(companyId: string, templateId: string, repeatMonths: number): Promise<void> {
  await invoke({ action: 'set-repeat', companyId, templateId, repeatMonths }, 'שמירת התדירות נכשלה');
}
