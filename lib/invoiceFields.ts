// קריאת הפרטים של חשבונית מהטקסט שנסרק: מספר, ספק, תאריך וסכום לפני מע"מ
import { pickDocumentDates } from './documentDates';

export type InvoiceFields = {
  invoiceNumber: string | null;
  supplier: string | null;
  date: string | null;
  amountBeforeVat: number | null;
};

/** Israeli VAT, used only when an invoice shows its total with VAT and not the amount before it. */
export const VAT_RATE = 0.18;
// How far from its words an amount may sit (either side: PDFs of right-to-left text often swap the order).
const NEAR = 32;

const BEFORE_VAT = /(לפני\s*מע"?מ|ללא\s*מע"?מ|סכום\s*ביניים|חייב\s*במע"?מ|subtotal|sub\s*total|before\s*vat|net\s*amount)/i;
const WITH_VAT = /(סה"?כ\s*(?:כולל\s*מע"?מ|לתשלום)|כולל\s*מע"?מ|לתשלום|total\s*(?:due|amount)?|grand\s*total)/i;
const INVOICE_NO = /(?:חשבונית(?:\s*מס)?(?:\s*[/\\-]?\s*קבלה)?|קבלה|invoice|inv\.?)\s*(?:מס(?:פר|')?\.?|no\.?|number|#)?\s*[:#.\-]?\s*(\d[\d\-/]{2,19})/i;
const SUPPLIER_MARK = /(ע\.?\s*מ\.?|עוסק\s*מורשה|ח\.?\s*פ\.?|בע"?מ|ltd|inc)/i;

// מאחד גרשיים ורווחים שהסריקה מבלבלת
function normalize(text: string): string {
  return text.replace(/[‎‏‪-‮]/g, '').replace(/[״“”″]/g, '"').replace(/[׳’`]/g, "'").replace(/[ \t]+/g, ' ');
}

// סכום ליד מילים
const amounts = (s: string) =>
  [...s.matchAll(/(?<![\d/.\-])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?![\d/%]|\.\d)/g)]
    .map((m) => Number(m[1].replace(/,/g, '')) + (m[2] ? Number(`0.${m[2]}`) : 0))
    .filter((n) => n > 0 && n < 10_000_000);

/**
 * The amount on the words' own line (after them, else before: right-to-left
 * PDFs swap the order), else the nearest one across line breaks; never a
 * percentage, a date or a phone.
 */
function amountNear(text: string, words: RegExp): number | null {
  const line = text.split('\n').find((l) => words.test(l));
  const onLine = line && words.exec(line);
  if (line && onLine) {
    const found = amounts(line.slice(onLine.index + onLine[0].length))[0] ?? amounts(line.slice(0, onLine.index)).pop();
    if (found != null) return found;
  }
  const flat = text.replace(/\s+/g, ' ');
  const hit = words.exec(flat);
  if (!hit) return null;
  const after = flat.slice(hit.index + hit[0].length, hit.index + hit[0].length + NEAR);
  const before = flat.slice(Math.max(0, hit.index - NEAR), hit.index);
  return amounts(after)[0] ?? amounts(before).pop() ?? null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// שם הספק
/** The line with the dealer/company mark (ע.מ., ח.פ., בע"מ) without its number; else the first line of words. */
function supplierOf(lines: string[]): string | null {
  const clean = (line: string) =>
    line.replace(SUPPLIER_MARK, ' ').replace(/[\d:.\-/#]+/g, ' ').replace(/\s+/g, ' ').trim();
  const words = (line: string) => (line.match(/[֐-׿A-Za-z]/g) ?? []).length >= 2;
  const marked = lines.find((l) => SUPPLIER_MARK.test(l) && words(clean(l)));
  const first = lines.find((l) => words(l) && !/חשבונית|קבלה|invoice|מקור|העתק|copy|original/i.test(l));
  const name = clean(marked ?? first ?? '');
  return name && name.length <= 60 ? name : null;
}

// כל הפרטים של החשבונית
export function pickInvoiceFields(raw: string): InvoiceFields {
  const text = normalize(raw);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const beforeVat = amountNear(text, BEFORE_VAT);
  const withVat = beforeVat == null ? amountNear(text, WITH_VAT) : null;
  return {
    invoiceNumber: INVOICE_NO.exec(text.replace(/\s+/g, ' '))?.[1]?.replace(/[-/]+$/, '') ?? null,
    supplier: supplierOf(lines),
    date: pickDocumentDates(text).issued,
    amountBeforeVat: beforeVat ?? (withVat != null ? round2(withVat / (1 + VAT_RATE)) : null),
  };
}
