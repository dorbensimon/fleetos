/**
 * "רשימת סעיפים" forms (lib/checklistForms.ts on the app side): the form
 * model's server-side checks and the HTML DocuSeal turns into the PDF.
 *
 * A meeting's document has two signers. The company's side (the safety
 * officer) signs first, by hand on the manager's device; the app sends that
 * drawing and it is stamped into the officer's field through the API. The
 * driver signs second, on the same device or later in their own app.
 */

export const OFFICER_ROLE = 'החברה';
export const DRIVER_ROLE = 'נהג';
export const OFFICER_FIELD = 'חתימת החברה';
export const DRIVER_FIELD = 'חתימת הנהג';

export const LIMITS = { items: 60, itemText: 400, intro: 1000, note: 500, label: 60, officerName: 80 } as const;
const DEFAULT_LABELS = { officer: 'חתימת קצין הבטיחות', driver: 'חתימת הנהג' };

export type Status = 'done' | 'not_done' | 'na';
export type Form = {
  version: 1;
  intro: string;
  items: Array<{ id: string; text: string }>;
  allowNa: boolean;
  labels: { officer: string; driver: string };
  /** How often each driver needs this meeting, in months; 0 is a one-time form. */
  repeatMonths: number;
};
export type Answers = Record<string, { status: Status | null; note: string }>;

const STATUS_LABEL: Record<Status, string> = { done: 'בוצע', not_done: 'לא בוצע', na: 'לא רלוונטי' };
const ITEM_ID = /^[A-Za-z0-9_-]{1,40}$/;

function oneLine(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** The form as the admin saved it, or null if anything is off. */
export function parseForm(raw: unknown): Form | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.items) || value.items.length === 0 || value.items.length > LIMITS.items) return null;
  const ids = new Set<string>();
  const items: Form['items'] = [];
  for (const item of value.items) {
    if (!item || typeof item !== 'object') return null;
    const { id, text } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !ITEM_ID.test(id) || ids.has(id)) return null;
    if (typeof text !== 'string' || text.trim().length === 0 || text.length > LIMITS.itemText * 2) return null;
    ids.add(id);
    items.push({ id, text: oneLine(text, LIMITS.itemText) });
  }
  if (value.intro != null && typeof value.intro !== 'string') return null;
  const labels = (value.labels ?? {}) as Record<string, unknown>;
  return {
    version: 1,
    intro: typeof value.intro === 'string' ? value.intro.trim().slice(0, LIMITS.intro) : '',
    items,
    allowNa: value.allowNa === true,
    labels: {
      officer: oneLine(labels.officer, LIMITS.label) || DEFAULT_LABELS.officer,
      driver: oneLine(labels.driver, LIMITS.label) || DEFAULT_LABELS.driver,
    },
    repeatMonths: repeatMonthsOf(value.repeatMonths),
  };
}

export const MAX_REPEAT_MONTHS = 24;

/** 0 (one time) or a whole number of months up to two years. */
export function repeatMonthsOf(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_REPEAT_MONTHS ? value : 0;
}

/** YYYY-MM-DD plus whole months; the 31st lands on the month's last day. */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** Answers for the form's own items only; an unknown status or item is dropped. */
export function parseAnswers(raw: unknown, form: Form): Answers {
  const answers: Answers = {};
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  for (const item of form.items) {
    const entry = source[item.id];
    if (!entry || typeof entry !== 'object') continue;
    const { status, note } = entry as Record<string, unknown>;
    const allowed: Status[] = form.allowNa ? ['done', 'not_done', 'na'] : ['done', 'not_done'];
    const parsedStatus = typeof status === 'string' && (allowed as string[]).includes(status) ? status as Status : null;
    const parsedNote = typeof note === 'string' ? note.trim().slice(0, LIMITS.note) : '';
    if (parsedStatus || parsedNote) answers[item.id] = { status: parsedStatus, note: parsedNote };
  }
  return answers;
}

export function everyItemAnswered(form: Form, answers: Answers): boolean {
  return form.items.every((item) => !!answers[item.id]?.status);
}

export function isIsoDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function day(value: string): string {
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export type Letterhead = { name: string; logoUrl: string | null };
export type DriverFacts = { name: string; nationalId?: string | null; licenseNumber?: string | null; licenseClasses?: string | null };

type RenderInput = {
  title: string;
  form: Form;
  letterhead: Letterhead;
  /** Null renders the blank form: empty answer boxes, placeholder driver details (the template's preview). */
  meeting: null | {
    answers: Answers;
    driver: DriverFacts;
    meetingDate: string;
    officerName: string;
  };
};

/**
 * The page matches the documents written in the in-app editor (A4 at 96dpi,
 * the same letterhead), so every company document looks like one family.
 */
export function renderChecklistHtml({ title, form, letterhead, meeting }: RenderInput): string {
  const logo = letterhead.logoUrl
    ? `<span class="lh-logo"><img src="${escapeHtml(letterhead.logoUrl)}" alt=""></span>`
    : `<span class="lh-logo lh-mono">${escapeHtml(letterhead.name.charAt(0))}</span>`;
  const dateText = meeting ? day(meeting.meetingDate) : '__/__/____';

  const fact = (label: string, value: string | null | undefined) =>
    `<div class="fact"><span class="fact-l">${label}</span><span class="fact-v">${value ? escapeHtml(value) : meeting ? '—' : '<i class="blank"></i>'}</span></div>`;
  const facts = [
    fact('שם הנהג', meeting?.driver.name),
    fact('תעודת זהות', meeting?.driver.nationalId),
    fact('מספר רישיון', meeting?.driver.licenseNumber),
    fact('סוג רישיון', meeting?.driver.licenseClasses),
  ].join('');

  const rows = form.items.map((item, index) => {
    const answer = meeting?.answers[item.id];
    const status = answer?.status
      ? `<span class="st st-${answer.status}">${STATUS_LABEL[answer.status]}</span>`
      : '<span class="st st-empty"></span>';
    const note = answer?.note ? escapeHtml(answer.note).replace(/\n/g, '<br>') : '';
    return `<tr><td class="n">${index + 1}</td><td class="t">${escapeHtml(item.text)}</td><td class="s">${status}</td><td class="nt">${note}</td></tr>`;
  }).join('');

  const legend = form.allowNa ? 'בוצע / לא בוצע / לא רלוונטי' : 'בוצע / לא בוצע';
  const intro = form.intro ? `<p class="intro">${escapeHtml(form.intro).replace(/\n/g, '<br>')}</p>` : '';

  const officerName = meeting ? escapeHtml(meeting.officerName) : '';
  const driverName = meeting ? escapeHtml(meeting.driver.name) : '';

  return `<!doctype html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap">
<style>
  /* The page margin (not the sheet's padding) keeps every page's top and bottom
     clear, so the signatures only move to a new page when they truly do not fit. */
  @page { size: A4; margin: 36px 0; }
  html, body { margin: 0; padding: 0; }
  .page { position: relative; box-sizing: border-box; width: 794px; padding: 20px 64px 0; font-family: 'Heebo', 'Arial Hebrew', 'DejaVu Sans', Arial, sans-serif; color: #111; direction: rtl; text-align: right; }
  .lh { position: relative; height: 72px; margin-bottom: 26px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding-bottom: 16px; border-bottom: 1px solid #E1E6EA; }
  .lh::after { content: ''; position: absolute; right: 0; bottom: -2px; width: 56px; height: 3px; border-radius: 2px; background: #0088CC; }
  .lh-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .lh-logo { flex: none; width: 52px; height: 52px; border-radius: 13px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #F4F6F8; }
  .lh-logo img { width: 100%; height: 100%; object-fit: contain; }
  .lh-mono { background: linear-gradient(160deg, #35B8F0, #0088CC); color: #fff; font-weight: 700; font-size: 24px; }
  .lh-name { font-size: 22px; line-height: 1.2; font-weight: 700; color: #16222E; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lh-date { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .lh-label { font-size: 12px; line-height: 1.2; color: #8B98A4; }
  .lh-value { font-size: 16px; line-height: 1.3; font-weight: 600; color: #16222E; direction: ltr; }
  h1 { font-size: 26px; line-height: 1.3; margin: 0 0 14px; font-weight: 700; }
  .intro { font-size: 15px; line-height: 1.7; margin: 0 0 16px; color: #2B3A4F; }
  .facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin: 0 0 22px; border: 1px solid #E1E6EA; border-radius: 10px; overflow: hidden; }
  .fact { padding: 10px 14px; border-left: 1px solid #E1E6EA; }
  .fact:last-child { border-left: none; }
  .fact-l { display: block; font-size: 11.5px; color: #6B7885; margin-bottom: 2px; }
  .fact-v { display: block; font-size: 15px; font-weight: 600; color: #16222E; min-height: 20px; }
  .blank { display: inline-block; width: 90%; height: 1px; background: #C9D1D8; vertical-align: middle; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.5; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  th { background: #F1F4F7; color: #3C4A57; font-weight: 600; font-size: 12.5px; text-align: right; padding: 8px 10px; border: 1px solid #DDE3E8; }
  td { padding: 9px 10px; border: 1px solid #E3E8EC; vertical-align: top; }
  td.n { width: 28px; text-align: center; color: #6B7885; font-weight: 600; }
  td.s { width: 92px; }
  td.nt { width: 190px; color: #2B3A4F; font-size: 13px; }
  .st { display: inline-block; padding: 2px 10px; border-radius: 999px; font-weight: 600; font-size: 12.5px; white-space: nowrap; }
  .st-done { background: #E4F7EF; color: #0B7D57; }
  .st-not_done { background: #FFE8EB; color: #C21F37; }
  .st-na { background: #EEF1F6; color: #56657A; }
  .st-empty { width: 66px; height: 18px; border: 1px dashed #C9D1D8; }
  .legend { font-size: 12px; color: #6B7885; margin: 8px 0 0; }
  .sigs { display: flex; gap: 32px; margin-top: 24px; page-break-inside: avoid; break-inside: avoid; }
  .sig { flex: 1; }
  .sig-l { font-size: 13px; font-weight: 600; color: #3C4A57; margin-bottom: 6px; }
  .sig-box { height: 72px; border-bottom: 1.5px solid #3C4A57; }
  .sig-n { font-size: 14px; font-weight: 600; margin-top: 6px; min-height: 20px; }
  .sig-d { font-size: 12px; color: #6B7885; }
</style>
</head>
<body><div class="page">
<div class="lh">
  <div class="lh-brand">${logo}<span class="lh-name">${escapeHtml(letterhead.name)}</span></div>
  <div class="lh-date"><span class="lh-label">תאריך המפגש</span><span class="lh-value">${dateText}</span></div>
</div>
<h1>${escapeHtml(title)}</h1>
${intro}
<div class="facts">${facts}</div>
<table>
  <thead><tr><th>#</th><th>סעיף</th><th>סטטוס</th><th>הערה</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="legend">בכל סעיף מסומן אחד מאלה: ${legend}</p>
<div class="sigs">
  <div class="sig">
    <div class="sig-l">${escapeHtml(form.labels.officer)}</div>
    <div class="sig-box"><signature-field name="${OFFICER_FIELD}" title="${escapeHtml(form.labels.officer)}" role="${OFFICER_ROLE}" required="true" style="width: 240px; height: 68px; display: inline-block;"></signature-field></div>
    <div class="sig-n">${officerName}</div>
    <div class="sig-d">${meeting ? `נחתם ב־${dateText}` : 'שם ותאריך'}</div>
  </div>
  <div class="sig">
    <div class="sig-l">${escapeHtml(form.labels.driver)}</div>
    <div class="sig-box"><signature-field name="${DRIVER_FIELD}" title="${escapeHtml(form.labels.driver)}" role="${DRIVER_ROLE}" required="true" style="width: 240px; height: 68px; display: inline-block;"></signature-field></div>
    <div class="sig-n">${driverName}</div>
    <div class="sig-d">${meeting ? 'בחתימה זו מאושר שהמפגש התקיים כמפורט' : 'שם ותאריך'}</div>
  </div>
</div>
</div></body>
</html>`;
}

/** A PNG the app drew, as a data URL DocuSeal takes for a signature value. Null when it is not a sane PNG. */
export function signaturePng(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;
  const base64 = match[1];
  // A hand signature at phone resolution is a few KB to ~200 KB.
  if (base64.length < 200 || base64.length > 1_500_000) return null;
  try {
    const head = atob(base64.slice(0, 12));
    if (head.charCodeAt(0) !== 0x89 || head.slice(1, 4) !== 'PNG') return null;
  } catch {
    return null;
  }
  return `data:image/png;base64,${base64}`;
}
