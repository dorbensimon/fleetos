jest.mock('../supabase', () => ({ supabase: {} }));

import { daysBetween, dueState, dueText, isDueSoon, type PlanRow } from '../meetingPlan';
import { selectMeetingReport } from '../meetingReport';
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

describe('the meetings report', () => {
  const drivers = [{ id: 'd1', full_name: 'אבי' }, { id: 'd2', full_name: 'רונית' }, { id: 'd3', full_name: 'משה' }] as DriverRow[];
  const meetings = [
    { driver_id: 'd1', title: 'מפגש', meeting_date: '2026-09-01', officer_name: 'קצין', request: { status: 'completed' } },
    { driver_id: 'd2', title: 'מפגש', meeting_date: '2026-05-01', officer_name: 'קצין', request: { status: 'pending' } },
    { driver_id: 'd3', title: 'מפגש', meeting_date: '2026-09-10', officer_name: 'קצין', request: { status: 'cancelled' } },
    // A driver who was archived since: not in the active list, never reported.
    { driver_id: 'gone', title: 'מפגש', meeting_date: '2026-09-10', officer_name: 'קצין', request: { status: 'completed' } },
  ];
  const plan = [row('d1', '2026-12-01', { firstMeeting: false }), row('d3', '2026-09-20'), row('gone', '2026-09-20')];

  test('the last three months, without cancelled meetings or archived drivers', () => {
    const picked = selectMeetingReport('met_quarter', { drivers, meetings, plan }, today);
    expect(picked.meetings.map((m) => m.driver_id)).toEqual(['d1']);
  });

  test('meetings the driver has not signed yet', () => {
    expect(selectMeetingReport('awaiting_driver', { drivers, meetings, plan }, today).meetings.map((m) => m.driver_id)).toEqual(['d2']);
  });

  test('who needs a meeting now', () => {
    expect(selectMeetingReport('due', { drivers, meetings, plan }, today).plan.map((r) => r.driverId)).toEqual(['d3']);
  });

  test('who never had a meeting: a cancelled one does not count', () => {
    expect(selectMeetingReport('never', { drivers, meetings, plan }, today).drivers.map((d) => d.id)).toEqual(['d3']);
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
    expect(notificationTone({ notification_type: 'driver_meeting_due', message: 'מפגש · אבי: המועד היום' })).toBe('bad');
    expect(notificationTone({ notification_type: 'driver_meeting_due', message: 'מפגש · אבי: המועד עבר ב-20/09/2026' })).toBe('bad');
  });
});
