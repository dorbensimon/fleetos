import { supabase } from './supabase';
import { functionErrorMessage } from './functionError';
import type { SigningTemplate } from './docuseal';
import { t } from './i18n';

/**
 * "רשימת סעיפים": a form the manager (or the safety officer) fills during a
 * meeting with a driver. Each item gets one answer and an optional note; the
 * officer signs by hand, then the driver signs, either right there on the
 * same device or later from their own phone.
 *
 * The form is built once on desktop (a signing template with
 * `form_kind: 'checklist'`). Every meeting keeps its own copy of the form, so
 * editing the template later never changes a meeting already held.
 *
 * The server (supabase/functions/_shared/checklistDocument.ts) checks the
 * same limits and renders the signed document from the same model.
 */

export type ChecklistStatus = 'done' | 'not_done' | 'na';

export type ChecklistItem = { id: string; text: string };

export type ChecklistForm = {
  version: 1;
  /** Optional opening line printed above the table. */
  intro: string;
  items: ChecklistItem[];
  /** Offer "לא רלוונטי" next to "בוצע" and "לא בוצע". */
  allowNa: boolean;
  /** The headings over the two signatures. */
  labels: { officer: string; driver: string };
  /** How often each driver needs this meeting, in months; 0 is a one-time form. */
  repeatMonths: number;
};

export type ChecklistAnswer = { status: ChecklistStatus | null; note: string };
export type ChecklistAnswers = Record<string, ChecklistAnswer>;

export const CHECKLIST_LIMITS = {
  items: 60,
  itemText: 400,
  intro: 1000,
  note: 500,
  label: 60,
  officerName: 80,
} as const;

/** The choices offered for "how often"; the server accepts any 0-24. */
export const REPEAT_OPTIONS = [
  { months: 0, get label() { return t('frequency.once'); } },
  { months: 1, get label() { return t('frequency.monthly'); } },
  { months: 3, get label() { return t('frequency.every3Months'); } },
  { months: 6, get label() { return t('frequency.every6Months'); } },
  { months: 12, get label() { return t('frequency.yearly'); } },
] as const;

export function repeatLabel(months: number): string {
  return REPEAT_OPTIONS.find((o) => o.months === months)?.label ?? (months > 0 ? t('frequency.everyNMonths', { months }) : t('frequency.once'));
}

export const DEFAULT_LABELS = { officer: 'חתימת קצין הבטיחות', driver: 'חתימת הנהג' } as const;

/** The ready-made "מפגש שיחה עם נהג", as safety officers already fill it on paper. */
export const DRIVER_MEETING_TITLE = 'מפגש שיחה עם נהג';
export const DRIVER_MEETING_ITEMS = [
  'התקיים מפגש בין הנהג לקצין הבטיחות בתעבורה, ובו בוצעו הפעולות הבאות',
  'בוצעה שיחה פתוחה על מצבו המקצועי, הכלכלי, הרפואי והמשפחתי של הנהג',
  'הנהג נשאל אם נתקל בחודש האחרון בבעיה טכנית ברכב',
  'הנהג נשאל אם נעצר בחודש האחרון לבדיקת בטיחות על ידי ניידת בטיחות או משטרה',
  'נבדקה דיסקית הטכוגרף יחד עם הנהג',
  'הנהג נשאל אם יש לו שאלות בנושא חוק שירותי הובלה',
  'הנהג נשאל אם יש לו שאלות על הפעלת הרכב בהתאם לתקנה 25 לתקנות התעבורה',
  'נבדקה בקיאות הנהג בתקנות חדשות, ובוצע רענון לתקנות ישנות',
  'וודא שהנהג בקיא בדרישות החוק לגבי שעות עבודה ומנוחה',
] as const;

export function newItemId(): string {
  return `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function driverMeetingForm(): ChecklistForm {
  return {
    version: 1,
    intro: '',
    items: DRIVER_MEETING_ITEMS.map((text) => ({ id: newItemId(), text })),
    allowNa: false,
    labels: { ...DEFAULT_LABELS },
    // Safety officers meet each driver every quarter.
    repeatMonths: 3,
  };
}

export function blankChecklistForm(): ChecklistForm {
  return { version: 1, intro: '', items: [{ id: newItemId(), text: '' }], allowNa: false, labels: { ...DEFAULT_LABELS }, repeatMonths: 0 };
}

function repeatMonthsOf(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 24 ? value : 0;
}

/** The answers offered next to each item, in reading order. */
export function statusOptions(form: Pick<ChecklistForm, 'allowNa'>): ChecklistStatus[] {
  return form.allowNa ? ['done', 'not_done', 'na'] : ['done', 'not_done'];
}

/**
 * Words, icons and colours for each answer. Colour is never alone: every
 * answer is also spelled out and has its own icon.
 */
export const STATUS_META: Record<ChecklistStatus, { label: string; icon: 'checkmark' | 'close' | 'remove'; fg: string; soft: string; fill: string }> = {
  done: { get label() { return t('checklist.done'); }, icon: 'checkmark', fg: '#0B7D57', soft: '#E4F7EF', fill: '#22C48A' },
  not_done: { get label() { return t('checklist.notDone'); }, icon: 'close', fg: '#C21F37', soft: '#FFE8EB', fill: '#FF4D5E' },
  na: { get label() { return t('status.notRelevant'); }, icon: 'remove', fg: '#56657A', soft: '#EEF1F6', fill: '#8593A6' },
};

/** Items with text; an empty row the admin left in the builder is not part of the form. */
export function filledItems(form: Pick<ChecklistForm, 'items'>): ChecklistItem[] {
  return form.items.filter((item) => item.text.trim().length > 0);
}

export function answeredCount(form: Pick<ChecklistForm, 'items'>, answers: ChecklistAnswers): number {
  return filledItems(form).filter((item) => !!answers[item.id]?.status).length;
}

export function allAnswered(form: Pick<ChecklistForm, 'items'>, answers: ChecklistAnswers): boolean {
  const items = filledItems(form);
  return items.length > 0 && items.every((item) => !!answers[item.id]?.status);
}

/** Why the form cannot be saved yet, in plain words, or null when it can. */
export function formProblem(title: string, form: ChecklistForm): string | null {
  if (!title.trim()) return t('checklist.formNameMissing');
  const items = filledItems(form);
  if (!items.length) return t('checklist.writeOneItem');
  if (items.length > CHECKLIST_LIMITS.items) return t('checklist.maxItems', { items: CHECKLIST_LIMITS.items });
  if (items.some((item) => item.text.trim().length > CHECKLIST_LIMITS.itemText)) return t('checklist.maxItemText', { itemText: CHECKLIST_LIMITS.itemText });
  if (!form.labels.officer.trim() || !form.labels.driver.trim()) return t('checklist.signatureTitleMissing');
  return null;
}

/** The form as saved: trimmed, without empty rows. */
export function cleanForm(form: ChecklistForm): ChecklistForm {
  return {
    version: 1,
    intro: form.intro.trim().slice(0, CHECKLIST_LIMITS.intro),
    items: filledItems(form).map((item) => ({ id: item.id, text: item.text.replace(/\s+/g, ' ').trim().slice(0, CHECKLIST_LIMITS.itemText) })),
    allowNa: !!form.allowNa,
    labels: {
      officer: form.labels.officer.trim().slice(0, CHECKLIST_LIMITS.label) || DEFAULT_LABELS.officer,
      driver: form.labels.driver.trim().slice(0, CHECKLIST_LIMITS.label) || DEFAULT_LABELS.driver,
    },
    repeatMonths: repeatMonthsOf(form.repeatMonths),
  };
}

/** Reads a stored form defensively; anything unexpected becomes null. */
export function readForm(value: unknown): ChecklistForm | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.items)) return null;
  const items = raw.items
    .filter((item): item is { id: string; text: string } => !!item && typeof (item as ChecklistItem).id === 'string' && typeof (item as ChecklistItem).text === 'string')
    .map((item) => ({ id: item.id, text: item.text }));
  const labels = (raw.labels ?? {}) as Record<string, unknown>;
  return {
    version: 1,
    intro: typeof raw.intro === 'string' ? raw.intro : '',
    items,
    allowNa: raw.allowNa === true,
    labels: {
      officer: typeof labels.officer === 'string' && labels.officer.trim() ? labels.officer : DEFAULT_LABELS.officer,
      driver: typeof labels.driver === 'string' && labels.driver.trim() ? labels.driver : DEFAULT_LABELS.driver,
    },
    repeatMonths: repeatMonthsOf(raw.repeatMonths),
  };
}

export function isChecklistTemplate(template: Pick<SigningTemplate, 'form_kind'> | null | undefined): boolean {
  return template?.form_kind === 'checklist';
}

// ── Meetings ─────────────────────────────────────────────────────────────

export type MeetingRow = {
  id: string;
  company_id: string;
  template_id: string | null;
  driver_id: string;
  title: string;
  status: 'draft' | 'signed' | 'cancelled';
  form: unknown;
  answers: ChecklistAnswers;
  meeting_date: string;
  officer_name: string | null;
  officer_signature: string | null;
  signature_request_id: string | null;
  signed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Where a meeting stands, from its own row and its signature request. */
export type MeetingState = 'draft' | 'awaiting_driver' | 'completed' | 'requires_attention' | 'cancelled';

export function meetingState(meeting: Pick<MeetingRow, 'status'>, requestStatus?: string | null): MeetingState {
  if (meeting.status === 'cancelled' || requestStatus === 'cancelled') return 'cancelled';
  if (meeting.status === 'draft') return 'draft';
  if (requestStatus === 'declined' || requestStatus === 'failed') return 'requires_attention';
  return requestStatus === 'completed' ? 'completed' : 'awaiting_driver';
}

export const MEETING_STATE_LABEL: Record<MeetingState, string> = {
  get draft() { return t('checklist.draftNotSigned'); },
  get awaiting_driver() { return t('common.awaitingDriverSignature'); },
  get completed() { return t('common.signedDone'); },
  get requires_attention() { return t('status.needsAttention'); },
  get cancelled() { return t('common.cancelled'); },
};

/** Today in the device's calendar, as YYYY-MM-DD. */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** "26/09/2026" from YYYY-MM-DD, without time-zone drift. */
export function formatIsoDay(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

async function invoke<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('checklist-meeting', { body });
  if (error || data?.error) throw new Error(await functionErrorMessage(error, data, fallback, false));
  return data as T;
}

export async function listDriverMeetings(driverId: string): Promise<MeetingRow[]> {
  const { data, error } = await supabase
    .from('checklist_meetings')
    .select('*')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MeetingRow[];
}

export async function getMeeting(meetingId: string): Promise<MeetingRow | null> {
  const { data, error } = await supabase.from('checklist_meetings').select('*').eq('id', meetingId).maybeSingle();
  if (error) throw error;
  return (data as MeetingRow | null) ?? null;
}

/** A company form to hold a meeting on: its title and its items. */
export async function getChecklistTemplate(templateId: string): Promise<{ id: string; title: string; companyId: string | null; form: ChecklistForm } | null> {
  const { data, error } = await supabase
    .from('signing_templates')
    .select('id, title, company_id, form_kind, form_content, archived_at')
    .eq('id', templateId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.form_kind !== 'checklist' || data.archived_at) return null;
  const form = readForm(data.form_content);
  return form ? { id: data.id, title: data.title, companyId: data.company_id, form } : null;
}

/** The driver's side of a signed meeting: 'pending' until the driver signs. */
export async function getRequestStatus(requestId: string): Promise<string | null> {
  const { data, error } = await supabase.from('signature_requests').select('status').eq('id', requestId).maybeSingle();
  if (error) throw error;
  return data?.status ?? null;
}

/** Names that already signed meetings in this company, most recent first, for one-tap reuse. */
export async function recentOfficerNames(companyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('checklist_meetings')
    .select('officer_name, signed_at')
    .eq('company_id', companyId)
    .not('officer_name', 'is', null)
    .order('signed_at', { ascending: false, nullsFirst: false })
    .limit(40);
  if (error) return [];
  const names: string[] = [];
  for (const row of data ?? []) {
    const name = (row.officer_name ?? '').trim();
    if (name && !names.includes(name)) names.push(name);
    if (names.length === 4) break;
  }
  return names;
}

type MeetingInput = { answers: ChecklistAnswers; officerName: string; meetingDate: string };

/** Starts a meeting (or saves one in progress). The server keeps its own copy of the form. */
export async function saveMeetingDraft(
  companyId: string,
  target: { meetingId: string } | { templateId: string; driverId: string },
  input: MeetingInput,
): Promise<MeetingRow> {
  const { meeting } = await invoke<{ meeting: MeetingRow }>({ action: 'save', companyId, ...target, ...input }, t('common.saveDraftFailed'));
  return meeting;
}

/**
 * The officer signs. The document is created with the officer's signature
 * already on it and waits for the driver. `notifyDriver` sends the driver an
 * in-app notice (the "שליחה לנהג" path).
 */
export async function signMeeting(
  companyId: string,
  meetingId: string,
  input: MeetingInput & { officerSignature: string; notifyDriver: boolean },
): Promise<{ meeting: MeetingRow; requestId: string; /** The driver's next meeting, on a repeating form. */ nextDue?: string | null }> {
  return invoke({ action: 'sign', companyId, meetingId, ...input }, t('common.saveSignatureFailed'));
}

/** The driver signs on the manager's device. */
export async function driverSignMeeting(companyId: string, meetingId: string, driverSignature: string): Promise<{ status: 'completed'; filePending: boolean }> {
  return invoke({ action: 'driver-sign', companyId, meetingId, driverSignature }, t('common.saveDriverSignatureFailed'));
}

/** Sends the driver a notice for a meeting the officer already signed. */
export async function notifyMeetingDriver(companyId: string, meetingId: string): Promise<void> {
  await invoke({ action: 'notify', companyId, meetingId }, t('common.sendToDriverFailed'));
}

/** Deletes a meeting at any stage, with its document, everywhere. */
export async function cancelMeeting(companyId: string, meetingId: string): Promise<void> {
  await invoke({ action: 'cancel', companyId, meetingId }, t('checklist.deleteMeetingFailed'));
}

export async function createChecklistTemplate(companyId: string, draftId: string, title: string, form: ChecklistForm): Promise<SigningTemplate> {
  const { data, error } = await supabase.functions.invoke('company-signing-template', {
    body: { action: 'create', kind: 'checklist', companyId, draftId, title, form: cleanForm(form) },
  });
  if (error || data?.error) throw new Error(await functionErrorMessage(error, data, t('checklist.saveFormFailed'), false));
  return (data as { template: SigningTemplate }).template;
}
