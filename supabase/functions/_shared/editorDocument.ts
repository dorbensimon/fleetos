/**
 * A document written in the in-app editor (components/desktop/signing/DocumentEditor.web.tsx),
 * as the browser sends it: a small block model plus pixel field positions,
 * never raw HTML, so nothing the browser sends is rendered verbatim.
 *
 * Used by company-signing-template (a company's form) and form-templates
 * (the platform owner's templates), so both check a document the same way.
 */

export const SIGNER_ROLE = 'נהג';
export const MAX_FIELDS = 120;
export const MAX_BLOCKS = 400;
export const MAX_TEXT = 60_000;

export type FieldKind =
  | 'signature' | 'date' | 'checkbox' | 'text'
  | 'driver_full_name' | 'driver_national_id' | 'driver_phone' | 'driver_license_number' | 'company_name';

export const PREFILL_KINDS: Record<string, string> = {
  driver_full_name: 'שם הנהג',
  driver_national_id: 'תעודת זהות',
  driver_phone: 'טלפון הנהג',
  driver_license_number: 'מספר רישיון',
  company_name: 'שם החברה',
};
export const FIELD_KINDS = new Set<string>(['signature', 'date', 'checkbox', 'text', ...Object.keys(PREFILL_KINDS)]);

export type Inline = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; size?: number; color?: string; highlight?: boolean };
/** A field set into a line of text: the `slot` of an EditorField. */
export type SlotRun = { slot: string };
/** The editor's text sizes, colours and marker (lib/companySigningTemplates.ts); anything else is ignored. */
const TEXT_SIZES = new Set([13, 20, 24]);
const TEXT_COLORS = new Set(['#5C6773', '#0088CC', '#D92D20', '#12805C']);
const HIGHLIGHT = '#FFF1A8';
const SLOT_ID = /^[a-z0-9]{1,40}$/i;
/** `slot`: the field sits inside a line of text, where an inline `{ slot }` run names it. */
export type EditorField = { kind: FieldKind; label?: string; x: number; y: number; w: number; h: number; slot?: string };
export type Block = { type: 'h1' | 'h2' | 'p' | 'ul' | 'ol' | 'hr'; align?: 'right' | 'center' | 'left' | 'justify'; content: Array<Array<Inline | SlotRun>> };

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function cleanLabel(label: unknown, fallback: string): string {
  const text = typeof label === 'string' ? label.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return text || fallback;
}

/**
 * DocuSeal field names: a signature or date shared across the document is one
 * value the driver fills once; every checkbox and free-text field is its own.
 */
export function fieldIdentity(kind: FieldKind, label: unknown, counters: Record<string, number>, used: Set<string>) {
  if (kind === 'signature') return { name: 'חתימה', type: 'signature', title: 'חתימה' };
  if (kind === 'date') return { name: 'תאריך', type: 'date', title: 'תאריך' };
  if (kind in PREFILL_KINDS) return { name: kind, type: 'text', title: PREFILL_KINDS[kind] };
  counters[kind] = (counters[kind] ?? 0) + 1;
  const base = cleanLabel(label, kind === 'checkbox' ? `אישור ${counters[kind]}` : `שדה ${counters[kind]}`);
  let name = base;
  for (let n = 2; used.has(name); n += 1) name = `${base} (${n})`;
  used.add(name);
  return { name, type: kind === 'checkbox' ? 'checkbox' : 'text', title: base };
}

/**
 * How DocuSeal writes a filled value: the size of the document's own text,
 * right-aligned for Hebrew, and dates as 27/09/2026 (not DocuSeal's US
 * default). Without these, values came out in another size and dates as
 * 09/27/2026.
 */
export const TEXT_LOOK = { font_size: 16, align: 'right', valign: 'center' } as const;
export const DATE_FORMAT = 'DD/MM/YYYY';

function fieldLook(type: string): string {
  if (type === 'text') return ` font-size="${TEXT_LOOK.font_size}" align="${TEXT_LOOK.align}" valign="${TEXT_LOOK.valign}"`;
  if (type === 'date') return ` font-size="${TEXT_LOOK.font_size}" align="${TEXT_LOOK.align}" valign="${TEXT_LOOK.valign}" format="${DATE_FORMAT}"`;
  return '';
}

/**
 * The editor's page geometry and type sizes (lib/companySigningTemplates.ts
 * EDITOR_PAGE and the `.sd-paper-page` / `.sd-doc` styles). Fields arrive as
 * pixels on that page and are drawn at the same spot here.
 */
export const PAGE = { width: 794, height: 1123, padX: 72, padY: 64, headerH: 72, headerGap: 32 };

/** The date on the letterhead: read-only for the driver; DocuSeal stamps it with the day the document is signed. */
const LETTERHEAD_DATE_FIELD = 'תאריך המסמך';

export type Letterhead = { name: string; logoUrl: string | null };

/** The company's letterhead, drawn exactly like the editor's `.sd-lh` (same box sizes, so the text below starts at the same spot). */
function renderLetterhead({ name, logoUrl }: Letterhead): string {
  const logo = logoUrl
    ? `<span class="lh-logo"><img src="${escapeHtml(logoUrl)}" alt=""></span>`
    : `<span class="lh-logo lh-mono">${escapeHtml(name.charAt(0))}</span>`;
  return `<div class="lh">
  <div class="lh-brand">${logo}<span class="lh-name">${escapeHtml(name)}</span></div>
  <div class="lh-date"><span class="lh-label">תאריך</span><date-field name="${LETTERHEAD_DATE_FIELD}" title="${LETTERHEAD_DATE_FIELD}" role="${SIGNER_ROLE}" readonly="true" required="false" default="{{date}}" format="DD/MM/YYYY" font-size="16" align="left" style="width: 110px; height: 22px; display: block;"></date-field></div>
</div>`;
}

export function parseEditorFields(raw: unknown): EditorField[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_FIELDS) return null;
  const fields: EditorField[] = [];
  for (const f of raw) {
    if (!f || typeof f !== 'object') return null;
    const { kind, label, x, y, w, h, slot } = f as Record<string, unknown>;
    if (typeof kind !== 'string' || !FIELD_KINDS.has(kind)) return null;
    if (![x, y, w, h].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)) return null;
    if (slot !== undefined && (typeof slot !== 'string' || !SLOT_ID.test(slot))) return null;
    const box = { x: x as number, y: y as number, w: w as number, h: h as number };
    if (box.w < 4 || box.h < 4 || box.x + box.w > PAGE.width + 1 || box.y > PAGE.height * 200) return null;
    const cleanText = typeof label === 'string' ? label.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    fields.push({ kind: kind as FieldKind, ...(cleanText ? { label: cleanText } : {}), ...box, ...(slot ? { slot: slot as string } : {}) });
  }
  return fields;
}

/**
 * The block model rebuilt from only what the editor can make: the stored copy
 * (a template, or a form's current text) never carries anything else.
 */
export function cleanEditorBlocks(raw: unknown): Block[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BLOCKS) return null;
  let textLength = 0;
  const run = (item: unknown): Inline | SlotRun | null => {
    if (!item || typeof item !== 'object') return null;
    const node = item as Record<string, unknown>;
    if (typeof node.slot === 'string') return SLOT_ID.test(node.slot) ? { slot: node.slot } : null;
    if (typeof node.text !== 'string') return null;
    textLength += node.text.length;
    const out: Inline = { text: node.text };
    if (node.bold === true) out.bold = true;
    if (node.italic === true) out.italic = true;
    if (node.underline === true) out.underline = true;
    if (typeof node.size === 'number' && TEXT_SIZES.has(node.size)) out.size = node.size;
    if (typeof node.color === 'string' && TEXT_COLORS.has(node.color)) out.color = node.color;
    if (node.highlight === true) out.highlight = true;
    return out;
  };
  const blocks: Block[] = [];
  for (const block of raw) {
    if (!block || typeof block !== 'object') return null;
    const { type, align, content } = block as Record<string, unknown>;
    if (type === 'hr') {
      blocks.push({ type: 'hr', content: [] });
      continue;
    }
    if (type !== 'h1' && type !== 'h2' && type !== 'p' && type !== 'ul' && type !== 'ol') return null;
    if (!Array.isArray(content) || content.length === 0 || content.length > MAX_BLOCKS) return null;
    const lines: Array<Array<Inline | SlotRun>> = [];
    for (const line of content) {
      if (!Array.isArray(line)) return null;
      const runs = line.map(run);
      if (runs.some((r) => r === null)) return null;
      lines.push(runs as Array<Inline | SlotRun>);
    }
    blocks.push({ type, align: align === 'center' || align === 'left' || align === 'justify' ? align : 'right', content: lines });
  }
  return textLength > MAX_TEXT ? null : blocks;
}

export function renderEditorDocument(raw: unknown, fields: EditorField[], letterhead: Letterhead): string | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BLOCKS) return null;
  const counters: Record<string, number> = {};
  const used = new Set<string>();
  let textLength = 0;

  // A field set into the text is drawn right there, in the line, the size it
  // had in the editor; the others float at their spot (see `tags` below).
  const inlined = new Set<EditorField>();
  const fieldTag = (f: EditorField, style: string) => {
    const id = fieldIdentity(f.kind, f.label, counters, used);
    const tag = `${id.type}-field`;
    return `<${tag} name="${escapeHtml(id.name)}" title="${escapeHtml(id.title)}" role="${SIGNER_ROLE}" required="${f.kind === 'checkbox' ? 'false' : 'true'}"${fieldLook(id.type)} style="${style}"></${tag}>`;
  };

  const inline = (item: unknown): string | null => {
    if (!item || typeof item !== 'object') return null;
    const node = item as Record<string, unknown>;
    if (typeof node.slot === 'string') {
      const f = fields.find((field) => field.slot === node.slot && !inlined.has(field));
      if (!f) return '';
      inlined.add(f);
      const w = Math.min(f.w, PAGE.width - PAGE.padX * 2);
      return fieldTag(f, `display: inline-block; vertical-align: middle; width: ${w.toFixed(1)}px; height: ${f.h.toFixed(1)}px; margin: 0 4px;`);
    }
    if (typeof node.text !== 'string') return null;
    textLength += node.text.length;
    let html = escapeHtml(node.text.replace(/​/g, '')).replace(/\n/g, '<br>');
    if (node.bold) html = `<strong>${html}</strong>`;
    if (node.italic) html = `<em>${html}</em>`;
    if (node.underline) html = `<u>${html}</u>`;
    const style: string[] = [];
    if (typeof node.size === 'number' && TEXT_SIZES.has(node.size)) style.push(`font-size: ${node.size}px`);
    if (typeof node.color === 'string' && TEXT_COLORS.has(node.color)) style.push(`color: ${node.color}`);
    if (node.highlight === true) style.push(`background-color: ${HIGHLIGHT}`);
    if (style.length) html = `<span style="${style.join('; ')}">${html}</span>`;
    return html;
  };

  const line = (items: unknown): string | null => {
    if (!Array.isArray(items)) return null;
    const parts = items.map(inline);
    return parts.some((p) => p === null) ? null : (parts.join('') || '<br>');
  };

  const out: string[] = [];
  for (const block of raw) {
    if (!block || typeof block !== 'object') return null;
    const { type, align, content } = block as Record<string, unknown>;
    if (type === 'hr') {
      out.push('<hr>');
      continue;
    }
    if (!['h1', 'h2', 'p', 'ul', 'ol'].includes(type as string) || !Array.isArray(content) || content.length === 0) return null;
    const textAlign = align === 'center' || align === 'left' || align === 'justify' ? align : 'right';
    const lines = content.map(line);
    if (lines.some((l) => l === null)) return null;
    if (type === 'ul' || type === 'ol') {
      out.push(`<${type} style="text-align: ${textAlign}">${lines.map((l) => `<li>${l}</li>`).join('')}</${type}>`);
    } else {
      out.push(`<${type} style="text-align: ${textAlign}">${lines[0]}</${type}>`);
    }
  }
  if (textLength > MAX_TEXT) return null;

  // Fields float over the text at the pixel spot the admin dropped them on,
  // kept inside the page margins so a filled value never runs off the paper.
  const tags = fields.filter((f) => !inlined.has(f)).map((f) => {
    const w = Math.min(f.w, PAGE.width - PAGE.padX * 2);
    const x = Math.min(Math.max(f.x, PAGE.padX), PAGE.width - PAGE.padX - w);
    return fieldTag(f, `position: absolute; left: ${x.toFixed(1)}px; top: ${f.y.toFixed(1)}px; width: ${w.toFixed(1)}px; height: ${f.h.toFixed(1)}px;`);
  });

  return `<!doctype html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700&display=swap">
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; }
  .page { position: relative; box-sizing: border-box; width: ${PAGE.width}px; padding: ${PAGE.padY}px ${PAGE.padX}px; }
  .doc { font-family: 'Heebo', 'Arial Hebrew', 'DejaVu Sans', Arial, sans-serif; font-size: 16px; line-height: 1.8; color: #111; direction: rtl; text-align: right; }
  h1 { font-size: 28px; line-height: 1.3; margin: 0 0 16px; font-weight: 700; }
  h2 { font-size: 20px; line-height: 1.4; margin: 20px 0 8px; font-weight: 700; }
  p { margin: 0 0 8px; }
  ul, ol { margin: 0 0 8px; padding-right: 26px; padding-left: 0; }
  strong { font-weight: 700; }
  hr { border: none; border-top: 1px solid #C9D1D8; margin: 12px 0; }
  .lh { position: relative; height: ${PAGE.headerH}px; margin-bottom: ${PAGE.headerGap}px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding-bottom: 16px; border-bottom: 1px solid #E1E6EA; direction: rtl; font-family: 'Heebo', 'Arial Hebrew', Arial, sans-serif; }
  .lh::after { content: ''; position: absolute; right: 0; bottom: -2px; width: 56px; height: 3px; border-radius: 2px; background: #0088CC; }
  .lh-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .lh-logo { flex: none; width: 52px; height: 52px; border-radius: 13px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #F4F6F8; }
  .lh-logo img { width: 100%; height: 100%; object-fit: contain; }
  .lh-mono { background: linear-gradient(160deg, #35B8F0, #0088CC); color: #fff; font-weight: 700; font-size: 24px; }
  .lh-name { font-size: 22px; line-height: 1.2; font-weight: 700; color: #16222E; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lh-date { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .lh-label { font-size: 12px; line-height: 1.2; color: #8B98A4; }
</style>
</head>
<body><div class="page">${renderLetterhead(letterhead)}<div class="doc">${out.join('\n')}</div>${tags.join('')}</div></body>
</html>`;
}

/**
 * A whole editor document, checked and cleaned for storing: the blocks, the
 * fields, at least one signature, and a document that renders. null when any
 * part is invalid.
 */
export function cleanEditorContent(rawBlocks: unknown, rawFields: unknown): { blocks: Block[]; fields: EditorField[] } | null {
  const blocks = cleanEditorBlocks(rawBlocks);
  const fields = parseEditorFields(rawFields);
  if (!blocks || !fields || !fields.some((f) => f.kind === 'signature')) return null;
  return renderEditorDocument(blocks, fields, { name: 'x', logoUrl: null }) ? { blocks, fields } : null;
}
