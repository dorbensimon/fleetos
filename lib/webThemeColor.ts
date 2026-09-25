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
    if (el.id === STRIP_ID) continue;
    if (el === document.documentElement || el === document.body) break;
    const color = paintedColor(el);
    if (color) return color;
  }
  const body = parseColor(getComputedStyle(document.body).backgroundColor);
  return body && body.a >= 0.9 ? toHex(body) : null;
}

// ── Home Screen app status strip ──────────────────────────────────────────
// Opened from the iPhone Home Screen the app runs under a transparent status
// bar with white symbols (public/index.html). On screens whose top is light,
// those symbols would vanish, so a brand-blue strip sits behind them there.
const STRIP_ID = 'icar-status-strip';
const STRIP_COLOR = '#2f5bff';

const isStandalone = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  window.matchMedia?.('(display-mode: standalone)').matches === true;

function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6;
}

function syncStatusStrip(topColor: string) {
  if (!isStandalone()) return;
  let strip = document.getElementById(STRIP_ID);
  if (!strip) {
    strip = document.createElement('div');
    strip.id = STRIP_ID;
    strip.setAttribute('aria-hidden', 'true');
    strip.style.cssText =
      'position:fixed;top:0;left:0;right:0;height:env(safe-area-inset-top);' +
      'pointer-events:none;z-index:2147483647;transition:background-color 200ms ease';
    document.body.appendChild(strip);
  }
  strip.style.backgroundColor = isLight(topColor) ? STRIP_COLOR : 'transparent';
}

function apply() {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  // Sample the middle of the top edge (edges may hold rounded corners/buttons).
  const color = colorAtTop(Math.round(window.innerWidth / 2)) ?? FALLBACK;
  if (meta.content.toLowerCase() !== color) meta.content = color;
  document.documentElement.style.backgroundColor = color;
  document.body.style.backgroundColor = color;
  syncStatusStrip(color);
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
