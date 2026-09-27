/**
 * The snapping math behind the builders' smart guides (snapGuides.web.tsx),
 * kept free of React so it can be tested on its own.
 */

export type SnapRect = { x: number; y: number; w: number; h: number };
/** A line to draw: vertical ('v') at x = `at`, from y `from` to `to`; or horizontal ('h'). */
export type Guide = { axis: 'v' | 'h'; at: number; from: number; to: number };
/** Lines of the page itself: its middle and its margins. */
export type PageLines = { v: number[]; h: number[]; width: number; height: number };

type Candidate = { at: number; from: number; to: number };

function candidatesFor(axis: 'v' | 'h', page: PageLines, others: SnapRect[]): Candidate[] {
  const list: Candidate[] = (axis === 'v' ? page.v : page.h).map((at) => ({ at, from: 0, to: axis === 'v' ? page.height : page.width }));
  for (const o of others) {
    const [start, size, crossStart, crossSize] = axis === 'v' ? [o.x, o.w, o.y, o.h] : [o.y, o.h, o.x, o.w];
    for (const at of [start, start + size / 2, start + size]) list.push({ at, from: crossStart, to: crossStart + crossSize });
  }
  return list;
}

/** The closest line within `threshold` of any of `anchors`, and how far to shift to meet it. */
function nearest(anchors: number[], candidates: Candidate[], threshold: number) {
  let best: { shift: number; candidate: Candidate } | null = null;
  for (const anchor of anchors) {
    for (const candidate of candidates) {
      const shift = candidate.at - anchor;
      if (Math.abs(shift) <= threshold && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, candidate };
    }
  }
  return best;
}

function guideFor(axis: 'v' | 'h', rect: SnapRect, candidate: Candidate): Guide {
  const [start, size] = axis === 'v' ? [rect.y, rect.h] : [rect.x, rect.w];
  return { axis, at: candidate.at, from: Math.min(start, candidate.from), to: Math.max(start + size, candidate.to) };
}

/** Moving: the left, middle and right (top, middle, bottom) of the field may snap. */
export function snapMove(rect: SnapRect, others: SnapRect[], page: PageLines, threshold: number): { x: number; y: number; guides: Guide[] } {
  const guides: Guide[] = [];
  let { x, y } = rect;
  const v = nearest([rect.x, rect.x + rect.w / 2, rect.x + rect.w], candidatesFor('v', page, others), threshold);
  if (v) x += v.shift;
  const h = nearest([rect.y, rect.y + rect.h / 2, rect.y + rect.h], candidatesFor('h', page, others), threshold);
  if (h) y += h.shift;
  const snapped = { ...rect, x, y };
  if (v) guides.push(guideFor('v', snapped, v.candidate));
  if (h) guides.push(guideFor('h', snapped, h.candidate));
  return { x, y, guides };
}

/** Resizing from the corner: the right and bottom edges may snap. */
export function snapResize(rect: SnapRect, others: SnapRect[], page: PageLines, threshold: number): { w: number; h: number; guides: Guide[] } {
  const guides: Guide[] = [];
  let { w, h } = rect;
  const v = nearest([rect.x + rect.w], candidatesFor('v', page, others), threshold);
  if (v) w += v.shift;
  const hz = nearest([rect.y + rect.h], candidatesFor('h', page, others), threshold);
  if (hz) h += hz.shift;
  const snapped = { ...rect, w, h };
  if (v) guides.push(guideFor('v', snapped, v.candidate));
  if (hz) guides.push(guideFor('h', snapped, hz.candidate));
  return { w, h, guides };
}
