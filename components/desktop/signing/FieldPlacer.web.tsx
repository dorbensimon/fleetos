import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { PlacedSigningField, SigningFieldKind } from '../../../lib/companySigningTemplates';
import { AUTO_FIELDS, DRIVER_FIELDS, FIELD_META } from './fieldMeta';
import { FieldTool } from './DocumentEditor.web';
import { renderPage, type LoadedPdf } from './pdf.web';
import { FIELD_DRAG_TYPE, FieldBox, FieldInspector, trackPointer } from './FieldBox.web';
import { GUIDES_CSS, GuideLines, PageGrid, snapMove, snapResize, useGuidesToggle, GuidesToggle, type Guide } from './snapGuides.web';
import { EDITOR_PAGE } from '../../../lib/companySigningTemplates';
import { t, textStart } from '../../../lib/i18n';

/**
 * Placing fields on an uploaded document: the pages in the middle, a palette
 * of big field buttons on the side. A field can be dragged onto a page or
 * added with a click (it lands on the page in view), then moved, resized,
 * renamed or removed. Positions are fractions of the page, as DocuSeal stores them.
 */

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const A4 = { width: 595, height: 842 };
/** The page's middle and the usual A4 margins, as page fractions, for the smart guides. */
const MARGIN = { x: EDITOR_PAGE.padX / EDITOR_PAGE.width, y: EDITOR_PAGE.padY / EDITOR_PAGE.height };
const PAGE_LINES = { v: [0.5, MARGIN.x, 1 - MARGIN.x], h: [0.5, MARGIN.y, 1 - MARGIN.y], width: 1, height: 1 };
/** A one-centimetre grid on an A4 page (21 × 29.7 cm). */
const GRID_CELL = { x: 1 / 21, y: 1 / 29.7 };
/** How close, in screen pixels, a field has to come to a line to snap to it. */
const SNAP_PX = 6;

let fieldSeq = 0;
const newFieldId = () => `f${Date.now().toString(36)}${(fieldSeq += 1)}`;

function defaultSize(kind: SigningFieldKind, page: { width: number; height: number }) {
  const { w, h } = FIELD_META[kind].size;
  return { w: clamp((w * A4.width) / page.width, 0.02, 0.9), h: clamp((h * A4.height) / page.height, 0.012, 0.3) };
}

// ---------------------------------------------------------------- dropzone

export function UploadDropzone({ onFile, error }: { onFile: (file: File) => void; error?: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div className="sd-stage" style={{ padding: '0 24px' }}>
      <div
        className={`sd-dropzone${over ? ' sd-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
      >
        <div className="sd-drop-icon">
          <Ionicons name="cloud-upload" size={40} color="#fff" />
        </div>
        <h3 className="sd-b">{t('field.dropFileHere')}</h3>
        <p>{t('field.orClickButton')}</p>
        <button type="button" className="sd-btn sd-btn-primary sd-btn-lg" onClick={() => inputRef.current?.click()}>
          <Ionicons name="folder-open" size={20} color="#fff" />
          {t('documents.chooseFromComputer')}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onFile(file);
          }}
        />
        {error ? (
          <div className="sd-error" role="alert" style={{ textAlign: textStart() }}>
            <Ionicons name="alert-circle" size={20} color="#C4271E" />
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function BusyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="sd-busy sd-stage" role="status" aria-live="polite">
      <div className="sd-spinner" />
      <h3 className="sd-b">{title}</h3>
      <p>{subtitle}</p>
    </div>
  );
}

// ---------------------------------------------------------------- one page

type PageProps = {
  pdf: LoadedPdf;
  pageNumber: number;
  fields: PlacedSigningField[];
  selectedId?: string | null;
  readOnly?: boolean;
  onSelect?: (id: string | null) => void;
  onMoveStart?: () => void;
  onFieldChange?: (field: PlacedSigningField) => void;
  onRemove?: (id: string) => void;
  onDropField?: (kind: SigningFieldKind, page: number, x: number, y: number) => void;
  registerPage?: (page: number, el: HTMLDivElement | null) => void;
  /** "קווי עזר": the margins, the middle and a centimetre grid over the page. */
  showGrid?: boolean;
};

export function PdfPageView({ pdf, pageNumber, fields, selectedId, readOnly, onSelect, onMoveStart, onFieldChange, onRemove, onDropField, registerPage, showGrid }: PageProps) {
  const [guides, setGuides] = useState<Guide[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [over, setOver] = useState(false);
  const size = pdf.pages[pageNumber - 1];

  // Draw only once the page comes near the viewport, and again if it's resized.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    let drawnWidth = 0;
    let visible = false;
    const draw = () => {
      const width = wrap.clientWidth;
      if (!visible || !width || Math.abs(width - drawnWidth) < 8) return;
      drawnWidth = width;
      void renderPage(pdf.doc, pageNumber, canvas, width).catch(() => undefined);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      draw();
    }, { rootMargin: '600px 0px' });
    const ro = new ResizeObserver(draw);
    io.observe(wrap);
    ro.observe(wrap);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, [pdf, pageNumber]);

  useEffect(() => {
    registerPage?.(pageNumber, wrapRef.current);
    return () => registerPage?.(pageNumber, null);
  }, [registerPage, pageNumber]);

  const moveOrResize = (field: PlacedSigningField, mode: 'move' | 'resize') => (event: React.PointerEvent) => {
    const page = wrapRef.current?.getBoundingClientRect();
    if (!page) return;
    const others = fields.filter((f) => f.id !== field.id);
    // Snapping works in page fractions; the reach is the same few pixels either way.
    const reach = SNAP_PX / Math.min(page.width, page.height);
    trackPointer(event, () => onMoveStart?.(), (dxPx, dyPx) => {
      const dx = dxPx / page.width;
      const dy = dyPx / page.height;
      if (mode === 'move') {
        const moved = { ...field, x: clamp(field.x + dx, 0, 1 - field.w), y: clamp(field.y + dy, 0, 1 - field.h) };
        const snap = snapMove(moved, others, PAGE_LINES, reach);
        setGuides(snap.guides);
        onFieldChange?.({ ...moved, x: clamp(snap.x, 0, 1 - field.w), y: clamp(snap.y, 0, 1 - field.h) });
      } else {
        const sized = { ...field, w: clamp(field.w + dx, 0.02, 1 - field.x), h: clamp(field.h + dy, 0.012, 1 - field.y) };
        const snap = snapResize(sized, others, PAGE_LINES, reach);
        setGuides(snap.guides);
        onFieldChange?.({ ...sized, w: clamp(snap.w, 0.02, 1 - field.x), h: clamp(snap.h, 0.012, 1 - field.y) });
      }
    }, () => setGuides([]));
  };

  const nudge = (field: PlacedSigningField) => (dx: number, dy: number, big: boolean) => {
    const step = big ? 0.02 : 0.004;
    onMoveStart?.();
    onFieldChange?.({ ...field, x: clamp(field.x + dx * step, 0, 1 - field.w), y: clamp(field.y + dy * step, 0, 1 - field.h) });
  };

  return (
    <div className="sd-page-wrap">
      {!readOnly && pdf.pages.length > 1 ? <div className="sd-page-label sd-sb">{t('common.page')} {pageNumber} {t('common.of')} {pdf.pages.length}</div> : null}
      <div
        ref={wrapRef}
        className={`sd-pdf-page${over ? ' sd-over' : ''}`}
        style={{ aspectRatio: `${size.width} / ${size.height}` }}
        onPointerDown={() => onSelect?.(null)}
        onDragOver={(e) => {
          if (readOnly || !e.dataTransfer.types.includes(FIELD_DRAG_TYPE)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          const kind = e.dataTransfer.getData(FIELD_DRAG_TYPE) as SigningFieldKind;
          if (readOnly || !kind || !FIELD_META[kind]) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          onDropField?.(kind, pageNumber, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
        }}
      >
        <canvas ref={canvasRef} aria-label={t('viewer.pageNumber', { pageNumber })} />
        {showGrid && !readOnly ? <PageGrid margins={MARGIN} cell={GRID_CELL} unit="%" /> : null}
        <GuideLines guides={guides} unit="%" />
        {fields.map((field) => (
          <FieldBox
            key={field.id}
            kind={field.kind}
            label={field.label}
            box={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.w * 100}%`, height: `${field.h * 100}%` }}
            selected={field.id === selectedId}
            readOnly={readOnly}
            onMovePointer={moveOrResize(field, 'move')}
            onResizePointer={moveOrResize(field, 'resize')}
            onNudge={nudge(field)}
            onRemove={() => onRemove?.(field.id)}
            onSelect={() => onSelect?.(field.id)}
            onDeselect={() => onSelect?.(null)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the placer

export function FieldPlacer({
  pdf,
  fields,
  onFieldsChange,
  onReplaceFile,
}: {
  pdf: LoadedPdf;
  fields: PlacedSigningField[];
  onFieldsChange: (next: PlacedSigningField[]) => void;
  onReplaceFile: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGrid, toggleGrid] = useGuidesToggle();
  const history = useRef<PlacedSigningField[][]>([]);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const registerPage = useCallback((page: number, el: HTMLDivElement | null) => {
    if (el) pageEls.current.set(page, el);
    else pageEls.current.delete(page);
  }, []);

  const remember = useCallback(() => {
    history.current.push(fieldsRef.current);
    if (history.current.length > 60) history.current.shift();
  }, []);

  const commit = (next: PlacedSigningField[]) => {
    remember();
    onFieldsChange(next);
  };

  const add = (kind: SigningFieldKind, page: number, cx?: number, cy?: number) => {
    const size = defaultSize(kind, pdf.pages[page - 1]);
    // Clicked fields stack down the middle of the page instead of piling up on one spot.
    const slot = fields.filter((f) => f.page === page).length % 8;
    const x = cx === undefined ? 0.5 - size.w / 2 : cx - size.w / 2;
    const y = cy === undefined ? 0.3 + slot * 0.075 : cy - size.h / 2;
    const field: PlacedSigningField = { id: newFieldId(), kind, page, ...size, x: clamp(x, 0, 1 - size.w), y: clamp(y, 0, 1 - size.h) };
    commit([...fields, field]);
    setSelectedId(field.id);
  };

  /** The page that fills most of the viewport right now, where a clicked field lands. */
  const pageInView = () => {
    let best = 1;
    let bestArea = -1;
    pageEls.current.forEach((el, page) => {
      const rect = el.getBoundingClientRect();
      const visible = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      if (visible > bestArea) {
        bestArea = visible;
        best = page;
      }
    });
    return best;
  };

  const addToVisiblePage = (kind: SigningFieldKind) => {
    const page = pageInView();
    add(kind, page);
    pageEls.current.get(page)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const change = (field: PlacedSigningField) => onFieldsChange(fieldsRef.current.map((f) => (f.id === field.id ? field : f)));
  const remove = (id: string) => {
    commit(fields.filter((f) => f.id !== id));
    setSelectedId(null);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (!typing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        const previous = history.current.pop();
        if (previous) {
          event.preventDefault();
          onFieldsChange(previous);
          setSelectedId(null);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onFieldsChange]);

  const selected = fields.find((f) => f.id === selectedId) ?? null;
  const dragStart = (kind: SigningFieldKind) => (event: React.DragEvent) => {
    event.dataTransfer.setData(FIELD_DRAG_TYPE, kind);
    event.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="sd-work">
      <style>{GUIDES_CSS}</style>
      <aside className="sd-panel" aria-label={t('field.fields')}>
        <h3 className="sd-b">{t('field.whereDriverFills')}</h3>
        <p className="sd-panel-sub">{t('field.placerHelp')}</p>

        <div className="sd-group-label sd-sb">{t('editor.driverFills')}</div>
        <div className="sd-palette">
          {DRIVER_FIELDS.map((kind) => (
            <FieldTool key={kind} kind={kind} draggable onDragStart={dragStart(kind)} onPress={() => addToVisiblePage(kind)} />
          ))}
        </div>

        <div className="sd-group-label sd-sb">{t('editor.autoFromDriverFile')}</div>
        <div className="sd-palette">
          {AUTO_FIELDS.map((kind) => (
            <FieldTool key={kind} kind={kind} draggable onDragStart={dragStart(kind)} onPress={() => addToVisiblePage(kind)} />
          ))}
        </div>

        {selected ? (
          <FieldInspector
            key={selected.id}
            kind={selected.kind}
            label={selected.label}
            onEditStart={remember}
            onLabelChange={(label) => change({ ...selected, label })}
            onRemove={() => remove(selected.id)}
          />
        ) : null}

        <GuidesToggle on={showGrid} onToggle={toggleGrid} />

        <button type="button" className="sd-btn sd-btn-link" style={{ marginTop: 18 }} onClick={onReplaceFile}>
          <Ionicons name="swap-horizontal" size={18} color="currentColor" />
          {t('field.replaceFile')}
        </button>
      </aside>

      <div className="sd-canvas">
        {fields.length === 0 ? (
          <div className="sd-tip sd-stage">
            <Ionicons name="hand-left" size={22} color="#2449E0" />
            <span>{t('field.startWith')}<b className="sd-b">{t('field.signature')}</b>{t('field.startWithSuffix')}</span>
          </div>
        ) : null}
        {pdf.pages.map((_, i) => (
          <PdfPageView
            key={i}
            pdf={pdf}
            pageNumber={i + 1}
            fields={fields.filter((f) => f.page === i + 1)}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMoveStart={remember}
            onFieldChange={change}
            onRemove={remove}
            onDropField={(kind, page, x, y) => add(kind, page, x, y)}
            registerPage={registerPage}
            showGrid={showGrid}
          />
        ))}
      </div>
    </div>
  );
}
