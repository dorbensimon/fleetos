jest.mock('../supabase', () => ({ supabase: {} }));

import { daysBetween, dueState, dueText, isDueSoon, type PlanRow } from '../meetingPlan';
import { formReportCategories, formReportCount, formReportTitle, monthsBefore, selectFormReport, type FormReportPick, type ReportForm, type ReportMeeting } from '../meetingReport';
import { adminNotificationTarget } from '../notificationTargets';
import { notificationTone } from '../notificationLook';
import type { DriverRow } from '../adminApi';

const today = '2026-09-26';

const row = (driverId: string, nextDue: string, extra: Partial<PlanRow> = {}): PlanRow => ({
  templateId: 't1',
  title: 'מפגש שיחה עם נהג',
  driverId,
  driverName: driverId,
  lastMeeting: null,
  nextDue,
  firstMeeting: true,
  ...extra,
});

describe('when is the next meeting', () => {
  test('counts days across months without time-zone drift', () => {
    expect(daysBetween('2026-09-26', '2026-10-03')).toBe(7);
    expect(daysBetween('2026-09-26', '2026-09-20')).toBe(-6);
    expect(daysBetween('2027-03-27', '2027-03-28')).toBe(1);
  });

  test('late, today, within two weeks, or later', () => {
    expect(dueState('2026-09-20', today)).toBe('late');
    expect(dueState(today, today)).toBe('today');
    expect(dueState('2026-10-10', today)).toBe('soon');
    expect(dueState('2026-10-11', today)).toBe('later');
    expect(isDueSoon({ nextDue: '2026-10-10' }, today)).toBe(true);
    expect(isDueSoon({ nextDue: '2026-12-26' }, today)).toBe(false);
  });

  test('is spelled out in plain words', () => {
    expect(dueText('2026-09-21', today)).toBe('באיחור של 5 ימים');
    expect(dueText('2026-09-25', today)).toBe('באיחור של יום');
    expect(dueText(today, today)).toBe('היום');
    expect(dueText('2026-09-27', today)).toBe('מחר');
    expect(dueText('2026-10-03', today)).toBe('בעוד 7 ימים');
    expect(dueText('2026-12-26', today)).toBe('עד 26/12/2026');
  });
});

describe('reports on one form', () => {
  const drivers = [
    { id: 'd1', full_name: 'אבי' }, { id: 'd2', full_name: 'רונית' }, { id: 'd3', full_name: 'משה' },
    { id: 'd4', full_name: 'דנה' }, { id: 'd5', full_name: 'גיל' },
  ] as DriverRow[];
  const talk: ReportForm = { id: 't1', title: 'מפגש שיחה עם נהג', repeatMonths: 6, createdAt: '2026-01-01T00:00:00Z' };
  const once: ReportForm = { ...talk, title: 'הצהרה', repeatMonths: 0 };
  let n = 0;
  const fill = (driver: string, date: string, status: 'draft' | 'signed', request: string | null, created = `${date}T10:00:00Z`): ReportMeeting => ({
    id: `m${++n}`, template_id: 't1', driver_id: driver, meeting_date: date, officer_name: 'קצין', status, created_at: created, signed_at: status === 'signed' ? created : null,
    request: request ? { status: request } : null,
  });
  const meetings = [
    fill('d1', '2026-08-01', 'signed', 'completed'),        // within six months
    fill('d1', '2026-02-01', 'signed', 'completed'),        // older than six months
    fill('d2', '2026-09-20', 'signed', 'pending'),          // waiting for the driver
    fill('d3', '2026-09-10', 'signed', 'cancelled'),        // cancelled: never counts
    fill('d4', '2026-07-01', 'signed', 'declined'),         // refused, then done again:
    fill('d4', '2026-07-05', 'signed', 'completed'),        //   the refusal is settled
    fill('d5', '2026-09-25', 'draft', null),                // a draft the officer left open
    fill('d5', '2026-09-24', 'signed', 'failed'),           // sending failed, nothing after it
    fill('gone', '2026-09-10', 'signed', 'completed'),      // archived driver
    fill('d1', '2026-10-30', 'signed', 'completed'),        // a future date
  ];
  const plan = [row('d1', '2027-02-01', { firstMeeting: false }), row('d3', '2026-09-20'), row('gone', '2026-09-20'), row('d2', '2026-10-01', { templateId: 'other' })];
  const data = { meetings, plan };
  const ids = (pick: FormReportPick) => pick.meetings.map((m) => `${m.meeting.driver_id}:${m.meeting.meeting_date}`);

  test('filled: only within the form\'s own cycle, nothing cancelled, archived or in the future', () => {
    expect(ids(selectFormReport('filled', talk, data, drivers, today))).toEqual(['d1:2026-08-01', 'd4:2026-07-05']);
  });

  test('a one-time form counts every completed fill', () => {
    expect(ids(selectFormReport('filled', once, data, drivers, today))).toEqual(['d1:2026-08-01', 'd4:2026-07-05', 'd1:2026-02-01']);
  });

  test('unfinished: drafts, waiting and failed, but not a refusal that was done again', () => {
    expect(ids(selectFormReport('unfinished', talk, data, drivers, today))).toEqual(['d2:2026-09-20', 'd5:2026-09-24', 'd5:2026-09-25']);
  });

  test('due: this form only, active drivers only; a one-time form has none', () => {
    expect(selectFormReport('due', talk, data, drivers, today).plan.map((r) => r.driverId)).toEqual(['d3']);
    expect(selectFormReport('due', once, data, drivers, today).plan).toEqual([]);
    expect(formReportCategories(once).map((c) => c.value)).toEqual(['filled', 'unfinished', 'never']);
  });

  test('never: a cancelled fill does not count, a draft does not count, and is noted', () => {
    const pick = selectFormReport('never', talk, data, drivers, today);
    expect(pick.drivers.map((d) => d.id)).toEqual(['d3']);
    expect(pick.open.get('d5')).toBe('draft');
    expect(pick.open.get('d2')).toBe('awaiting_driver');
    expect(pick.open.has('d4')).toBe(false);
  });

  test('another form\'s fills never count: the bug this replaces', () => {
    const training = { meetings: [{ ...fill('d1', '2026-09-01', 'signed', 'completed'), template_id: 'training' }], plan: [] };
    expect(selectFormReport('never', talk, training, drivers, today).drivers.map((d) => d.id)).toEqual(['d1', 'd2', 'd3', 'd4', 'd5'].sort((a, b) => {
      const name = (id: string) => drivers.find((d) => d.id === id)!.full_name!;
      return name(a).localeCompare(name(b), 'he');
    }));
  });

  test('the number beside each report is the number of rows in it', () => {
    for (const category of formReportCategories(talk)) {
      const pick = selectFormReport(category.value, talk, data, drivers, today);
      const rows = category.value === 'due' ? pick.plan.length : category.value === 'never' ? pick.drivers.length : pick.meetings.length;
      expect(formReportCount(category.value, pick)).toBe(rows);
    }
  });

  test('months back stop at the end of a short month', () => {
    expect(monthsBefore('2026-08-31', 6)).toBe('2026-02-28');
    expect(monthsBefore('2028-08-31', 6)).toBe('2028-02-29');
    expect(monthsBefore('2026-09-26', 12)).toBe('2025-09-26');
    expect(monthsBefore('2026-01-15', 1)).toBe('2025-12-15');
  });

  test('the title names the form', () => {
    expect(formReportTitle(talk, 'due')).toBe('מפגש שיחה עם נהג — צריכים למלא עכשיו');
    expect(formReportTitle(talk, 'filled')).toBe('מפגש שיחה עם נהג — מילאו ב־6 החודשים האחרונים');
  });
});

describe('meeting reminders', () => {
  const base = { company_id: 'c', recipient_id: null, vehicle_id: null, message: '' };

  test('one driver opens that driver\'s folder of the form; a summary opens the form\'s meeting list', async () => {
    const resolve = async () => null;
    await expect(adminNotificationTarget({ ...base, notification_type: 'driver_meeting_due', actor_id: 'd1', folder_key: 't1' }, resolve))
      .resolves.toEqual({ screen: 'DriverMeetingFolder', params: { driverId: 'd1', folderId: 't1' } });
    await expect(adminNotificationTarget({ ...base, notification_type: 'driver_meeting_due', actor_id: null, folder_key: 't1' }, resolve))
      .resolves.toEqual({ screen: 'SignedDocuments', params: { openMeeting: 't1' } });
  });

  test('a week ahead is a heads-up; due or late is urgent', () => {
    expect(notificationTone({ notification_type: 'driver_meeting_due', message: 'מפגש · אבי: המועד בעוד 7 ימים (03/10/2026)' })).toBe('warn');
    expect(notificationTone({ notification_type: 'driver_meeting_due', message: 'מפגש: ל-5 נהגים המפגש הבא בשבוע הקרוב' })).toBe('warn');
    expect(notificationTone({ notification_type: 'driver_meeting_due', message: 'הדרכה: ל-5 נהגים המועד בשבוע הקרוב' })).toBe('warn');
    expect(notificationTone({ notification_type: 'driver_meeting_due', message: 'הדרכה: ל-5 נהגים המועד ב-14 הימים הקרובים' })).toBe('warn');
    expect(notificationTone({ notification_type: 'driver_meeting_due', message: 'הדרכה: הגיע המועד אצל 5 נהגים' })).toBe('bad');
    expect(notificationTone({ notification_type: 'driver_meeting_due', message: 'מפגש · אבי: המועד היום' })).toBe('bad');
    expect(notificationTone({ notification_type: 'driver_meeting_due', message: 'מפגש · אבי: המועד עבר ב-20/09/2026' })).toBe('bad');
  });
});
