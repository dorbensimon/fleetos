jest.mock('../supabase', () => ({ supabase: {} }));

import {
  DEFAULT_INSPECTION_FORM,
  cleanList,
  defectLines,
  formItems,
  hasDocument,
  inspectionProblem,
  inspectionState,
  listProblem,
  newListId,
  readInspectionForm,
  type InspectionAnswers,
  type InspectionForm,
  type InspectionListRow,
  type InspectionPlanRow,
} from '../inspections';
import { selectInspectionReport } from '../inspectionReport';
import { adminNotificationTarget } from '../notificationTargets';
import { notificationTone } from '../notificationLook';

const today = '2026-09-28';
const small: InspectionForm = {
  version: 1,
  groups: [
    { id: 'g1', title: 'מבחוץ', items: [{ id: 'a', text: 'מראות' }, { id: 'b', text: 'שמשות' }] },
    { id: 'g2', title: 'ציוד', items: [{ id: 'c', text: 'מטף' }] },
  ],
};

describe('the ready-made list', () => {
  test('every item has its own id, fit for the server', () => {
    const ids = formItems(DEFAULT_INSPECTION_FORM).map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[A-Za-z0-9_-]{1,40}$/));
    expect(listProblem(DEFAULT_INSPECTION_FORM)).toBeNull();
  });

  test('new ids fit the server too', () => {
    expect(newListId('i')).toMatch(/^[A-Za-z0-9_-]{1,40}$/);
    expect(newListId('g')).not.toBe(newListId('g'));
  });
});

describe('what stops the officer from signing', () => {
  test('an item not marked yet', () => {
    expect(inspectionProblem(small, { a: { status: 'ok', note: '' } })).toBe('נשארו 2 סעיפים לסימון');
    expect(inspectionProblem(small, { a: { status: 'ok', note: '' }, b: { status: 'na', note: '' } })).toBe('נשאר סעיף אחד לסימון');
  });

  test('a defect with nothing written about it', () => {
    const answers: InspectionAnswers = { a: { status: 'not_ok', note: '  ' }, b: { status: 'ok', note: '' }, c: { status: 'ok', note: '' } };
    expect(inspectionProblem(small, answers)).toBe('בסעיף "לא תקין" אחד חסר תיאור של הבעיה');
    answers.a.note = 'סדוקה';
    expect(inspectionProblem(small, answers)).toBeNull();
  });
});

test('defects in list order, then the ones written freely', () => {
  const answers: InspectionAnswers = {
    a: { status: 'not_ok', note: 'שבורה' },
    b: { status: 'ok', note: 'נקי' },
    c: { status: 'not_ok', note: 'פג תוקף' },
  };
  expect(defectLines(small, answers, ['  פנס אחורי  ', ''])).toEqual(['מראות: שבורה', 'מטף: פג תוקף', 'פנס אחורי']);
});

describe('editing the company list', () => {
  test('an empty group is dropped; a group without a name is not', () => {
    const edited: InspectionForm = {
      version: 1,
      groups: [
        { id: 'g1', title: '  מבחוץ ', items: [{ id: 'a', text: ' מראות  וחלונות ' }, { id: 'x', text: '   ' }] },
        { id: 'g9', title: '', items: [{ id: 'y', text: '' }] },
      ],
    };
    expect(listProblem(edited)).toBeNull();
    expect(cleanList(edited)).toEqual({ version: 1, groups: [{ id: 'g1', title: 'מבחוץ', items: [{ id: 'a', text: 'מראות וחלונות' }] }] });
    expect(listProblem({ version: 1, groups: [{ id: 'g1', title: '', items: [{ id: 'a', text: 'מראות' }] }] })).toBe('לכל קבוצה צריך שם');
    expect(listProblem({ version: 1, groups: [{ id: 'g1', title: 'x', items: [{ id: 'a', text: '' }] }] })).toBe('בכל קבוצה צריך לפחות סעיף אחד');
    expect(listProblem({ version: 1, groups: [] })).toBe('צריך לפחות קבוצה אחת עם סעיף');
  });

  test('a stored list is read defensively', () => {
    expect(readInspectionForm(null)).toBeNull();
    expect(readInspectionForm({ groups: [{ id: 'g', title: 't', items: [{ id: 1 }] }] })).toBeNull();
    expect(readInspectionForm(small)).toEqual(small);
  });
});

describe('where an inspection stands', () => {
  test('from its own status and its signature request', () => {
    expect(inspectionState({ status: 'draft', signature_request_id: null })).toBe('draft');
    expect(inspectionState({ status: 'signed', signature_request_id: 'r' }, 'pending')).toBe('awaiting_driver');
    expect(inspectionState({ status: 'signed', signature_request_id: 'r' }, 'completed')).toBe('completed');
    expect(inspectionState({ status: 'signed', signature_request_id: 'r' }, 'declined')).toBe('requires_attention');
    expect(inspectionState({ status: 'closed', signature_request_id: 'r' }, 'cancelled')).toBe('closed');
    expect(inspectionState({ status: 'cancelled', signature_request_id: 'r' }, 'completed')).toBe('cancelled');
  });

  test('a document exists once the driver signed, or it was closed without them', () => {
    expect(hasDocument({ status: 'signed', closed_at: null }, 'pending')).toBe(false);
    expect(hasDocument({ status: 'signed', closed_at: null }, 'completed')).toBe(true);
    expect(hasDocument({ status: 'closed', closed_at: '2026-09-01' }, 'cancelled')).toBe(true);
    expect(hasDocument({ status: 'cancelled', closed_at: '2026-09-01' }, 'cancelled')).toBe(true);
    expect(hasDocument({ status: 'cancelled', closed_at: null }, 'cancelled')).toBe(false);
  });
});

describe('the inspection reports', () => {
  const inspection = (id: string, date: string, extra: Partial<InspectionListRow> = {}): InspectionListRow => ({
    id,
    company_id: 'co',
    vehicle_id: `v-${id}`,
    driver_id: 'd',
    title: 'בדיקה',
    form: small,
    answers: { a: { status: 'not_ok', note: 'שבורה' }, b: { status: 'ok', note: '' }, c: { status: 'ok', note: '' } },
    extra_defects: ['פנס'],
    defect_count: 2,
    odometer: 1000,
    inspection_date: date,
    officer_name: 'דנה',
    officer_signature: null,
    facts: null,
    status: 'signed',
    signature_request_id: `r-${id}`,
    signed_at: `${date}T08:00:00Z`,
    closed_note: null,
    closed_at: null,
    cancelled_at: null,
    created_at: `${date}T08:00:00Z`,
    updated_at: `${date}T08:00:00Z`,
    vehicle: { id: `v-${id}`, plate_number: '1234567', manufacturer: 'מאן', model: 'TGX' },
    driver: { id: 'd', full_name: 'יוסי' },
    request: { id: `r-${id}`, status: 'completed' },
    ...extra,
  });
  const plan = (vehicleId: string, extra: Partial<InspectionPlanRow> = {}): InspectionPlanRow => ({
    vehicleId,
    vehicleLabel: 'מאן TGX',
    plate: '1234567',
    lastInspectionId: null,
    lastInspection: null,
    lastDefects: 0,
    nextDue: '2026-12-01',
    firstInspection: false,
    ...extra,
  });

  const inspections = [
    inspection('new', '2026-09-20'),
    inspection('old', '2026-05-01'),
    inspection('wait', '2026-09-10', { request: { id: 'r', status: 'pending' } }),
    inspection('draft', '2026-09-27', { status: 'draft', request: null }),
    inspection('gone', '2026-09-25', { status: 'cancelled' }),
  ];

  test('the last three months, without drafts or cancelled ones', () => {
    const picked = selectInspectionReport('insp_quarter', { inspections, plan: [] }, today);
    expect(picked.entries.map((e) => e.row.id)).toEqual(['new', 'wait']);
  });

  test('waiting for the driver', () => {
    expect(selectInspectionReport('insp_awaiting', { inspections, plan: [] }, today).entries.map((e) => e.row.id)).toEqual(['wait']);
  });

  test('defects of each vehicle\'s last inspection only', () => {
    const picked = selectInspectionReport('insp_defects', { inspections, plan: [plan('v-new', { lastInspectionId: 'new', lastDefects: 2 }), plan('v-old', { lastInspectionId: 'old', lastDefects: 0 })] }, today);
    expect(picked.defects.map((d) => [d.row.id, d.text])).toEqual([['new', 'מראות: שבורה'], ['new', 'פנס']]);
  });

  test('due within two weeks or late, and never checked', () => {
    const rows = [plan('late', { nextDue: '2026-09-01' }), plan('soon', { nextDue: '2026-10-12' }), plan('later', { nextDue: '2026-10-13' }), plan('none', { nextDue: null }), plan('first', { firstInspection: true })];
    expect(selectInspectionReport('insp_due', { inspections: [], plan: rows }, today).plan.map((p) => p.vehicleId)).toEqual(['late', 'soon']);
    expect(selectInspectionReport('insp_never', { inspections: [], plan: rows }, today).plan.map((p) => p.vehicleId)).toEqual(['first']);
  });
});

describe('the inspection reminder', () => {
  const base = { actor_id: null, recipient_id: null, folder_key: null, company_id: 'co', signature_request_id: null, notification_type: 'vehicle_safety_check_due' };
  const resolve = async () => null;

  test('one vehicle opens its card; a summary opens the inspections page', async () => {
    await expect(adminNotificationTarget({ ...base, vehicle_id: 'v1', message: 'x' }, resolve)).resolves.toEqual({ screen: 'VehicleDetail', params: { vehicleId: 'v1', tab: 'documents' } });
    await expect(adminNotificationTarget({ ...base, vehicle_id: null, message: 'x' }, resolve)).resolves.toEqual({ screen: 'SafetyInspections' });
  });

  test('ahead is a heads-up; due or late is urgent', () => {
    const tone = (message: string) => notificationTone({ notification_type: 'vehicle_safety_check_due', message });
    expect(tone('בדיקת קצין בטיחות · מאן (1234567): המועד בעוד 7 ימים (05/10/2026)')).toBe('warn');
    expect(tone('ב-5 רכבים בדיקת הבטיחות הבאה מתקרבת')).toBe('warn');
    expect(tone('בדיקת קצין בטיחות · מאן (1234567): המועד היום')).toBe('bad');
    expect(tone('הגיע הזמן לבדיקת קצין בטיחות ב-5 רכבים')).toBe('bad');
  });
});
