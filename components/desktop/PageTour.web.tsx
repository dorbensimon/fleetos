// הסבר מודרך על מסך: בועה שעוברת מאזור לאזור, עם הדגשה של מה שמסבירים
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DESKTOP_COLORS } from './desktopTheme';
import { prefersReducedMotion } from './primitives';
import { textDirection, t } from '../../lib/i18n';
import type { TourStep } from './tourTypes';

export type { TourStep };

type Box = { top: number; left: number; width: number; height: number };

const PAD = 8; // space around the highlighted area
const GAP = 14; // between the highlight and the bubble
const BUBBLE_W = 340;
const EDGE = 16;

// A screen left behind may stay mounted and hidden; take the copy that is actually visible
function visibleTarget(id: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[id="${id}"]`));
  return all.find((el) => el.getClientRects().length > 0) ?? null;
}

/**
 * A light walkthrough of one page. Each step dims the page, lights up the
 * element it talks about and slides the bubble next to it. Steps whose
 * element is not on the page right now are skipped.
 */
export function PageTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [found] = useState(() => steps.filter((s) => visibleTarget(s.target)));
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [bubbleH, setBubbleH] = useState(200);
  const bubble = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const reduced = prefersReducedMotion();
  const step = found[i];
  const last = i === found.length - 1;

  const measure = useCallback(() => {
    const r = visibleTarget(step?.target ?? '')?.getBoundingClientRect();
    if (r) setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    setView({ w: window.innerWidth, h: window.innerHeight });
  }, [step]);

  useEffect(() => {
    visibleTarget(step?.target ?? '')?.scrollIntoView({ block: 'center' });
    measure();
    const later = setTimeout(measure, 120);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(later); window.removeEventListener('resize', measure); };
  }, [step, measure]);

  useLayoutEffect(() => {
    if (bubble.current) setBubbleH(bubble.current.offsetHeight);
  }, [i]);

  useEffect(() => {
    next.current?.focus();
  }, [i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!step || !box) return null;

  const spot = { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 };
  const w = Math.min(BUBBLE_W, view.w - EDGE * 2);
  const left = Math.min(Math.max(spot.left + spot.width / 2 - w / 2, EDGE), view.w - w - EDGE);
  const roomBelow = view.h - (spot.top + spot.height) - GAP - EDGE;
  const roomAbove = spot.top - GAP - EDGE;
  const side: 'below' | 'above' | 'inside' = roomBelow >= bubbleH ? 'below' : roomAbove >= bubbleH ? 'above' : 'inside';
  const top = side === 'below' ? spot.top + spot.height + GAP : side === 'above' ? spot.top - GAP - bubbleH : view.h - bubbleH - EDGE;
  const arrowLeft = Math.min(Math.max(spot.left + spot.width / 2 - left, 22), w - 22);
  const rtl = textDirection() === 'rtl';

  return createPortal(
    <div className="tour" dir={rtl ? 'rtl' : 'ltr'} role="dialog" aria-modal="true" aria-label={step.title}>
      <style>{TOUR_CSS(reduced)}</style>
      <div className="tour-catch" />
      <div className="tour-spot" style={spot} />
      <div ref={bubble} className="tour-bubble" style={{ top, left, width: w }}>
        {side !== 'inside' && <i className={`tour-arrow ${side}`} style={{ left: arrowLeft - 7 }} />}
        <button type="button" className="tour-x" onClick={onClose} aria-label={t('common.close')}>×</button>
        <div className="tour-step">{t('common.tourStepOf', { n: i + 1, total: found.length })}</div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-foot">
          {i > 0 && <button type="button" className="tour-back" onClick={() => setI(i - 1)}>{t('common.tourBack')}</button>}
          <button ref={next} type="button" className="tour-next" onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? t('common.tourDone') : t('common.tourNext')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// עיצוב ההסבר
const TOUR_CSS = (reduced: boolean) => `
.tour { position: fixed; inset: 0; z-index: 10000; font-family: inherit; }
.tour-catch { position: absolute; inset: 0; }
.tour-spot { position: absolute; border-radius: 14px; pointer-events: none; box-shadow: 0 0 0 100vmax rgba(8,16,36,0.6), 0 0 0 2px rgba(255,255,255,0.85) inset;
  ${reduced ? '' : 'transition: top 340ms cubic-bezier(.2,.8,.2,1), left 340ms cubic-bezier(.2,.8,.2,1), width 340ms cubic-bezier(.2,.8,.2,1), height 340ms cubic-bezier(.2,.8,.2,1);'} }
.tour-bubble { position: absolute; box-sizing: border-box; background: #fff; color: ${DESKTOP_COLORS.ink}; border-radius: 16px; padding: 18px 20px 16px;
  box-shadow: 0 12px 40px rgba(8,16,36,0.35); ${reduced ? '' : 'transition: top 340ms cubic-bezier(.2,.8,.2,1), left 340ms cubic-bezier(.2,.8,.2,1);'} }
.tour-bubble h3 { margin: 4px 0 6px; font-size: 17px; line-height: 1.3; }
.tour-bubble p { margin: 0; font-size: 14.5px; line-height: 1.55; color: ${DESKTOP_COLORS.inkMuted}; }
.tour-step { font-size: 12px; color: ${DESKTOP_COLORS.inkFaint}; }
.tour-x { position: absolute; top: 8px; inset-inline-end: 10px; width: 28px; height: 28px; border: 0; border-radius: 8px; background: transparent; font-size: 22px; line-height: 1; color: ${DESKTOP_COLORS.inkFaint}; cursor: pointer; }
.tour-x:hover { background: rgba(92,103,115,0.1); }
.tour-foot { display: flex; gap: 8px; margin-top: 14px; justify-content: flex-start; }
.tour-foot button { height: 36px; padding: 0 16px; border-radius: 10px; border: 0; font: inherit; font-weight: 600; font-size: 14px; cursor: pointer; }
.tour-next { background: ${DESKTOP_COLORS.brand}; color: #fff; }
.tour-next:hover { filter: brightness(1.08); }
.tour-back { background: rgba(92,103,115,0.1); color: ${DESKTOP_COLORS.ink}; }
.tour-arrow { position: absolute; width: 14px; height: 14px; background: #fff; transform: rotate(45deg); ${reduced ? '' : 'transition: left 340ms cubic-bezier(.2,.8,.2,1);'} }
.tour-arrow.below { top: -7px; }
.tour-arrow.above { bottom: -7px; }
`;
