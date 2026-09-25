import { Platform } from 'react-native';

/**
 * Keeps the browser's `theme-color` equal to whatever colour is actually
 * painted at the top of the current screen (web only).
 *
 * On an iPhone home-screen web app (`apple-mobile-web-app-status-bar-style`
 * "default"), iOS paints the status bar — clock, battery — with the page's
 * theme-color and picks dark or light symbols to contrast with it. Safari
 * and Android Chrome tint their own bars with it too. Screens differ (dark
 * login, blue gradient heroes, light lists), so the colour is read from the
 * rendered page after every navigation instead of being hard-coded per route.
 *
 * Safari 26 on iPhone no longer reads theme-color in the browser: it tints
 * the status-bar and toolbar areas with the page's own background. So the
 * same colour is also painted on <html> and <body>, which only show there.
 */

const FALLBACK = '#eef2f7';

type Rgba = { r: number; g: number; b: number; a: number };

function parseColor(value: string): Rgba | null {
  const m = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/);
  if (!m) return null;
  let a = m[4] === undefined ? 1 : parseFloat(m[4]);
  if (m[4]?.endsWith('%')) a /= 100;
  return { r: +m[1], g: +m[2], b: +m[3], a };
}

const toHex = ({ r, g, b }: Rgba) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** An opaque colour an element paints itself, or null. */
function paintedColor(el: Element): string | null {
  const style = getComputedStyle(el);
  // Gradient heroes (expo-linear-gradient renders a CSS gradient): the
  // first colour stop is the one at the top edge.
  if (style.backgroundImage && style.backgroundImage !== 'none') {
    const first = parseColor(style.backgroundImage);
    if (first && first.a >= 0.9) return toHex(first);
  }
  const bg = parseColor(style.backgroundColor);
  return bg && bg.a >= 0.9 ? toHex(bg) : null;
}

/**
 * First opaque colour painted at (x, 1), topmost layer first.
 *
 * Decorative layers — hero gradients, glows — are `pointerEvents="none"`,
 * and hit-testing skips those, so a plain elementFromPoint walk misses the
 * very gradient that is on screen and lands on the pale page behind it.
 * Hit-testing is switched on for everything just for this one lookup.
 */
function colorAtTop(x: number): string | null {
  const probe = document.createElement('style');
  probe.textContent = '*{pointer-events:auto!important}';
  document.head.appendChild(probe);
  let stack: Element[];
  try {
    stack = document.elementsFromPoint(x, 1);
  } finally {
    probe.remove();
  }
  for (const el of stack) {
    if (el === document.documentElement || el === document.body) break;
    const color = paintedColor(el);
    if (color) return color;
  }
  const body = parseColor(getComputedStyle(document.body).backgroundColor);
  return body && body.a >= 0.9 ? toHex(body) : null;
}

function apply() {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  // Sample the middle of the top edge (edges may hold rounded corners/buttons).
  const color = colorAtTop(Math.round(window.innerWidth / 2)) ?? FALLBACK;
  if (meta.content.toLowerCase() !== color) meta.content = color;
  document.documentElement.style.backgroundColor = color;
  document.body.style.backgroundColor = color;
}

/**
 * Re-sample after the new screen has painted, and once more after
 * transitions/data have settled.
 */
export function syncWebThemeColor() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  requestAnimationFrame(apply);
  setTimeout(apply, 450);
}
