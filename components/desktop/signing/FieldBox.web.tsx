import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { SigningFieldKind } from '../../../lib/companySigningTemplates';
import { FIELD_META } from './fieldMeta';

/**
 * One field on a page (an uploaded PDF or an editor page): drag it to move,
 * pull the corner to resize, arrows nudge it, Delete removes it. The caller
 * owns the geometry; this only reports pointer deltas in screen pixels.
 */

export const FIELD_DRAG_TYPE = 'application/x-fleetos-field';

type Box = { left: string; top: string; width: string; height: string };

/** Follows one pointer until release, reporting the distance moved (after a 3px dead zone). */
export function trackPointer(event: React.PointerEvent, onStart: () => void, onDelta: (dx: number, dy: number) => void, onEnd?: () => void) {
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);
  // If the page scrolls mid-drag (mouse wheel), the field keeps following the pointer.
  const scroller = target.closest<HTMLElement>('.sd-sheet-body');
  const startScroll = scroller?.scrollTop ?? 0;
  const startX = event.clientX;
  const startY = event.clientY;
  let lastX = startX;
  let lastY = startY;
  let moved = false;
  const report = () => onDelta(lastX - startX, lastY - startY + (scroller?.scrollTop ?? 0) - startScroll);
  const onMove = (e: PointerEvent) => {
    lastX = e.clientX;
    lastY = e.clientY;
    if (!moved && Math.abs(lastX - startX) + Math.abs(lastY - startY) < 3) return;
    if (!moved) onStart();
    moved = true;
    report();
  };
  const onScroll = () => {
    if (moved) report();
  };
  scroller?.addEventListener('scroll', onScroll);
  const onUp = () => {
    scroller?.removeEventListener('scroll', onScroll);
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', onUp);
    target.removeEventListener('pointercancel', onUp);
    if (moved) onEnd?.();
  };
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onUp);
  target.addEventListener('pointercancel', onUp);
}

export function FieldBox({
  kind,
  label,
  box,
  selected,
  readOnly,
  sizeLabel,
  covers,
  onMovePointer,
  onResizePointer,
  onNudge,
  onRemove,
  onSelect,
  onDeselect,
}: {
  kind: SigningFieldKind;
  label?: string;
  box: Box;
  selected?: boolean;
  readOnly?: boolean;
  /** The field's real size on paper, shown while it is selected. */
  sizeLabel?: string;
  /** The field lies on written words and would hide them. */
  covers?: boolean;
  onMovePointer?: (event: React.PointerEvent) => void;
  onResizePointer?: (event: React.PointerEvent) => void;
  /** Arrow keys: direction and whether Shift asks for a big step. */
  onNudge?: (dx: -1 | 0 | 1, dy: -1 | 0 | 1, big: boolean) => void;
  onRemove?: () => void;
  onSelect?: () => void;
  onDeselect?: () => void;
}) {
  const meta = FIELD_META[kind];
  const start = (handler?: (event: React.PointerEvent) => void) => (event: React.PointerEvent) => {
    if (readOnly || event.button !== 0 || !handler) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect?.();
    handler(event);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (readOnly) return;
    const moves: Record<string, [-1 | 0 | 1, -1 | 0 | 1]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[event.key]) {
      event.preventDefault();
      onNudge?.(moves[event.key][0], moves[event.key][1], event.shiftKey);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onRemove?.();
    } else if (event.key === 'Escape') {
      onDeselect?.();
    }
  };

  return (
    <div
      className={`sd-field${selected ? ' sd-sel' : ''}${kind === 'signature' ? ' sd-field-sign' : ''}${covers && !readOnly ? ' sd-covers' : ''}`}
      style={{ ['--c' as string]: meta.color, ...box, cursor: readOnly ? 'default' : undefined }}
      tabIndex={readOnly ? -1 : 0}
      role={readOnly ? undefined : 'button'}
      aria-label={`${label || meta.label}. אפשר לגרור עם העכבר, להזיז עם החצים ולמחוק עם Delete`}
      onPointerDown={start(onMovePointer)}
      onKeyDown={onKeyDown}
      onFocus={onSelect}
    >
      {kind === 'signature' ? (
        <span className="sd-sign-hint">
          <Ionicons name={meta.icon} size={15} color="currentColor" />
          <span>הנהג יחתום בתוך המסגרת</span>
        </span>
      ) : kind !== 'checkbox' ? (
        <>
          <Ionicons name={meta.icon} size={14} color="currentColor" />
          <span>{label || meta.label}</span>
        </>
      ) : (
        <Ionicons name="checkmark" size={13} color="currentColor" />
      )}
      {selected && !readOnly ? (
        <>
          <span
            className="sd-field-del"
            role="button"
            aria-label="מחיקת השדה"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onRemove?.();
            }}
          >
            <Ionicons name="close" size={16} color="#FF453A" />
          </span>
          <span className="sd-field-grip" aria-hidden="true" onPointerDown={start(onResizePointer)} />
          {sizeLabel ? <span className="sd-field-size">{sizeLabel}</span> : null}
        </>
      ) : null}
    </div>
  );
}

/** The side panel card for the selected field: what it is, an optional caption, and delete. */
export function FieldInspector({
  kind,
  label,
  size,
  covers,
  onEditStart,
  onLabelChange,
  onRemove,
}: {
  kind: SigningFieldKind;
  label?: string;
  /** Real size on paper, e.g. "5.5 × 1.9 ס״מ". */
  size?: string;
  covers?: boolean;
  onEditStart: () => void;
  onLabelChange: (label: string) => void;
  onRemove: () => void;
}) {
  const meta = FIELD_META[kind];
  const cardRef = React.useRef<HTMLDivElement>(null);
  // Keep this card (and a new warning) in sight by scrolling the side panel only; moving the page would pull it out from under a field being dragged.
  React.useEffect(() => {
    const card = cardRef.current;
    const panel = card?.closest<HTMLElement>('.sd-panel');
    if (!card || !panel) return;
    const overflow = card.getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom;
    if (overflow > 0) panel.scrollBy({ top: overflow + 12, behavior: 'smooth' });
  }, [covers]);
  return (
    <div className="sd-inspector" ref={cardRef}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span className="sd-tool-icon" style={{ background: meta.color }}>
          <Ionicons name={meta.icon} size={18} color="#fff" />
        </span>
        <strong className="sd-sb" style={{ fontSize: 16 }}>{meta.label}</strong>
      </div>
      {kind === 'text' || kind === 'checkbox' ? (
        <>
          <label htmlFor="sd-field-label">{kind === 'checkbox' ? 'על מה הנהג מאשר? (לא חובה)' : 'מה הנהג צריך לכתוב? (לא חובה)'}</label>
          <input
            id="sd-field-label"
            className="sd-input"
            value={label ?? ''}
            maxLength={80}
            placeholder={kind === 'checkbox' ? 'לדוגמה: קראתי את הנוהל' : 'לדוגמה: מספר רכב'}
            onFocus={onEditStart}
            onChange={(e) => onLabelChange(e.target.value)}
          />
        </>
      ) : (
        <p className="sd-panel-sub" style={{ margin: 0 }}>
          {kind === 'signature'
            ? 'החתימה של הנהג תופיע בדיוק בתוך המסגרת הכחולה, באותו מקום ובאותו גודל. כדי להגדיל אותה, משכו את העיגול שבפינת המסגרת.'
            : meta.auto
              ? 'המידע יילקח מתיק הנהג, הנהג לא צריך למלא אותו.'
              : meta.hint}
        </p>
      )}
      {size ? (
        <div className="sd-insp-size">
          <Ionicons name="resize" size={16} color="currentColor" />
          גודל על הדף: <strong className="sd-sb">{size}</strong>
        </div>
      ) : null}
      {covers ? (
        <div className="sd-insp-warn" role="status">
          <Ionicons name="warning" size={18} color="currentColor" />
          <span>השדה מונח על טקסט ויסתיר אותו במסמך. גררו אותו למקום ריק או לשורה ריקה.</span>
        </div>
      ) : null}
      <button type="button" className="sd-btn sd-btn-plain sd-danger" style={{ width: '100%', marginTop: 12 }} onClick={onRemove}>
        <Ionicons name="trash" size={18} color="#FF453A" />
        מחיקת השדה
      </button>
    </div>
  );
}
