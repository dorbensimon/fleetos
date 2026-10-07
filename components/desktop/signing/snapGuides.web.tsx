import React, { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { Guide } from './snapMath';
import { t } from '../../../lib/i18n';

/**
 * Canva-style smart guides for the document builders: while a field is
 * dragged or resized, its edges and middle snap to the page's middle and
 * margins and to the other fields' edges and middles, and a pink line shows
 * what it lined up with. Units are whatever the page uses (pixels on the
 * editor page, fractions on an uploaded PDF); `threshold` is in those units.
 */

export { snapMove, snapResize, type Guide, type PageLines, type SnapRect } from './snapMath';

/**
 * The guide lines over a page. `unit` turns page units into CSS: 'px' for
 * the editor page, '%' (fractions × 100) for an uploaded PDF page.
 */
export function GuideLines({ guides, unit }: { guides: Guide[]; unit: 'px' | '%' }) {
  const css = (value: number) => (unit === '%' ? `${value * 100}%` : `${value}px`);
  return (
    <>
      {guides.map((g, i) => (
        <div
          key={`${g.axis}${i}`}
          className={`sd-guide sd-guide-${g.axis}`}
          aria-hidden="true"
          style={
            g.axis === 'v'
              ? { left: css(g.at), top: css(g.from), height: `calc(${css(g.to)} - ${css(g.from)})` }
              : { top: css(g.at), left: css(g.from), width: `calc(${css(g.to)} - ${css(g.from)})` }
          }
        />
      ))}
    </>
  );
}

/**
 * The page's "קווי עזר" when switched on: the margins as a dashed frame, the
 * middle as a dashed cross, and a light one-centimetre grid.
 */
export function PageGrid({ margins, cell, unit, middleH = true }: { margins: { x: number; y: number }; cell: { x: number; y: number }; unit: 'px' | '%'; /** Off on the editor, whose sheet runs over several pages. */ middleH?: boolean }) {
  const css = (value: number) => (unit === '%' ? `${value * 100}%` : `${value}px`);
  return (
    <div className="sd-grid" aria-hidden="true" style={{ backgroundSize: `${css(cell.x)} ${css(cell.y)}` }}>
      <div className="sd-grid-margin" style={{ left: css(margins.x), right: css(margins.x), top: css(margins.y), bottom: css(margins.y) }} />
      <div className="sd-grid-mid sd-grid-mid-v" />
      {middleH ? <div className="sd-grid-mid sd-grid-mid-h" /> : null}
    </div>
  );
}

const GRID_KEY = 'sd-show-guides';

/** Whether "קווי עזר" is on, remembered in this browser for next time. */
export function useGuidesToggle(): [boolean, () => void] {
  const [on, setOn] = useState(() => {
    try {
      return window.localStorage.getItem(GRID_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setOn((prev) => {
      try {
        window.localStorage.setItem(GRID_KEY, prev ? '0' : '1');
      } catch {
        // Only a convenience; the switch still works for this visit.
      }
      return !prev;
    });
  }, []);
  return [on, toggle];
}

/** The "קווי עזר" switch in a builder's side panel. */
export function GuidesToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="sd-guides-toggle sd-sb" aria-pressed={on} onClick={onToggle} style={{ marginTop: 18 }}>
      <Ionicons name="grid-outline" size={18} color="currentColor" />
      {on ? t('field.hideGuides') : t('field.showGuides')}
    </button>
  );
}

export const GUIDES_CSS = `
.sd-guide { position: absolute; z-index: 6; pointer-events: none; background: #E8318A; }
.sd-guide-v { width: 1px; margin-left: -0.5px; }
.sd-guide-h { height: 1px; margin-top: -0.5px; }
.sd-grid { position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background-image: linear-gradient(to right, rgba(47,91,255,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(47,91,255,0.07) 1px, transparent 1px); }
.sd-grid-margin { position: absolute; border: 1px dashed rgba(232,49,138,0.45); }
.sd-grid-mid { position: absolute; background: none; }
.sd-grid-mid-v { top: 0; bottom: 0; left: 50%; border-left: 1px dashed rgba(232,49,138,0.35); }
.sd-grid-mid-h { left: 0; right: 0; top: 50%; border-top: 1px dashed rgba(232,49,138,0.35); }
.sd-guides-toggle { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 14px; border-radius: 12px; font-size: 14.5px; color: var(--sd-ink-2); background: #fff; box-shadow: var(--sd-depth-1); transition: background-color 150ms ease, color 150ms ease; }
.sd-guides-toggle[aria-pressed="true"] { color: #fff; background: #E8318A; }
@media (hover: hover) and (pointer: fine) { .sd-guides-toggle:hover:not([aria-pressed="true"]) { background: var(--sd-bg); } }
`;
