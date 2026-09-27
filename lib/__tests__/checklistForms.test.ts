jest.mock('../supabase', () => ({ supabase: {} }));

import {
  allAnswered,
  answeredCount,
  cleanForm,
  driverMeetingForm,
  formProblem,
  formatIsoDay,
  meetingState,
  readForm,
  statusOptions,
  type ChecklistForm,
} from '../checklistForms';
import {
  addMonths,
  everyItemAnswered,
  isIsoDay,
  parseAnswers,
  parseForm,
  renderChecklistHtml,
  repeatMonthsOf,
  signaturePng,
} from '../../supabase/functions/_shared/checklistDocument';

const form: ChecklistForm = {
  version: 1,
  intro: '',
  items: [
    { id: 'a', text: 'נבדקה דיסקית הטכוגרף' },
    { id: 'b', text: 'הנהג נשאל על בעיות ברכב' },
    { id: 'c', text: '   ' },
  ],
  allowNa: false,
  labels: { officer: 'חתימת קצין הבטיחות', driver: 'חתימת הנהג' },
  repeatMonths: 0,
};

describe('the form on the app side', () => {
  test('the ready-made meeting has the nine items safety officers already use', () => {
    const ready = driverMeetingForm();
    expect(ready.items).toHaveLength(9);
    expect(new Set(ready.items.map((i) => i.id)).size).toBe(9);
    expect(formProblem('מפגש שיחה עם נהג', ready)).toBeNull();
  });

  test('the ready-made meeting repeats every three months; a new blank form is one-time', () => {
    expect(driverMeetingForm().repeatMonths).toBe(3);
    expect(cleanForm({ ...form, repeatMonths: 6 }).repeatMonths).toBe(6);
    expect(readForm({ items: [{ id: 'a', text: 'x' }] })?.repeatMonths).toBe(0);
    expect(readForm({ items: [{ id: 'a', text: 'x' }], repeatMonths: 99 })?.repeatMonths).toBe(0);
  });

  test('"לא רלוונטי" is offered only when the admin turned it on', () => {
    expect(statusOptions(form)).toEqual(['done', 'not_done']);
    expect(statusOptions({ allowNa: true })).toEqual(['done', 'not_done', 'na']);
  });

  test('empty rows left in the builder are not part of the saved form', () => {
    const saved = cleanForm(form);
    expect(saved.items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  test('a form needs a name and at least one written item', () => {
    expect(formProblem('', form)).toBe('חסר שם לטופס');
    expect(formProblem('טופס', { ...form, items: [{ id: 'x', text: ' ' }] })).toBe('כתבו לפחות סעיף אחד');
    expect(formProblem('טופס', form)).toBeNull();
  });

  test('continuing to the signature needs an answer on every written item; notes are optional', () => {
    expect(allAnswered(form, { a: { status: 'done', note: '' } })).toBe(false);
    const answers = { a: { status: 'done' as const, note: '' }, b: { status: 'not_done' as const, note: 'יטופל בחודש הבא' } };
    expect(allAnswered(form, answers)).toBe(true);
    expect(answeredCount(form, answers)).toBe(2);
  });

  test('a stored form with missing labels falls back to the default headings', () => {
    const read = readForm({ items: [{ id: 'a', text: 'סעיף' }] });
    expect(read?.labels.officer).toBe('חתימת קצין הבטיחות');
    expect(readForm(null)).toBeNull();
  });

  test('a meeting reads its state from its own row and the driver\'s signing request', () => {
    expect(meetingState({ status: 'draft' })).toBe('draft');
    expect(meetingState({ status: 'signed' }, 'pending')).toBe('awaiting_driver');
    expect(meetingState({ status: 'signed' }, 'completed')).toBe('completed');
    expect(meetingState({ status: 'signed' }, 'cancelled')).toBe('cancelled');
    expect(meetingState({ status: 'cancelled' }, 'completed')).toBe('cancelled');
  });

  test('dates show as day/month/year without time-zone drift', () => {
    expect(formatIsoDay('2026-09-26')).toBe('26/09/2026');
    expect(formatIsoDay(null)).toBe('');
  });
});

describe('the form on the server side', () => {
  test('the server accepts the saved form and rejects duplicate or odd item ids', () => {
    expect(parseForm(cleanForm(form))?.items).toHaveLength(2);
    expect(parseForm({ ...cleanForm(form), items: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }] })).toBeNull();
    expect(parseForm({ ...cleanForm(form), items: [{ id: '<script>', text: 'x' }] })).toBeNull();
    expect(parseForm({ items: [] })).toBeNull();
  });

  test('answers keep only known items and allowed statuses', () => {
    const parsed = parseForm(cleanForm(form))!;
    const answers = parseAnswers({ a: { status: 'na', note: 'x' }, b: { status: 'done' }, zzz: { status: 'done' } }, parsed);
    // "לא רלוונטי" is off in this form, so it is dropped but the note stays.
    expect(answers).toEqual({ a: { status: null, note: 'x' }, b: { status: 'done', note: '' } });
    expect(everyItemAnswered(parsed, answers)).toBe(false);
  });

  test('the document escapes everything typed by people', () => {
    const parsed = parseForm({ ...cleanForm(form), items: [{ id: 'a', text: '<img src=x onerror=alert(1)>' }] })!;
    const html = renderChecklistHtml({
      title: 'מפגש <b>',
      form: parsed,
      letterhead: { name: 'הובלות "הגליל"', logoUrl: null },
      meeting: { answers: { a: { status: 'done', note: '</td><script>' } }, meetingDate: '2026-09-26', officerName: 'רונית <שגיא>', driver: { name: 'אבי' } },
    });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img src=x');
    expect(html).toContain('26/09/2026');
    expect(html).toContain('role="נהג"');
    expect(html).toContain('<span class="st st-done">בוצע</span>');
  });

  test('only a real PNG counts as a signature', () => {
    const bytes = (head: number[]) => btoa(String.fromCharCode(...head, ...new Array(400).fill(1)));
    const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(signaturePng(`data:image/png;base64,${png}`)).toBe(`data:image/png;base64,${png}`);
    expect(signaturePng(`data:image/jpeg;base64,${png}`)).toBeNull();
    expect(signaturePng('data:image/png;base64,AAAA')).toBeNull();
    expect(signaturePng(`data:image/png;base64,${bytes([])}`)).toBeNull();
  });

  test('the server keeps how often a form repeats, and only sane values', () => {
    expect(parseForm({ ...cleanForm(form), repeatMonths: 3 })?.repeatMonths).toBe(3);
    expect(parseForm({ ...cleanForm(form), repeatMonths: '3' })?.repeatMonths).toBe(0);
    expect(repeatMonthsOf(25)).toBe(0);
    expect(repeatMonthsOf(1.5)).toBe(0);
  });

  test('the next meeting is whole months later; the 31st lands on the month\'s last day', () => {
    expect(addMonths('2026-09-26', 3)).toBe('2026-12-26');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonths('2027-10-31', 4)).toBe('2028-02-29');
    expect(addMonths('2026-01-15', 12)).toBe('2027-01-15');
  });

  test('meeting dates must be real calendar days', () => {
    expect(isIsoDay('2026-09-26')).toBe(true);
    expect(isIsoDay('2026-02-30')).toBe(false);
    expect(isIsoDay('26/09/2026')).toBe(false);
  });
});
