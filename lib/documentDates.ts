// מציאת התאריכים בטקסט של מסמך: תוקף, תאריך בדיקה ותאריך המסמך
import { addMonthsIso } from './tachograph';

export type DocumentDates = {
  /** The date the document is valid until. */
  expiry: string | null;
  /** The date an inspection was done (newest date not in the future). */
  inspected: string | null;
  /** The document's own date (issue / signing date). */
  issued: string | null;
};

const EXPIRY_WORDS = /(תוקף|בתוקף|תפוגה|פקיעה|סיום|תום|עד\s*(?:ל?תאריך|ליום)?|valid|expir|until|due)/i;
const INSPECTION_WORDS = /(בדיקה|נבדק|ביקורת|כיול|inspect|tested|calibrat)/i;
const ISSUE_WORDS = /(תאריך|הופק|הונפק|הנפקה|נחתם|date|issued)/i;
// How far before a date its keyword may sit (OCR breaks lines).
const NEAR = 40;

type Found = { iso: string; at: number; before: string };

// כל התאריכים בטקסט
/** Every real date in the text: 31/12/2026, 31.12.26, 31-12-2026 or 2026-12-31. */
export function findDates(text: string): Found[] {
  const clean = text.replace(/[‎‏‪-‮]/g, '').replace(/\s+/g, ' ');
  const out: (Found & { end: number })[] = [];
  const push = (y: number, m: number, d: number, at: number, end: number) => {
    const date = new Date(Date.UTC(y, m - 1, d));
    if (y < 2000 || y > 2100 || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return;
    out.push({ iso: date.toISOString().slice(0, 10), at, end, before: '' });
  };
  for (const m of clean.matchAll(/(?<!\d)(\d{1,2})\s*[./\\-]\s*(\d{1,2})\s*[./\\-]\s*(\d{4}|\d{2})(?!\d)/g)) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    push(year, Number(m[2]), Number(m[1]), m.index ?? 0, (m.index ?? 0) + m[0].length);
  }
  for (const m of clean.matchAll(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g)) push(Number(m[1]), Number(m[2]), Number(m[3]), m.index ?? 0, (m.index ?? 0) + m[0].length);
  out.sort((a, b) => a.at - b.at);
  // A date's keyword is the text just before it, and never past the previous date.
  return out.map(({ end: _end, ...d }, i) => ({ ...d, before: clean.slice(Math.max(i ? out[i - 1].end : 0, d.at - NEAR), d.at) }));
}

const latest = (dates: Found[]) => dates.reduce<string | null>((best, d) => (!best || d.iso > best ? d.iso : best), null);
const earliest = (dates: Found[]) => dates.reduce<string | null>((best, d) => (!best || d.iso < best ? d.iso : best), null);

// התאריכים החשובים במסמך
/**
 * Expiry: the latest date with a validity word just before it ("בתוקף עד",
 * "valid until"), else the latest future date, since a policy's or licence's
 * end date is its last one. Inspection: the latest date up to today. Issued:
 * the earliest date with a "תאריך" word before it, else the earliest date.
 */
export function pickDocumentDates(text: string, today = new Date().toISOString().slice(0, 10)): DocumentDates {
  const dates = findDates(text);
  if (!dates.length) return { expiry: null, inspected: null, issued: null };
  const near = (words: RegExp) => dates.filter((d) => words.test(d.before));
  const past = dates.filter((d) => d.iso <= today);
  return {
    // A guessed expiry is only a future date; a past one is the issue or print date.
    expiry: latest(near(EXPIRY_WORDS)) ?? latest(dates.filter((d) => d.iso > today)),
    inspected: latest(near(INSPECTION_WORDS).filter((d) => d.iso <= today)) ?? latest(past),
    issued: earliest(near(ISSUE_WORDS)) ?? earliest(dates),
  };
}

// התאריך שיוצע בשדה התוקף
/** Folders whose expiry follows an inspection (winter check, brakes…): the inspection date plus their months. Others: the expiry read. */
export function suggestedDates(dates: DocumentDates | null, inspectionMonths?: number | null): { inspected: string | null; expiry: string | null } {
  const inspected = inspectionMonths ? dates?.inspected ?? null : null;
  return { inspected, expiry: inspected && inspectionMonths ? addMonthsIso(inspected, inspectionMonths) : dates?.expiry ?? null };
}
