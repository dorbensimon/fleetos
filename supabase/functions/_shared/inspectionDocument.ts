/**
 * "בדיקות בטיחות" (lib/inspections.ts on the app side): the inspection list's
 * server-side checks and the HTML DocuSeal turns into the PDF.
 *
 * Two signers, like a checklist meeting (checklistDocument.ts): the safety
 * officer signs first, by hand on the manager's device, and the drawing is
 * stamped into their field through the API; the driver signs second. When
 * the driver never signs, a manager closes the inspection and the document
 * is issued again with the officer's signature only and the manager's note
 * in the driver's place.
 */

export const OFFICER_ROLE = 'החברה';
export const DRIVER_ROLE = 'נהג';
export const OFFICER_FIELD = 'חתימת קצין הבטיחות';
export const DRIVER_FIELD = 'חתימת הנהג';

export const INSPECTION_TITLE = 'בדיקת קצין בטיחות לרכב';

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

export const DISCLAIMER =
  'בדיקה זו נעשית במבט חיצוני בלבד ואינה מחליפה טיפול או בדיקה במוסך. על הנהג לדווח מיד לממונה על כל תקלה, או חשד לתקלה, שעלולה לפגוע בבטיחות הנסיעה.';

export type InspectionStatus = 'ok' | 'not_ok' | 'na';
export type InspectionForm = {
  version: 1;
  groups: Array<{ id: string; title: string; items: Array<{ id: string; text: string }> }>;
};
export type InspectionAnswers = Record<string, { status: InspectionStatus | null; note: string }>;

const STATUS_LABEL: Record<InspectionStatus, string> = { ok: 'תקין', not_ok: 'לא תקין', na: 'לא רלוונטי' };
const STATUSES: InspectionStatus[] = ['ok', 'not_ok', 'na'];
const ID = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * The ready-made list, in the order you walk around a vehicle. The same list
 * is in lib/inspections.ts (DEFAULT_INSPECTION_FORM); keep the two in step.
 */
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

function oneLine(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** A list as a company saved it, or null if anything is off. */
export function parseInspectionForm(raw: unknown): InspectionForm | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.groups) || value.groups.length === 0 || value.groups.length > INSPECTION_LIMITS.groups) return null;
  const ids = new Set<string>();
  const groups: InspectionForm['groups'] = [];
  let count = 0;
  for (const group of value.groups) {
    if (!group || typeof group !== 'object') return null;
    const { id, title, items } = group as Record<string, unknown>;
    if (typeof id !== 'string' || !ID.test(id) || ids.has(`g:${id}`)) return null;
    ids.add(`g:${id}`);
    const groupTitle = oneLine(title, INSPECTION_LIMITS.groupTitle);
    if (!groupTitle || !Array.isArray(items) || items.length === 0) return null;
    const parsedItems: Array<{ id: string; text: string }> = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') return null;
      const { id: itemId, text } = item as Record<string, unknown>;
      if (typeof itemId !== 'string' || !ID.test(itemId) || ids.has(itemId)) return null;
      const itemText = oneLine(text, INSPECTION_LIMITS.itemText);
      if (!itemText) return null;
      ids.add(itemId);
      parsedItems.push({ id: itemId, text: itemText });
    }
    count += parsedItems.length;
    groups.push({ id, title: groupTitle, items: parsedItems });
  }
  if (count > INSPECTION_LIMITS.items) return null;
  return { version: 1, groups };
}

export function formItems(form: InspectionForm): Array<{ id: string; text: string }> {
  return form.groups.flatMap((group) => group.items);
}

/** Answers for the list's own items only; an unknown status or item is dropped. */
export function parseInspectionAnswers(raw: unknown, form: InspectionForm): InspectionAnswers {
  const answers: InspectionAnswers = {};
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  for (const item of formItems(form)) {
    const entry = source[item.id];
    if (!entry || typeof entry !== 'object') continue;
    const { status, note } = entry as Record<string, unknown>;
    const parsedStatus = typeof status === 'string' && (STATUSES as string[]).includes(status) ? status as InspectionStatus : null;
    const parsedNote = typeof note === 'string' ? note.replace(/\s+/g, ' ').trim().slice(0, INSPECTION_LIMITS.note) : '';
    if (parsedStatus || parsedNote) answers[item.id] = { status: parsedStatus, note: parsedNote };
  }
  return answers;
}

/** Free defects: short lines, empty ones dropped. */
export function parseExtraDefects(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((line) => oneLine(line, INSPECTION_LIMITS.note))
    .filter(Boolean)
    .slice(0, INSPECTION_LIMITS.extraDefects);
}

/** Why the officer cannot sign yet, or null. Every item marked; every "לא תקין" says what is wrong. */
export function inspectionProblem(form: InspectionForm, answers: InspectionAnswers): string | null {
  const items = formItems(form);
  if (items.some((item) => !answers[item.id]?.status)) return 'יש לסמן כל סעיף לפני החתימה';
  if (items.some((item) => answers[item.id]?.status === 'not_ok' && !answers[item.id]?.note)) {
    return 'בכל סעיף "לא תקין" יש לכתוב מה הבעיה';
  }
  return null;
}

export function defectCount(form: InspectionForm, answers: InspectionAnswers, extra: string[]): number {
  return formItems(form).filter((item) => answers[item.id]?.status === 'not_ok').length + extra.length;
}

export function isIsoDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** YYYY-MM-DD plus whole months; the 31st lands on the month's last day. */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export function dayText(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export type Letterhead = { name: string; logoUrl: string | null };

/** What the document prints about the vehicle and the driver, as it was on the day. */
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

type RenderInput = {
  form: InspectionForm;
  letterhead: Letterhead;
  facts: InspectionFacts;
  answers: InspectionAnswers;
  extraDefects: string[];
  officerName: string;
  /** Set when the inspection was closed without the driver: printed in the driver's place, and no driver field. */
  closedNote?: { text: string; by: string; on: string } | null;
};

/** Israeli plate in its usual groups: 12-345-67 / 123-45-678. */
export function formatPlate(plate: string): string {
  const digits = plate.replace(/\D/g, '');
  if (digits.length === 7) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  if (digits.length === 8) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  return plate;
}

/** A date that has passed, or is within 30 days of the inspection, is printed in red. */
function dueSoon(date: string | null, from: string): boolean {
  if (!date) return false;
  const limit = new Date(`${from}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + 30);
  return date <= limit.toISOString().slice(0, 10);
}

/**
 * The page matches the checklist meeting's document (A4 at 96dpi, the same
 * letterhead), so every company document looks like one family.
 */
export function renderInspectionHtml({ form, letterhead, facts, answers, extraDefects, officerName, closedNote }: RenderInput): string {
  const logo = letterhead.logoUrl
    ? `<span class="lh-logo"><img src="${escapeHtml(letterhead.logoUrl)}" alt=""></span>`
    : `<span class="lh-logo lh-mono">${escapeHtml(letterhead.name.charAt(0))}</span>`;
  const date = dayText(facts.inspectionDate);

  const fact = (label: string, value: string, warn = false) =>
    `<div class="fact${warn ? ' warn' : ''}"><span class="fact-l">${label}</span><span class="fact-v">${value ? escapeHtml(value) : '—'}</span></div>`;
  const facts8 = [
    fact('מספר רכב', formatPlate(facts.plate)),
    fact('יצרן ודגם', facts.vehicle),
    fact('קילומטראז׳', facts.odometer.toLocaleString('en-US')),
    fact('נהג', facts.driverName),
    fact('תאריך הבדיקה', date),
    fact('הבדיקה הבאה', dayText(facts.nextDue)),
    fact('טסט בתוקף עד', dayText(facts.testUntil), dueSoon(facts.testUntil, facts.inspectionDate)),
    fact('ביטוח חובה בתוקף עד', dayText(facts.insuranceUntil), dueSoon(facts.insuranceUntil, facts.inspectionDate)),
  ].join('');

  let number = 0;
  const groups = form.groups.map((group) => {
    const rows = group.items.map((item) => {
      number += 1;
      const answer = answers[item.id];
      const status = answer?.status
        ? `<span class="st st-${answer.status}">${STATUS_LABEL[answer.status]}</span>`
        : '<span class="st st-empty"></span>';
      const note = answer?.note ? escapeHtml(answer.note) : '';
      return `<tr><td class="n">${number}</td><td class="t">${escapeHtml(item.text)}</td><td class="s">${status}</td><td class="nt">${note}</td></tr>`;
    }).join('');
    return `<tr class="grp"><td colspan="4">${escapeHtml(group.title)}</td></tr>${rows}`;
  }).join('');

  const listed = formItems(form)
    .filter((item) => answers[item.id]?.status === 'not_ok')
    .map((item) => `<li><b>${escapeHtml(item.text)}:</b> ${escapeHtml(answers[item.id]?.note ?? '')}</li>`);
  const free = extraDefects.map((line) => `<li>${escapeHtml(line)}</li>`);
  const defects = listed.length + free.length
    ? `<div class="defects"><div class="defects-h">ליקויים שנמצאו (${listed.length + free.length})</div><ol>${[...listed, ...free].join('')}</ol></div>`
    : '<div class="defects none">לא נמצאו ליקויים.</div>';

  const driverSide = closedNote
    ? `<div class="sig">
    <div class="sig-l">${DRIVER_FIELD}</div>
    <div class="sig-box closed">הנהג לא חתם על הבדיקה.<br>${escapeHtml(closedNote.text)}</div>
    <div class="sig-n">${escapeHtml(facts.driverName)}</div>
    <div class="sig-d">נסגר ב־${escapeHtml(closedNote.on)} על ידי ${escapeHtml(closedNote.by)}</div>
  </div>`
    : `<div class="sig">
    <div class="sig-l">${DRIVER_FIELD}</div>
    <div class="sig-box"><signature-field name="${DRIVER_FIELD}" title="${DRIVER_FIELD}" role="${DRIVER_ROLE}" required="true" style="width: 240px; height: 68px; display: inline-block;"></signature-field></div>
    <div class="sig-n">${escapeHtml(facts.driverName)}</div>
    <div class="sig-d">בחתימתי אני מאשר/ת שקראתי את תוצאות הבדיקה</div>
  </div>`;

  return `<!doctype html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap">
<style>
  @page { size: A4; margin: 36px 0; }
  html, body { margin: 0; padding: 0; }
  .page { position: relative; box-sizing: border-box; width: 794px; padding: 20px 56px 0; font-family: 'Heebo', 'Arial Hebrew', 'DejaVu Sans', Arial, sans-serif; color: #111; direction: rtl; text-align: right; }
  .lh { position: relative; height: 72px; margin-bottom: 22px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding-bottom: 16px; border-bottom: 1px solid #E1E6EA; }
  .lh::after { content: ''; position: absolute; right: 0; bottom: -2px; width: 56px; height: 3px; border-radius: 2px; background: #0088CC; }
  .lh-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .lh-logo { flex: none; width: 52px; height: 52px; border-radius: 13px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #F4F6F8; }
  .lh-logo img { width: 100%; height: 100%; object-fit: contain; }
  .lh-mono { background: linear-gradient(160deg, #35B8F0, #0088CC); color: #fff; font-weight: 700; font-size: 24px; }
  .lh-name { font-size: 22px; line-height: 1.2; font-weight: 700; color: #16222E; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lh-date { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .lh-label { font-size: 12px; line-height: 1.2; color: #8B98A4; }
  .lh-value { font-size: 16px; line-height: 1.3; font-weight: 600; color: #16222E; direction: ltr; }
  h1 { font-size: 25px; line-height: 1.3; margin: 0 0 14px; font-weight: 700; }
  .facts { display: grid; grid-template-columns: repeat(4, 1fr); margin: 0 0 18px; border: 1px solid #E1E6EA; border-radius: 10px; overflow: hidden; }
  .fact { padding: 8px 12px; border-left: 1px solid #E1E6EA; border-bottom: 1px solid #E1E6EA; }
  .fact:nth-child(4n) { border-left: none; }
  .fact:nth-child(n+5) { border-bottom: none; }
  .fact-l { display: block; font-size: 11px; color: #6B7885; margin-bottom: 1px; }
  .fact-v { display: block; font-size: 14.5px; font-weight: 600; color: #16222E; min-height: 20px; }
  .fact.warn .fact-v { color: #C21F37; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; line-height: 1.45; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  th { background: #F1F4F7; color: #3C4A57; font-weight: 600; font-size: 12px; text-align: right; padding: 7px 10px; border: 1px solid #DDE3E8; }
  td { padding: 7px 10px; border: 1px solid #E3E8EC; vertical-align: top; }
  tr.grp td { background: #F7F9FB; font-weight: 700; font-size: 13.5px; color: #16222E; padding: 8px 10px; }
  td.n { width: 26px; text-align: center; color: #6B7885; font-weight: 600; }
  td.s { width: 86px; }
  td.nt { width: 200px; color: #2B3A4F; font-size: 12.5px; }
  .st { display: inline-block; padding: 2px 10px; border-radius: 999px; font-weight: 600; font-size: 12px; white-space: nowrap; }
  .st-ok { background: #E4F7EF; color: #0B7D57; }
  .st-not_ok { background: #FFE8EB; color: #C21F37; }
  .st-na { background: #EEF1F6; color: #56657A; }
  .st-empty { width: 60px; height: 16px; border: 1px dashed #C9D1D8; }
  .defects { margin-top: 16px; padding: 12px 16px; border-radius: 10px; background: #FFF4F5; border: 1px solid #F7CCD3; page-break-inside: avoid; break-inside: avoid; }
  .defects.none { background: #F2FAF6; border-color: #CDEBDD; color: #0B7D57; font-weight: 600; font-size: 13.5px; }
  .defects-h { font-weight: 700; font-size: 14px; color: #C21F37; margin-bottom: 4px; }
  .defects ol { margin: 0; padding-right: 20px; font-size: 13px; line-height: 1.6; }
  .notice { margin-top: 14px; padding: 10px 14px; border-radius: 10px; background: #F4F6F8; font-size: 12.5px; line-height: 1.6; color: #2B3A4F; page-break-inside: avoid; break-inside: avoid; }
  .sigs { display: flex; gap: 32px; margin-top: 22px; page-break-inside: avoid; break-inside: avoid; }
  .sig { flex: 1; }
  .sig-l { font-size: 13px; font-weight: 600; color: #3C4A57; margin-bottom: 6px; }
  .sig-box { height: 72px; border-bottom: 1.5px solid #3C4A57; }
  .sig-box.closed { height: auto; min-height: 72px; box-sizing: border-box; padding: 8px 0; font-size: 13px; line-height: 1.5; color: #9A5300; }
  .sig-n { font-size: 14px; font-weight: 600; margin-top: 6px; min-height: 20px; }
  .sig-d { font-size: 12px; color: #6B7885; }
</style>
</head>
<body><div class="page">
<div class="lh">
  <div class="lh-brand">${logo}<span class="lh-name">${escapeHtml(letterhead.name)}</span></div>
  <div class="lh-date"><span class="lh-label">תאריך הבדיקה</span><span class="lh-value">${date}</span></div>
</div>
<h1>${INSPECTION_TITLE}</h1>
<div class="facts">${facts8}</div>
<table>
  <thead><tr><th>#</th><th>סעיף</th><th>מצב</th><th>מה נמצא</th></tr></thead>
  <tbody>${groups}</tbody>
</table>
${defects}
<div class="notice"><b>לתשומת לב:</b> ${DISCLAIMER}</div>
<div class="sigs">
  <div class="sig">
    <div class="sig-l">${OFFICER_FIELD}</div>
    <div class="sig-box"><signature-field name="${OFFICER_FIELD}" title="${OFFICER_FIELD}" role="${OFFICER_ROLE}" required="true" style="width: 240px; height: 68px; display: inline-block;"></signature-field></div>
    <div class="sig-n">${escapeHtml(officerName)}</div>
    <div class="sig-d">נחתם ב־${date}</div>
  </div>
  ${driverSide}
</div>
</div></body>
</html>`;
}
