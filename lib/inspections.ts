import { supabase } from './supabase';
import { functionErrorMessage } from './functionError';
import { t } from './i18n';

/**
 * "בדיקות בטיחות": the safety officer walks around a vehicle, marks every item
 * תקין / לא תקין / לא רלוונטי, writes what is wrong, types their name and
 * signs; then the vehicle's driver signs, on the same device or later from
 * their own phone (plans/vehicle-safety-inspection-plan.html).
 *
 * The server (supabase/functions/vehicle-inspection, _shared/inspectionDocument.ts)
 * checks the same rules and renders the PDF from the same model. The plan of
 * who is due when lives in the database (supabase/sql/103), which also sends
 * the managers their reminders.
 */

export type InspectionStatus = 'ok' | 'not_ok' | 'na';
export type InspectionItem = { id: string; text: string };
export type InspectionGroup = { id: string; title: string; items: InspectionItem[] };
export type InspectionForm = { version: 1; groups: InspectionGroup[] };
export type InspectionAnswer = { status: InspectionStatus | null; note: string };
export type InspectionAnswers = Record<string, InspectionAnswer>;

export { INSPECTION_TITLE, LEGACY_INSPECTION_TITLE } from './inspectionTitle';

export const INSPECTION_LIMITS = {
  groups: 12,
  items: 80,
  groupTitle: 60,
  itemText: 160,
  note: 300,
  extraDefects: 20,
  officerName: 80,
  closedNote: 300,
} as const;

export const INSPECTION_DISCLAIMER =
  'בדיקה זו נעשית במבט חיצוני בלבד ואינה מחליפה טיפול או בדיקה במוסך. על הנהג לדווח מיד לממונה על כל תקלה, או חשד לתקלה, שעלולה לפגוע בבטיחות הנסיעה.';

/** The ready-made list, in the order you walk around a vehicle. Same as the server's DEFAULT_INSPECTION_FORM. */
export const DEFAULT_INSPECTION_FORM: InspectionForm = {
  version: 1,
  groups: [
    { id: 'outside', title: 'מבחוץ', items: [
      { id: 'out-glass', text: 'שמשות, מגבים ומתזים' },
      { id: 'out-mirrors', text: 'מראות' },
      { id: 'out-doors', text: 'דלתות ונעילה' },
      { id: 'out-body', text: 'פחחות: פגיעות ושריטות' },
      { id: 'out-signs', text: 'שילוט על דפנות הרכב' },
    ] },
    { id: 'wheels', title: 'גלגלים ובלימה', items: [
      { id: 'whl-tyres', text: 'מצב הצמיגים ולחץ האוויר' },
      { id: 'whl-nuts', text: 'הידוק ברגי הגלגלים' },
      { id: 'whl-brakes', text: 'בלמים ובלם עזר' },
      { id: 'whl-spare', text: 'גלגל חלופי, מגבה ומפתח' },
    ] },
    { id: 'under', title: 'מתחת למכסה ומתחת לרכב', items: [
      { id: 'und-leaks', text: 'נזילות: שמן, סולר, מים' },
      { id: 'und-air', text: 'דליפות אוויר' },
      { id: 'und-steer', text: 'היגוי' },
      { id: 'und-exhaust', text: 'מערכת פליטה' },
      { id: 'und-battery', text: 'מצברים וכבלים' },
    ] },
    { id: 'lights', title: 'תאורה ולוח שעונים', items: [
      { id: 'lgt-lamps', text: 'פנסים ואיתות' },
      { id: 'lgt-inside', text: 'תאורת פנים' },
      { id: 'lgt-warn', text: 'נורות אזהרה בלוח' },
      { id: 'lgt-tacho', text: 'מד מהירות וטכוגרף' },
      { id: 'lgt-horn', text: 'צופר וזמזם רוורס' },
      { id: 'lgt-ac', text: 'מיזוג' },
    ] },
    { id: 'cabin', title: 'תא הנוסעים', items: [
      { id: 'cab-clean', text: 'ניקיון כללי' },
      { id: 'cab-seats', text: 'מושבים וחגורות' },
      { id: 'cab-exits', text: 'פטישי חילוץ ויציאות חירום' },
      { id: 'cab-audio', text: 'רמקולים ומיקרופון' },
    ] },
    { id: 'kit', title: 'ציוד חובה ומסמכים', items: [
      { id: 'kit-fire', text: 'מטפי כיבוי' },
      { id: 'kit-aid', text: 'ערכת עזרה ראשונה' },
      { id: 'kit-triangle', text: 'משולש אזהרה ואפוד זוהר' },
      { id: 'kit-papers', text: 'רישיון רכב וביטוח ברכב' },
    ] },
  ],
};

/**
 * Words, icons and colours for each answer. Colour is never alone: every
 * answer is also spelled out and has its own icon.
 */
export const INSPECTION_STATUS_META: Record<InspectionStatus, { label: string; icon: 'checkmark' | 'close' | 'remove'; fg: string; soft: string; fill: string }> = {
  ok: { get label() { return t('status.ok'); }, icon: 'checkmark', fg: '#0B7D57', soft: '#E4F7EF', fill: '#22C48A' },
  not_ok: { get label() { return t('status.notOk'); }, icon: 'close', fg: '#C21F37', soft: '#FFE8EB', fill: '#FF4D5E' },
  na: { get label() { return t('status.notRelevant'); }, icon: 'remove', fg: '#56657A', soft: '#EEF1F6', fill: '#8593A6' },
};

export const INSPECTION_STATUSES: InspectionStatus[] = ['ok', 'not_ok', 'na'];

export function formItems(form: Pick<InspectionForm, 'groups'>): InspectionItem[] {
  return form.groups.flatMap((group) => group.items);
}

export function answeredCount(form: InspectionForm, answers: InspectionAnswers): number {
  return formItems(form).filter((item) => !!answers[item.id]?.status).length;
}

/** "לא תקין" items that still need a line about what is wrong. */
export function missingDefectNotes(form: InspectionForm, answers: InspectionAnswers): InspectionItem[] {
  return formItems(form).filter((item) => answers[item.id]?.status === 'not_ok' && !answers[item.id]?.note.trim());
}

/** Why the officer cannot sign yet, in plain words, or null. The server checks the same. */
export function inspectionProblem(form: InspectionForm, answers: InspectionAnswers): string | null {
  const open = formItems(form).length - answeredCount(form, answers);
  if (open > 0) return open === 1 ? t('inspection.oneItemLeft') : t('inspection.itemsLeft', { open });
  const notes = missingDefectNotes(form, answers).length;
  if (notes > 0) return notes === 1 ? t('inspection.oneNoteMissing') : t('inspection.notesMissing', { notes });
  return null;
}

/** Every defect, in the order of the list, then the ones written freely. */
export function defectLines(form: InspectionForm, answers: InspectionAnswers, extra: string[]): string[] {
  const listed = formItems(form)
    .filter((item) => answers[item.id]?.status === 'not_ok')
    .map((item) => (answers[item.id]?.note.trim() ? `${item.text}: ${answers[item.id].note.trim()}` : item.text));
  return [...listed, ...extra.map((line) => line.trim()).filter(Boolean)];
}

/** Reads a stored list defensively; anything unexpected becomes null. */
export function readInspectionForm(value: unknown): InspectionForm | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.groups)) return null;
  const groups: InspectionGroup[] = [];
  for (const group of raw.groups) {
    if (!group || typeof group !== 'object') continue;
    const g = group as Record<string, unknown>;
    if (typeof g.id !== 'string' || typeof g.title !== 'string' || !Array.isArray(g.items)) continue;
    const items = g.items
      .filter((item): item is InspectionItem => !!item && typeof (item as InspectionItem).id === 'string' && typeof (item as InspectionItem).text === 'string')
      .map((item) => ({ id: item.id, text: item.text }));
    if (items.length) groups.push({ id: g.id, title: g.title, items });
  }
  return groups.length ? { version: 1, groups } : null;
}

export function readExtraDefects(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((line): line is string => typeof line === 'string') : [];
}

export function newListId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Why an edited list cannot be saved yet, or null. */
export function listProblem(form: InspectionForm): string | null {
  const groups = form.groups.filter((group) => group.title.trim() || group.items.some((item) => item.text.trim()));
  if (!groups.length) return t('inspection.needGroupWithItem');
  if (groups.length > INSPECTION_LIMITS.groups) return t('inspection.maxGroups', { groups: INSPECTION_LIMITS.groups });
  if (groups.some((group) => !group.title.trim())) return t('inspection.groupNeedsName');
  if (groups.some((group) => !group.items.some((item) => item.text.trim()))) return t('inspection.groupNeedsItem');
  const count = groups.reduce((sum, group) => sum + group.items.filter((item) => item.text.trim()).length, 0);
  if (count > INSPECTION_LIMITS.items) return t('inspection.maxItems', { items: INSPECTION_LIMITS.items });
  return null;
}

/** The list as saved: trimmed, without empty rows or empty groups. */
export function cleanList(form: InspectionForm): InspectionForm {
  return {
    version: 1,
    groups: form.groups
      .map((group) => ({
        id: group.id,
        title: group.title.replace(/\s+/g, ' ').trim().slice(0, INSPECTION_LIMITS.groupTitle),
        items: group.items
          .map((item) => ({ id: item.id, text: item.text.replace(/\s+/g, ' ').trim().slice(0, INSPECTION_LIMITS.itemText) }))
          .filter((item) => item.text),
      }))
      .filter((group) => group.title && group.items.length),
  };
}

// ── Inspections ──────────────────────────────────────────────────────────

export type InspectionFacts = {
  plate: string;
  vehicle: string;
  odometer: number;
  driverName: string;
  inspectionDate: string;
  nextDue: string | null;
  testUntil: string | null;
  insuranceUntil: string | null;
};

export type InspectionRow = {
  id: string;
  company_id: string;
  vehicle_id: string;
  driver_id: string | null;
  title: string;
  form: unknown;
  answers: InspectionAnswers;
  extra_defects: unknown;
  defect_count: number;
  odometer: number | null;
  inspection_date: string;
  officer_name: string | null;
  officer_signature: string | null;
  facts: InspectionFacts | null;
  status: 'draft' | 'signed' | 'closed' | 'cancelled';
  signature_request_id: string | null;
  signed_at: string | null;
  closed_note: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Where an inspection stands, from its own row and its signature request. */
export type InspectionState = 'draft' | 'awaiting_driver' | 'completed' | 'closed' | 'requires_attention' | 'cancelled';

export function inspectionState(inspection: Pick<InspectionRow, 'status' | 'signature_request_id'>, requestStatus?: string | null): InspectionState {
  if (inspection.status === 'cancelled') return 'cancelled';
  if (inspection.status === 'draft') return 'draft';
  if (inspection.status === 'closed') return 'closed';
  if (requestStatus === 'completed') return 'completed';
  if (requestStatus === 'pending') return 'awaiting_driver';
  // Declined, failed, cancelled from the driver's folder, or removed.
  return 'requires_attention';
}

export const INSPECTION_STATE_META: Record<InspectionState, { label: string; tone: 'ok' | 'soon' | 'expired' | 'missing' | 'info' }> = {
  draft: { get label() { return t('status.draft'); }, tone: 'missing' },
  awaiting_driver: { get label() { return t('inspection.awaitingDriverSignature'); }, tone: 'soon' },
  completed: { get label() { return t('status.signed'); }, tone: 'ok' },
  closed: { get label() { return t('inspection.closedWithoutDriver'); }, tone: 'info' },
  requires_attention: { get label() { return t('status.needsAttention'); }, tone: 'expired' },
  cancelled: { get label() { return t('common.cancelled'); }, tone: 'missing' },
};

/**
 * A finished document exists: the driver signed, or a manager closed the
 * inspection without them. A cancelled inspection keeps the one it had.
 */
export function hasDocument(row: Pick<InspectionRow, 'status' | 'closed_at'>, requestStatus?: string | null): boolean {
  if (row.status === 'closed' || (row.status === 'cancelled' && !!row.closed_at)) return true;
  return (row.status === 'signed' || row.status === 'cancelled') && requestStatus === 'completed';
}

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

export type InspectionListRow = InspectionRow & {
  vehicle: { id: string; plate_number: string; manufacturer: string | null; model: string | null } | null;
  driver: { id: string; full_name: string | null } | null;
  request: { id: string; status: string } | null;
};

const LIST_COLUMNS =
  'id, company_id, vehicle_id, driver_id, title, form, answers, extra_defects, defect_count, odometer, inspection_date, officer_name, officer_signature, facts, status, signature_request_id, signed_at, closed_note, closed_at, cancelled_at, created_at, updated_at,' +
  ' vehicle:vehicle_id(id, plate_number, manufacturer, model), driver:driver_id(id, full_name), request:signature_request_id(id, status)';

/** The company's inspections, newest first; one vehicle's when `vehicleId` is given. */
export async function listInspections(companyId: string, vehicleId?: string): Promise<InspectionListRow[]> {
  const rows: InspectionListRow[] = [];
  const page = 500;
  for (let from = 0; ; from += page) {
    let query = supabase.from('vehicle_inspections').select(LIST_COLUMNS).eq('company_id', companyId);
    if (vehicleId) query = query.eq('vehicle_id', vehicleId);
    const { data, error } = await query
      .order('inspection_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + page - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as InspectionListRow[]));
    if (!data || data.length < page) break;
  }
  return rows;
}

export async function getInspection(inspectionId: string): Promise<InspectionListRow | null> {
  const { data, error } = await supabase.from('vehicle_inspections').select(LIST_COLUMNS).eq('id', inspectionId).maybeSingle();
  if (error) throw error;
  return (data as unknown as InspectionListRow | null) ?? null;
}

export function listStateOf(row: InspectionListRow): InspectionState {
  return inspectionState(row, row.request?.status ?? null);
}

/** Names that already signed inspections (or meetings) in this company, most recent first, for one-tap reuse. */
export async function recentInspectorNames(companyId: string): Promise<string[]> {
  const [inspections, meetings] = await Promise.all([
    supabase.from('vehicle_inspections').select('officer_name, signed_at').eq('company_id', companyId)
      .not('officer_name', 'is', null).not('signed_at', 'is', null).order('signed_at', { ascending: false }).limit(40),
    supabase.from('checklist_meetings').select('officer_name, signed_at').eq('company_id', companyId)
      .not('officer_name', 'is', null).not('signed_at', 'is', null).order('signed_at', { ascending: false }).limit(40),
  ]);
  const rows = [...(inspections.data ?? []), ...(meetings.data ?? [])]
    .sort((a, b) => String(b.signed_at).localeCompare(String(a.signed_at)));
  const names: string[] = [];
  for (const row of rows) {
    const name = (row.officer_name ?? '').trim();
    if (name && !names.includes(name)) names.push(name);
    if (names.length === 4) break;
  }
  return names;
}

// ── Settings ─────────────────────────────────────────────────────────────

export type InspectionSettings = { repeatMonths: number; form: InspectionForm | null };

export const INSPECTION_REPEAT_OPTIONS = [
  { months: 1, get label() { return t('frequency.monthly'); } },
  { months: 2, get label() { return t('frequency.every2Months'); } },
  { months: 3, get label() { return t('frequency.every3Months'); } },
  { months: 6, get label() { return t('frequency.every6Months'); } },
  { months: 12, get label() { return t('frequency.yearly'); } },
  { months: 0, get label() { return t('frequency.noReminders'); } },
] as const;

export function inspectionRepeatLabel(months: number): string {
  return INSPECTION_REPEAT_OPTIONS.find((o) => o.months === months)?.label ?? t('frequency.everyNMonths', { months });
}

export async function getInspectionSettings(companyId: string): Promise<InspectionSettings> {
  const { data, error } = await supabase.from('vehicle_inspection_settings').select('repeat_months, form').eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  return {
    repeatMonths: typeof data?.repeat_months === 'number' ? data.repeat_months : 1,
    form: data?.form ? readInspectionForm(data.form) : null,
  };
}

// ── Plan: which vehicle is due when ──────────────────────────────────────

export type InspectionPlanRow = {
  vehicleId: string;
  vehicleLabel: string;
  plate: string;
  lastInspectionId: string | null;
  lastInspection: string | null;
  /** Defects found in the last inspection; the vehicle carries "יש ליקויים" until the next one. */
  lastDefects: number;
  nextDue: string | null;
  firstInspection: boolean;
};

type PlanRpcRow = {
  vehicle_id: string;
  vehicle_label: string;
  plate_number: string;
  last_inspection_id: string | null;
  last_inspection: string | null;
  last_defects: number | null;
  next_due: string | null;
  first_inspection: boolean;
};

/** Every vehicle in use, soonest due first. */
export async function loadInspectionPlan(companyId: string): Promise<InspectionPlanRow[]> {
  const { data, error } = await supabase.rpc('list_vehicle_inspection_plan', { p_company_id: companyId });
  if (error) throw error;
  return ((data ?? []) as PlanRpcRow[]).map((row) => ({
    vehicleId: row.vehicle_id,
    vehicleLabel: row.vehicle_label,
    plate: row.plate_number,
    lastInspectionId: row.last_inspection_id,
    lastInspection: row.last_inspection,
    lastDefects: row.last_defects ?? 0,
    nextDue: row.next_due,
    firstInspection: row.first_inspection,
  }));
}

// ── Server actions ───────────────────────────────────────────────────────

async function invoke<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('vehicle-inspection', { body });
  if (error || data?.error) throw new Error(await functionErrorMessage(error, data, fallback, false));
  return data as T;
}

export type InspectionInput = {
  answers: InspectionAnswers;
  extraDefects: string[];
  odometer: number | null;
  officerName: string;
  driverId: string | null;
};

/** Starts an inspection of a vehicle (or saves one in progress). The server keeps its own copy of the list. */
export async function saveInspectionDraft(
  companyId: string,
  target: { inspectionId: string } | { vehicleId: string },
  input: InspectionInput,
): Promise<InspectionRow> {
  const { inspection } = await invoke<{ inspection: InspectionRow }>({ action: 'save', companyId, ...target, ...input }, t('common.saveDraftFailed'));
  return inspection;
}

/** The officer signs; the document waits for the driver. Returns the vehicle's next inspection, when set. */
export async function signInspection(
  companyId: string,
  inspectionId: string,
  input: InspectionInput & { officerSignature: string; notifyDriver: boolean },
): Promise<{ inspection: InspectionRow; requestId: string; nextDue: string | null }> {
  return invoke({ action: 'sign', companyId, inspectionId, ...input }, t('common.saveSignatureFailed'));
}

export async function driverSignInspection(companyId: string, inspectionId: string, driverSignature: string): Promise<{ status: 'completed'; filePending: boolean }> {
  return invoke({ action: 'driver-sign', companyId, inspectionId, driverSignature }, t('common.saveDriverSignatureFailed'));
}

export async function notifyInspectionDriver(companyId: string, inspectionId: string): Promise<void> {
  await invoke({ action: 'notify', companyId, inspectionId }, t('common.sendToDriverFailed'));
}

/** The driver never signed: the document is issued with the officer's signature and this note. */
export async function closeInspection(companyId: string, inspectionId: string, note: string): Promise<InspectionRow> {
  const { inspection } = await invoke<{ inspection: InspectionRow }>({ action: 'close', companyId, inspectionId, note }, t('inspection.closeFailed'));
  return inspection;
}

/** A draft is thrown away; a signed inspection stays, marked "בוטל". */
export async function cancelInspection(companyId: string, inspectionId: string): Promise<{ removed?: boolean }> {
  return invoke({ action: 'cancel', companyId, inspectionId }, t('inspection.cancelFailed'));
}

/** A short-lived link to the finished PDF. */
export async function inspectionDocument(companyId: string, inspectionId: string): Promise<{ url: string; fileName: string }> {
  return invoke({ action: 'document', companyId, inspectionId }, t('common.openDocumentFailed'));
}

export async function setNextInspectionDate(companyId: string, vehicleId: string, nextDue: string): Promise<void> {
  await invoke({ action: 'set-next', companyId, vehicleId, nextDue }, t('common.saveDateFailed'));
}

/** How often vehicles are checked, and/or the company's own list (null brings back the ready-made one). */
export async function saveInspectionSettings(
  companyId: string,
  patch: { repeatMonths?: number; form?: InspectionForm | null },
): Promise<InspectionSettings> {
  const { settings } = await invoke<{ settings: { repeat_months: number; form: unknown } }>(
    { action: 'settings', companyId, ...patch, ...(patch.form ? { form: cleanList(patch.form) } : {}) },
    t('common.saveSettingsFailed'),
  );
  return { repeatMonths: settings.repeat_months, form: settings.form ? readInspectionForm(settings.form) : null };
}
