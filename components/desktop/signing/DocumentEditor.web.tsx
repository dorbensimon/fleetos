import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { EDITOR_HIGHLIGHT, EDITOR_PAGE, EDITOR_TEXT_COLORS, EDITOR_TEXT_SIZES, type EditorBlock, type EditorInline, type EditorPlacedField, type SigningFieldKind } from '../../../lib/companySigningTemplates';
import { useCompany } from '../../../lib/CompanyContext';
import { AUTO_FIELDS, DRIVER_FIELDS, FIELD_META } from './fieldMeta';
import { FIELD_DRAG_TYPE, FieldBox, FieldInspector, trackPointer } from './FieldBox.web';

/**
 * The "write it here" document editor: a Word-like A4 page (contentEditable)
 * with a labelled toolbar, and fields that float above the text. A field is
 * dragged from the side panel (or clicked in) and can then be dragged
 * anywhere on the page. Each field is pinned to the paragraph it sits on, so
 * typing above it carries it down with its text.
 *
 * The page's DOM is turned into a small block model on save; the server
 * builds the signing PDF from that model and the field positions, never from
 * this HTML.
 */

/** A field on the editor page: `dy` is measured from the top of its anchor paragraph (or the page, when there is none). */
export type EditorField = {
  id: string;
  kind: SigningFieldKind;
  label?: string;
  anchor: string | null;
  x: number;
  dy: number;
  w: number;
  h: number;
  /** Where the field last stood on the page, used if its paragraph is gone. */
  lastTop?: number;
};

/** Everything needed to reopen the editor where the admin left it. */
export type EditorDraft = { html: string; fields: EditorField[] };

export type EditorSnapshot = { draft: EditorDraft; blocks: EditorBlock[]; placed: EditorPlacedField[] };

export type DocumentEditorHandle = { snapshot: () => EditorSnapshot };

const { width: PAGE_W, height: PAGE_H, padX: PAD_X, padY: PAD_Y, headerH: HEADER_H, headerGap: HEADER_GAP } = EDITOR_PAGE;
/** Fields stay below the letterhead. */
const TOP_MIN = PAD_Y + HEADER_H + HEADER_GAP / 2;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
/** An A4 page is 21cm wide, so this many page pixels make a centimetre. */
const PX_PER_CM = PAGE_W / 21;
const cm = (px: number) => (Math.round((px / PX_PER_CM) * 10) / 10).toLocaleString('he-IL');
type Rect = { l: number; t: number; r: number; b: number };

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function initialEditorDraft(title: string): EditorDraft {
  return { html: `<h1>${escapeHtml(title)}</h1><p><br></p>`, fields: [] };
}

let seq = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq += 1)}`;

/** One line of body text on the page (16px at 1.8 line height). */
const LINE_H = Math.round(16 * 1.8);

/** Default size in page pixels: as tall as a line of text, so a field sits in the text like a word; a checkbox is a small square on the line. */
function sizeOf(kind: SigningFieldKind) {
  if (kind === 'checkbox') return { w: 22, h: 22 };
  return { w: Math.round(FIELD_META[kind].size.w * PAGE_W), h: LINE_H };
}

/** The lines the "ready signing area" writes, each followed by its field. */
const SIGNING_AREA: [SigningFieldKind, string][] = [
  ['driver_full_name', 'שם הנהג:'],
  ['driver_national_id', 'תעודת זהות:'],
  ['date', 'תאריך:'],
  ['signature', 'חתימת הנהג:'],
];

type Marks = { bold?: boolean; italic?: boolean; underline?: boolean; size?: number; color?: string; highlight?: boolean };

const BODY_SIZE = 16;
const BODY_COLOR = '#111111';
const SIZE_SET = new Set<number>(EDITOR_TEXT_SIZES.map((s) => s.px));
const COLOR_SET = new Set<string>(EDITOR_TEXT_COLORS.map((c) => c.hex));

/** "rgb(0, 136, 204)" or "#0075B3" as "#0075B3"; null for transparent or unknown. */
function toHex(value: string): string | null {
  const v = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toUpperCase();
  const m = v.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return null;
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** The size, colour and marker an element sets on its text, on top of what it inherits. */
function styledMarks(el: HTMLElement, marks: Marks): Pick<Marks, 'size' | 'color' | 'highlight'> {
  let { size, color, highlight } = marks;
  if (el.style.fontSize) {
    const px = Math.round(parseFloat(el.style.fontSize));
    size = SIZE_SET.has(px) && px !== BODY_SIZE ? px : undefined;
  }
  const rawColor = el.style.color || (el.tagName === 'FONT' ? el.getAttribute('color') ?? '' : '');
  if (rawColor) {
    const hex = toHex(rawColor);
    color = hex && COLOR_SET.has(hex) && hex !== BODY_COLOR ? hex : undefined;
  }
  if (el.style.backgroundColor) highlight = toHex(el.style.backgroundColor) === EDITOR_HIGHLIGHT;
  return { size, color, highlight };
}

const sameMarks = (a: Marks, b: Marks) =>
  !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline && a.size === b.size && a.color === b.color && !!a.highlight === !!b.highlight;

function inlines(node: Node, marks: Marks, out: EditorInline[]) {
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\u200b/g, '');
      if (text) out.push({ text, ...marks });
      return;
    }
    if (!(child instanceof HTMLElement)) return;
    const tag = child.tagName;
    if (tag === 'BR') {
      out.push({ text: '\n', ...marks });
      return;
    }
    const weight = child.style.fontWeight;
    const next: Marks = {
      bold: marks.bold || tag === 'B' || tag === 'STRONG' || weight === 'bold' || Number(weight) >= 600,
      italic: marks.italic || tag === 'I' || tag === 'EM' || child.style.fontStyle === 'italic',
      underline: marks.underline || tag === 'U' || child.style.textDecoration.includes('underline'),
      ...styledMarks(child, marks),
    };
    const isBlock = tag === 'DIV' || tag === 'P' || tag === 'LI';
    if (isBlock && out.length) out.push({ text: '\n', ...marks });
    inlines(child, next, out);
  });
}

/** Joins neighbouring runs with the same marks and drops empty ones. */
function compact(items: EditorInline[]): EditorInline[] {
  const out: EditorInline[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if ('text' in item && last && 'text' in last && sameMarks(last, item)) {
      last.text += item.text;
    } else out.push({ ...item });
  }
  // A trailing line break is only the browser's placeholder.
  const tail = out[out.length - 1];
  if (tail && 'text' in tail) {
    tail.text = tail.text.replace(/\n+$/, '');
    if (!tail.text) out.pop();
  }
  return out;
}

function alignOf(el: HTMLElement): EditorBlock['align'] {
  const value = el.style.textAlign || el.getAttribute('align') || '';
  if (value === 'center') return 'center';
  if (value === 'left') return 'left';
  if (value === 'justify') return 'justify';
  return 'right';
}

export function serializeEditor(root: HTMLElement): EditorBlock[] {
  const blocks: EditorBlock[] = [];
  let loose: EditorInline[] = [];
  const flushLoose = () => {
    const content = compact(loose);
    if (content.length) blocks.push({ type: 'p', align: 'right', content: [content] });
    loose = [];
  };

  root.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE || (child instanceof HTMLElement && (['SPAN', 'FONT', 'B', 'STRONG', 'I', 'EM', 'U', 'BR'].includes(child.tagName)))) {
      const wrapper = document.createElement('span');
      wrapper.appendChild(child.cloneNode(true));
      inlines(wrapper, {}, loose);
      return;
    }
    if (!(child instanceof HTMLElement)) return;
    flushLoose();
    const tag = child.tagName;
    if (tag === 'HR') {
      blocks.push({ type: 'hr', content: [] });
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      const items = Array.from(child.children)
        .map((li) => {
          const out: EditorInline[] = [];
          inlines(li, {}, out);
          return compact(out);
        })
        .filter((line) => line.length > 0);
      if (items.length) blocks.push({ type: tag === 'UL' ? 'ul' : 'ol', align: alignOf(child), content: items });
      return;
    }
    const out: EditorInline[] = [];
    inlines(child, {}, out);
    const type = tag === 'H1' ? 'h1' : tag === 'H2' || tag === 'H3' ? 'h2' : 'p';
    blocks.push({ type, align: alignOf(child), content: [compact(out)] });
  });
  flushLoose();

  // Blank paragraphs are kept as spacing, but not at the very end.
  while (blocks.length && blocks[blocks.length - 1].type !== 'hr' && blocks[blocks.length - 1].content.every((line) => line.length === 0)) blocks.pop();
  return blocks;
}


type StyleKind = 'size' | 'color' | 'hl';
const STYLE_PROP = { size: 'fontSize', color: 'color', hl: 'backgroundColor' } as const;
const MARKER = 'fleet-';

function styleValue(kind: StyleKind, value: string) {
  if (kind === 'size') return `${value}px`;
  if (kind === 'color') return `#${value}`;
  return value === '1' ? EDITOR_HIGHLIGHT : 'transparent';
}

/**
 * The browser marks a styled selection with a stand-in font name
 * ("fleet-size-20"); this swaps each mark for a span with the real style and
 * lets it override the same style on anything inside it.
 */
function applyStyleMarks(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('font[face], span[style*="font-family"]').forEach((el) => {
    const face = (el.getAttribute('face') || el.style.fontFamily).replace(/["']/g, '');
    if (!face.startsWith(MARKER)) return;
    const [kind, value] = face.slice(MARKER.length).split('-') as [StyleKind, string];
    if (!STYLE_PROP[kind]) return;
    const prop = STYLE_PROP[kind];
    const span = document.createElement('span');
    if (el.tagName === 'SPAN') span.style.cssText = el.style.cssText;
    span.style.fontFamily = '';
    span.style[prop] = styleValue(kind, value);
    while (el.firstChild) span.appendChild(el.firstChild);
    span.querySelectorAll<HTMLElement>('span').forEach((inner) => {
      inner.style[prop] = '';
    });
    el.replaceWith(span);
  });
}

/** A divider line belongs between paragraphs, never inside one. */
function liftDividers(root: HTMLElement) {
  root.querySelectorAll('hr').forEach((hr) => {
    let top: Node = hr;
    while (top.parentNode && top.parentNode !== root) top = top.parentNode;
    if (top !== hr) root.insertBefore(hr, top.nextSibling);
  });
}

/** Toolbar buttons keep the editor's selection: mousedown would otherwise move focus off the page. */
const keepSelection = (event: React.MouseEvent) => event.preventDefault();

function Tb({ on, label, onPress, children }: { on?: boolean; label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`sd-tb${on ? ' sd-on' : ''}`} title={label} aria-label={label} aria-pressed={on} onMouseDown={keepSelection} onClick={onPress}>
      {children}
    </button>
  );
}

/** A toolbar button that opens a short list of choices under it. */
function TbMenu({ label, open, onToggle, onClose, button, children }: { label: string; open: boolean; onToggle: () => void; onClose: () => void; button: React.ReactNode; children: React.ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) onClose();
    };
    const esc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open, onClose]);
  return (
    <div className="sd-tb-wrap" ref={wrap}>
      <button type="button" className={`sd-tb${open ? ' sd-on' : ''}`} title={label} aria-label={label} aria-haspopup="menu" aria-expanded={open} onMouseDown={keepSelection} onClick={onToggle}>
        {button}
        <Ionicons name="chevron-down" size={13} color="currentColor" />
      </button>
      {open ? (
        <div className="sd-menu" role="menu" aria-label={label} onMouseDown={keepSelection}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ on, onPress, children }: { on: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={on} className={`sd-menu-item${on ? ' sd-on' : ''}`} onClick={onPress}>
      {children}
      <span className="sd-menu-check">{on ? <Ionicons name="checkmark" size={17} color="currentColor" /> : null}</span>
    </button>
  );
}

/** Today as the document shows it: 23/09/2026. */
export function letterheadDate(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/**
 * The company's letterhead at the top of the first page: logo and name on the
 * right, the date on the left. It is not part of the editable text; the server
 * draws the same header (and fills the date in when the document is sent).
 */
export function Letterhead() {
  const { company } = useCompany();
  const [logoFailed, setLogoFailed] = useState(false);
  const name = company?.name?.trim() || 'שם החברה';
  const logo = company?.logo_url && !logoFailed ? company.logo_url : null;
  return (
    <div className="sd-lh" contentEditable={false} aria-label={`כותרת המסמך: ${name}`}>
      <div className="sd-lh-brand">
        {logo ? (
          <span className="sd-lh-logo">
            <img src={logo} alt="" onError={() => setLogoFailed(true)} />
          </span>
        ) : (
          <span className="sd-lh-logo sd-lh-mono" aria-hidden="true">{name.charAt(0)}</span>
        )}
        <span className="sd-lh-name">{name}</span>
      </div>
      <div className="sd-lh-date">
        <span className="sd-lh-label">תאריך</span>
        <span className="sd-lh-value">{letterheadDate()}</span>
      </div>
    </div>
  );
}

type ToolState = { block: string; bold: boolean; italic: boolean; underline: boolean; ul: boolean; ol: boolean; align: string; size: number; color: string; highlight: boolean };

export const DocumentEditor = forwardRef<DocumentEditorHandle, { initial: EditorDraft; onSignatureChange?: (has: boolean) => void }>(function DocumentEditor(
  { initial, onSignatureChange },
  ref,
) {
  const pageRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [tools, setTools] = useState<ToolState>({ block: 'p', bold: false, italic: false, underline: false, ul: false, ol: false, align: 'right', size: BODY_SIZE, color: BODY_COLOR, highlight: false });
  const [menu, setMenu] = useState<'size' | 'color' | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const [fields, setFields] = useState<EditorField[]>(initial.fields);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const history = useRef<EditorField[][]>([]);
  const [over, setOver] = useState(false);

  // Where every paragraph starts on the page. Tops of paragraphs that were
  // deleted stay known, so their fields stay where they were.
  const knownTops = useRef(new Map<string, number>());
  const [layout, setLayout] = useState({ tops: {} as Record<string, number>, textBottom: 0, text: [] as Rect[] });

  /** Tags every top-level paragraph with an id and records where it starts. */
  const measure = useCallback(() => {
    const doc = docRef.current;
    if (!doc) return;
    const seen = new Set<string>();
    const tops: Record<string, number> = {};
    Array.from(doc.children).forEach((child) => {
      const el = child as HTMLElement;
      // Enter copies the paragraph's attributes onto the new one; the second copy gets its own id.
      let id = el.dataset.bid;
      if (!id || seen.has(id)) {
        id = newId('b');
        el.dataset.bid = id;
      }
      seen.add(id);
      tops[id] = el.offsetTop;
      knownTops.current.set(id, el.offsetTop);
    });
    const last = doc.lastElementChild as HTMLElement | null;
    const textBottom = last ? last.offsetTop + last.offsetHeight : 0;
    // Where the written words sit, so a field dropped on top of them can say so.
    const text: Rect[] = [];
    const origin = pageRef.current?.getBoundingClientRect();
    if (origin) {
      const walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.replace(/[\s\u200b]/g, '')) continue;
        range.selectNodeContents(node);
        Array.from(range.getClientRects()).forEach((r) => {
          if (r.width > 1) text.push({ l: r.left - origin.left, t: r.top - origin.top, r: r.right - origin.left, b: r.bottom - origin.top });
        });
      }
    }
    const textKey = (list: Rect[]) => list.map((r) => `${Math.round(r.l)},${Math.round(r.t)},${Math.round(r.r)}`).join(';');
    setLayout((prev) => {
      const same =
        prev.textBottom === textBottom &&
        Object.keys(tops).length === Object.keys(prev.tops).length &&
        Object.entries(tops).every(([k, v]) => prev.tops[k] === v) &&
        textKey(prev.text) === textKey(text);
      return same ? prev : { tops, textBottom, text };
    });
  }, []);

  const topOf = useCallback(
    (field: EditorField) => {
      if (!field.anchor) return field.dy;
      const top = layout.tops[field.anchor] ?? knownTops.current.get(field.anchor);
      return top === undefined ? field.lastTop ?? field.dy : top + field.dy;
    },
    [layout],
  );

  /** True when the field sits on written words, which it would hide on the signed document. */
  const coversText = useCallback(
    (field: EditorField) => {
      const top = topOf(field);
      return layout.text.some((r) => Math.min(r.r, field.x + field.w) - Math.max(r.l, field.x) > 4 && Math.min(r.b, top + field.h) - Math.max(r.t, top) > 6);
    },
    [layout, topOf],
  );

  /** Pins a field whose top edge is at page `y` to the paragraph under its middle. */
  const anchorAt = useCallback((y: number, h: number): { anchor: string | null; dy: number } => {
    const doc = docRef.current;
    const middle = y + h / 2;
    let anchor: string | null = null;
    let top = 0;
    Array.from(doc?.children ?? []).forEach((child) => {
      const el = child as HTMLElement;
      if (el.dataset.bid && el.offsetTop <= middle) {
        anchor = el.dataset.bid;
        top = el.offsetTop;
      }
    });
    return { anchor, dy: y - top };
  }, []);

  useImperativeHandle(ref, () => ({
    snapshot: () => {
      measure();
      const doc = docRef.current;
      const saved = fieldsRef.current.map((f) => {
        const el = f.anchor ? doc?.querySelector<HTMLElement>(`[data-bid="${f.anchor}"]`) : null;
        const known = f.anchor ? knownTops.current.get(f.anchor) : undefined;
        const lastTop = Math.max(0, el ? el.offsetTop + f.dy : known !== undefined ? known + f.dy : f.anchor ? f.lastTop ?? f.dy : f.dy);
        return { ...f, lastTop };
      });
      const placed = saved.map((f) => ({ kind: f.kind, label: f.label?.trim() || undefined, x: Math.round(f.x), y: Math.round(f.lastTop), w: Math.round(f.w), h: Math.round(f.h) }));
      return { draft: { html: doc?.innerHTML ?? '', fields: saved }, blocks: doc ? serializeEditor(doc) : [], placed };
    },
  }));

  useEffect(() => {
    onSignatureChange?.(fields.some((f) => f.kind === 'signature'));
  }, [fields, onSignatureChange]);

  useLayoutEffect(() => {
    const el = docRef.current;
    if (!el) return;
    el.innerHTML = initial.html;
    document.execCommand('defaultParagraphSeparator', false, 'p');
    measure();
    // Start typing on the line under the title.
    const target = el.querySelector('p') ?? el;
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(true);
    savedRange.current = range;
    el.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshTools = useCallback(() => {
    const el = docRef.current;
    const selection = window.getSelection();
    if (!el || !selection?.rangeCount || !el.contains(selection.anchorNode)) return;
    savedRange.current = selection.getRangeAt(0).cloneRange();
    const block = String(document.queryCommandValue('formatBlock') || 'p').toLowerCase();
    const node = selection.anchorNode;
    const at = node instanceof HTMLElement ? node : node?.parentElement ?? el;
    const computed = window.getComputedStyle(at);
    let highlight = false;
    for (let cur: HTMLElement | null = at; cur && cur !== el; cur = cur.parentElement) {
      if (cur.style.backgroundColor) {
        highlight = toHex(cur.style.backgroundColor) === EDITOR_HIGHLIGHT;
        break;
      }
    }
    setTools({
      block,
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      ul: document.queryCommandState('insertUnorderedList'),
      ol: document.queryCommandState('insertOrderedList'),
      align: document.queryCommandState('justifyCenter')
        ? 'center'
        : document.queryCommandState('justifyFull')
        ? 'justify'
        : document.queryCommandState('justifyLeft')
        ? 'left'
        : 'right',
      size: Math.round(parseFloat(computed.fontSize)) || BODY_SIZE,
      color: toHex(computed.color) ?? BODY_COLOR,
      highlight,
    });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', refreshTools);
    return () => document.removeEventListener('selectionchange', refreshTools);
  }, [refreshTools]);

  /** Puts the caret back where it was before a toolbar button took focus. */
  const restore = () => {
    const el = docRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (savedRange.current && el.contains(savedRange.current.startContainer)) {
      selection?.removeAllRanges();
      selection?.addRange(savedRange.current);
    } else {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  };

  const run = (command: string, value?: string) => {
    restore();
    document.execCommand(command, false, value);
    refreshTools();
    measure();
  };

  /** Text size, colour or marker on the selected words, or on what is typed next. */
  const applyStyle = (kind: StyleKind, value: string) => {
    const doc = docRef.current;
    if (!doc) return;
    setMenu(null);
    restore();
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    if (selection.isCollapsed) {
      // Nothing selected: open a styled spot at the caret so the next words get the style.
      const span = document.createElement('span');
      span.style[STYLE_PROP[kind]] = styleValue(kind, value);
      span.textContent = '\u200b';
      const range = selection.getRangeAt(0);
      range.insertNode(span);
      const caret = document.createRange();
      caret.setStart(span.firstChild!, 1);
      caret.collapse(true);
      selection.removeAllRanges();
      selection.addRange(caret);
    } else {
      document.execCommand('styleWithCSS', false, 'false');
      document.execCommand('fontName', false, `${MARKER}${kind}-${value}`);
      applyStyleMarks(doc);
    }
    refreshTools();
    measure();
  };

  const insertDivider = () => {
    const doc = docRef.current;
    if (!doc) return;
    restore();
    const node = window.getSelection()?.anchorNode;
    const line = node instanceof HTMLElement ? node : node?.parentElement;
    if (line?.closest('p, h1, h2, li, div:not(.sd-doc)')?.textContent?.trim()) document.execCommand('insertParagraph');
    document.execCommand('insertHTML', false, '<hr><p><br></p>');
    liftDividers(doc);
    refreshTools();
    measure();
  };

  // ------------------------------------------------------------ fields

  const remember = useCallback(() => {
    history.current.push(fieldsRef.current);
    if (history.current.length > 60) history.current.shift();
  }, []);

  const commit = (next: EditorField[]) => {
    remember();
    setFields(next);
  };

  const makeField = (kind: SigningFieldKind, x: number, y: number): EditorField => {
    const size = sizeOf(kind);
    const left = clamp(x, 0, PAGE_W - size.w);
    const top = Math.max(TOP_MIN, y);
    return { id: newId('f'), kind, ...size, x: left, ...anchorAt(top, size.h) };
  };

  /** Dropped from the side panel: centred on the pointer. */
  const addAt = (kind: SigningFieldKind, clientX: number, clientY: number) => {
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) return;
    measure();
    const size = sizeOf(kind);
    const field = makeField(kind, clientX - rect.left - size.w / 2, clientY - rect.top - size.h / 2);
    commit([...fieldsRef.current, field]);
    setSelectedId(field.id);
  };

  /** Clicked in the side panel: lands right under the last written line, below any fields already there, and scrolls into view. */
  const addInView = (kind: SigningFieldKind) => {
    const doc = docRef.current;
    const page = pageRef.current;
    if (!doc || !page) return;
    measure();
    const written = Array.from(doc.children).filter((el) => el.textContent?.replace(/[\s\u200b]/g, ''));
    const lastLine = written[written.length - 1] as HTMLElement | undefined;
    const size = sizeOf(kind);
    // Right-hand margin, where a Hebrew line starts.
    const x = PAGE_W - PAD_X - size.w;
    const taken = fieldsRef.current.map((f) => ({ top: topOf(f), bottom: topOf(f) + f.h, left: f.x, right: f.x + f.w }));
    let y = lastLine ? lastLine.offsetTop + lastLine.offsetHeight + 12 : doc.offsetTop;
    for (let tries = 0; tries < 200; tries += 1) {
      const clash = taken.find((t) => y < t.bottom + 8 && y + size.h > t.top - 8 && x < t.right && x + size.w > t.left);
      if (!clash) break;
      y = clash.bottom + 12;
    }
    const field = makeField(kind, x, y);
    commit([...fieldsRef.current, field]);
    setSelectedId(field.id);
    // Bring the new field on screen if it landed below what's visible.
    const scroller = page.closest<HTMLElement>('.sd-sheet-body');
    if (scroller) {
      const fieldTop = page.getBoundingClientRect().top + y;
      const view = scroller.getBoundingClientRect();
      if (fieldTop + size.h > view.bottom - 60 || fieldTop < view.top + 60) {
        scroller.scrollBy({ top: fieldTop - (view.top + view.height / 2), behavior: 'smooth' });
      }
    }
  };

  const insertSigningArea = () => {
    const doc = docRef.current;
    const page = pageRef.current;
    if (!doc || !page) return;
    restore();
    // The area is its own lines: start a fresh one unless the caret already sits on an empty line.
    const node = window.getSelection()?.anchorNode;
    const line = node instanceof HTMLElement ? node : node?.parentElement;
    if (line?.closest('p, h1, h2, li, div:not(.sd-doc)')?.textContent?.trim()) document.execCommand('insertParagraph');
    const html = SIGNING_AREA.map(([kind, text]) => `<p>${text} <span data-slot="${kind}">​</span></p>`).join('') + '<p><br></p><p><br></p>';
    document.execCommand('insertHTML', false, html);

    // Each label is followed by its field: measure where the label ends, then drop the marker.
    const pageRect = page.getBoundingClientRect();
    const slots = Array.from(doc.querySelectorAll<HTMLElement>('span[data-slot]'));
    const spots = slots.map((span) => {
      const kind = span.dataset.slot as SigningFieldKind;
      const end = span.getBoundingClientRect();
      const para = (span.closest('p') ?? span).getBoundingClientRect();
      span.remove();
      const size = sizeOf(kind);
      const y = para.top - pageRect.top + (para.height - size.h) / 2;
      return { kind, x: Math.max(PAD_X, end.left - pageRect.left - 12 - size.w), y };
    });
    measure();
    const added = spots.filter((s) => FIELD_META[s.kind]).map((s) => makeField(s.kind, s.x, s.y));
    commit([...fieldsRef.current, ...added]);
    setSelectedId(null);
  };

  const change = (field: EditorField) => setFields((list) => list.map((f) => (f.id === field.id ? field : f)));
  const remove = (id: string) => {
    commit(fieldsRef.current.filter((f) => f.id !== id));
    setSelectedId(null);
  };

  const gesture = (field: EditorField, mode: 'move' | 'resize') => (event: React.PointerEvent) => {
    const startTop = topOf(field);
    let latest = field;
    trackPointer(
      event,
      remember,
      (dx, dy) => {
        if (mode === 'move') {
          const x = clamp(field.x + dx, 0, PAGE_W - field.w);
          const y = Math.max(TOP_MIN, startTop + dy);
          latest = { ...field, x, dy: field.dy + (y - startTop) };
        } else {
          latest = { ...field, w: clamp(field.w + dx, 18, PAGE_W - field.x), h: clamp(field.h + dy, 18, 400) };
        }
        change(latest);
      },
      () => {
        // Re-pin to whichever paragraph the field now sits on.
        change({ ...latest, ...anchorAt(topOf(latest), latest.h) });
      },
    );
  };

  const nudge = (field: EditorField) => (dx: number, dy: number, big: boolean) => {
    const step = big ? 20 : 4;
    remember();
    const x = clamp(field.x + dx * step, 0, PAGE_W - field.w);
    const y = Math.max(TOP_MIN, topOf(field) + dy * step);
    change({ ...field, x, ...anchorAt(y, field.h) });
  };

  // Ctrl+Z outside the text undoes the last field change; inside the text it stays the browser's text undo.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inText = !!target?.closest?.('.sd-doc') || target instanceof HTMLInputElement;
      if (inText || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      const previous = history.current.pop();
      if (previous) {
        event.preventDefault();
        setFields(previous);
        setSelectedId(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Pasted text arrives as plain text, so another program's formatting never leaks in.
  const onPaste = (event: React.ClipboardEvent) => {
    event.preventDefault();
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
    measure();
  };

  const fieldBottom = fields.reduce((max, f) => Math.max(max, topOf(f) + f.h), 0);
  const pages = Math.max(1, Math.ceil((Math.max(layout.textBottom, fieldBottom) + 40) / PAGE_H));
  const selected = fields.find((f) => f.id === selectedId) ?? null;
  const dragStart = (kind: SigningFieldKind) => (event: React.DragEvent) => {
    event.dataTransfer.setData(FIELD_DRAG_TYPE, kind);
    event.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="sd-work">
      <aside className="sd-panel" aria-label="הוספת שדות">
        <h3 className="sd-b">הוספת שדה למסמך</h3>
        <p className="sd-panel-sub">לחצו על שדה והוא יופיע מתחת לטקסט שכתבתם, או גררו אותו ישר למקום הרצוי. אפשר להזיז כל שדה בגרירה.</p>

        <button type="button" className="sd-area-btn" onMouseDown={keepSelection} onClick={insertSigningArea}>
          <span className="sd-tool-icon" style={{ background: 'linear-gradient(160deg,#35B8F0,#0075B3)' }}>
            <Ionicons name="sparkles" size={18} color="#fff" />
          </span>
          <span className="sd-tool-text">
            <strong className="sd-sb">אזור חתימה מוכן</strong>
            <small>שם, ת״ז, תאריך וחתימה בלחיצה אחת</small>
          </span>
        </button>

        <div className="sd-group-label sd-sb">הנהג ימלא</div>
        <div className="sd-tiles">
          {DRIVER_FIELDS.map((kind) => (
            <FieldTool key={kind} kind={kind} onMouseDown={keepSelection} draggable onDragStart={dragStart(kind)} onPress={() => addInView(kind)} />
          ))}
        </div>

        <div className="sd-group-label sd-sb">יתמלא אוטומטית מתיק הנהג</div>
        <div className="sd-tiles">
          {AUTO_FIELDS.map((kind) => (
            <FieldTool key={kind} kind={kind} onMouseDown={keepSelection} draggable onDragStart={dragStart(kind)} onPress={() => addInView(kind)} />
          ))}
        </div>

        {selected ? (
          <FieldInspector
            key={selected.id}
            kind={selected.kind}
            label={selected.label}
            size={`${cm(selected.w)} × ${cm(selected.h)} ס״מ`}
            covers={coversText(selected)}
            onEditStart={remember}
            onLabelChange={(label) => change({ ...selected, label })}
            onRemove={() => remove(selected.id)}
          />
        ) : null}
      </aside>

      <div className="sd-canvas">
        <div className="sd-toolbar" role="toolbar" aria-label="עיצוב הטקסט">
          <Tb label="כותרת ראשית" on={tools.block === 'h1'} onPress={() => run('formatBlock', 'h1')}>
            <span className="sd-b">כותרת</span>
          </Tb>
          <Tb label="כותרת משנה" on={tools.block === 'h2'} onPress={() => run('formatBlock', 'h2')}>
            <span className="sd-sb">כותרת משנה</span>
          </Tb>
          <Tb label="טקסט רגיל" on={tools.block === 'p' || tools.block === 'div'} onPress={() => run('formatBlock', 'p')}>
            טקסט רגיל
          </Tb>
          <span className="sd-tb-sep" />
          <TbMenu
            label="גודל הטקסט"
            open={menu === 'size'}
            onToggle={() => setMenu(menu === 'size' ? null : 'size')}
            onClose={closeMenu}
            button={<span className="sd-sb sd-tb-size">{EDITOR_TEXT_SIZES.find((s) => s.px === tools.size)?.label ?? 'גודל'}</span>}
          >
            {EDITOR_TEXT_SIZES.map((s) => (
              <MenuItem key={s.px} on={tools.size === s.px} onPress={() => applyStyle('size', String(s.px))}>
                <span style={{ fontSize: s.px }}>{s.label}</span>
              </MenuItem>
            ))}
          </TbMenu>
          <span className="sd-tb-sep" />
          <Tb label="מודגש" on={tools.bold} onPress={() => run('bold')}>
            <span className="sd-xb" style={{ fontSize: 16 }}>B</span>
          </Tb>
          <Tb label="נטוי" on={tools.italic} onPress={() => run('italic')}>
            <span style={{ fontStyle: 'italic', fontSize: 16 }}>I</span>
          </Tb>
          <Tb label="קו תחתון" on={tools.underline} onPress={() => run('underline')}>
            <span style={{ textDecoration: 'underline', fontSize: 16 }}>U</span>
          </Tb>
          <TbMenu
            label="צבע הטקסט"
            open={menu === 'color'}
            onToggle={() => setMenu(menu === 'color' ? null : 'color')}
            onClose={closeMenu}
            button={
              <span className="sd-color-a sd-b">
                א
                <i style={{ background: tools.color }} />
              </span>
            }
          >
            {EDITOR_TEXT_COLORS.map((c) => (
              <MenuItem key={c.hex} on={tools.color === c.hex} onPress={() => applyStyle('color', c.hex.slice(1))}>
                <span className="sd-swatch" style={{ background: c.hex }} />
                <span style={{ color: c.hex }}>{c.label}</span>
              </MenuItem>
            ))}
          </TbMenu>
          <Tb label="סימון בצהוב" on={tools.highlight} onPress={() => applyStyle('hl', tools.highlight ? '0' : '1')}>
            <span className="sd-hl-a sd-b">א</span>
          </Tb>
          <span className="sd-tb-sep" />
          <Tb label="רשימה עם נקודות" on={tools.ul} onPress={() => run('insertUnorderedList')}>
            <Ionicons name="list" size={19} color="currentColor" />
          </Tb>
          <Tb label="רשימה ממוספרת" on={tools.ol} onPress={() => run('insertOrderedList')}>
            <span className="sd-sb">1.</span>
          </Tb>
          <span className="sd-tb-sep" />
          <Tb label="יישור לימין" on={tools.align === 'right'} onPress={() => run('justifyRight')}>
            <Ionicons name="reorder-three" size={21} color="currentColor" style={{ transform: [{ scaleX: -1 }] }} />
          </Tb>
          <Tb label="מרכוז" on={tools.align === 'center'} onPress={() => run('justifyCenter')}>
            <Ionicons name="menu" size={19} color="currentColor" />
          </Tb>
          <Tb label="יישור לשני הצדדים" on={tools.align === 'justify'} onPress={() => run('justifyFull')}>
            <Ionicons name="reorder-four" size={19} color="currentColor" />
          </Tb>
          <span className="sd-tb-sep" />
          <Tb label="קו מפריד" onPress={insertDivider}>
            <span className="sd-hr-icon" />
          </Tb>
          <span className="sd-tb-sep" />
          <Tb label="ביטול הפעולה האחרונה" onPress={() => run('undo')}>
            <Ionicons name="arrow-redo" size={18} color="currentColor" />
          </Tb>
          <Tb label="החזרת הפעולה" onPress={() => run('redo')}>
            <Ionicons name="arrow-undo" size={18} color="currentColor" />
          </Tb>
        </div>

        <div
          ref={pageRef}
          className={`sd-paper-page${over ? ' sd-over' : ''}`}
          style={{ minHeight: pages * PAGE_H }}
          onPointerDown={(e) => {
            if (!(e.target as HTMLElement).closest('.sd-field')) setSelectedId(null);
          }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(FIELD_DRAG_TYPE)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
          }}
          onDrop={(e) => {
            setOver(false);
            const kind = e.dataTransfer.getData(FIELD_DRAG_TYPE) as SigningFieldKind;
            if (!kind || !FIELD_META[kind]) return;
            e.preventDefault();
            addAt(kind, e.clientX, e.clientY);
          }}
        >
          <Letterhead />
          <div
            ref={docRef}
            className="sd-doc"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="תוכן המסמך"
            data-placeholder="כתבו כאן את תוכן המסמך…"
            spellCheck
            onInput={measure}
            onKeyUp={refreshTools}
            onMouseUp={refreshTools}
            onPaste={onPaste}
          />
          {Array.from({ length: pages - 1 }, (_, i) => (
            <div key={i} className="sd-page-break" style={{ top: (i + 1) * PAGE_H }} aria-hidden="true">
              <span>סוף עמוד {i + 1}</span>
            </div>
          ))}
          {fields.map((field) => (
            <FieldBox
              key={field.id}
              kind={field.kind}
              label={field.label}
              box={{ left: `${field.x}px`, top: `${topOf(field)}px`, width: `${field.w}px`, height: `${field.h}px` }}
              selected={field.id === selectedId}
              sizeLabel={`${cm(field.w)} × ${cm(field.h)} ס״מ`}
              covers={coversText(field)}
              onMovePointer={gesture(field, 'move')}
              onResizePointer={gesture(field, 'resize')}
              onNudge={nudge(field)}
              onRemove={() => remove(field.id)}
              onSelect={() => setSelectedId(field.id)}
              onDeselect={() => setSelectedId(null)}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

/** A read-only look at the first page with its fields, for the review step. */
export function EditorPagePreview({ html, fields }: { html: string; fields: EditorPlacedField[] }) {
  return (
    <div className="sd-mini-page" aria-hidden="true">
      <div className="sd-paper-page sd-mini-inner" style={{ height: PAGE_H, minHeight: 0 }}>
        <Letterhead />
        <div className="sd-doc" dangerouslySetInnerHTML={{ __html: html }} />
        {fields
          .filter((f) => f.y < PAGE_H)
          .map((f, i) => (
            <FieldBox key={i} kind={f.kind} label={f.label} box={{ left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` }} readOnly />
          ))}
      </div>
    </div>
  );
}

/** A field in the side panel: drag it onto the page, or click it to drop it into view. */
export function FieldTool({
  kind,
  onPress,
  onMouseDown,
  draggable,
  onDragStart,
}: {
  kind: SigningFieldKind;
  onPress: () => void;
  onMouseDown?: (event: React.MouseEvent) => void;
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
}) {
  const meta = FIELD_META[kind];
  return (
    <button
      type="button"
      className="sd-tile"
      draggable={draggable}
      onDragStart={onDragStart}
      onMouseDown={onMouseDown}
      onClick={onPress}
      title={`${meta.hint}. אפשר לגרור אל הדף`}
      aria-label={`הוספת ${meta.label}`}
    >
      <span className="sd-tile-icon" style={{ background: meta.color }}>
        <Ionicons name={meta.icon} size={17} color="#fff" />
      </span>
      <span className="sd-sb">{meta.label}</span>
    </button>
  );
}
