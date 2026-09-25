import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Platform,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';

/**
 * The icar loader — the logo symbol itself, in motion.
 *
 * One continuous cycle: the mark starts as the logo, the ring winds up into a
 * turn and a half, the mint dot hops, and the still-spinning ring spirals into
 * the dot, disappearing behind it exactly as it lands. The dot swells as it
 * swallows the ring, then the ring unwinds back out of it and settles into
 * the logo again. Geometry is the exact mark
 * (deliverables/branding/icar-logo-v2/loader.py): ring artwork centred in a
 * 100-unit frame, dot at (73.73, 30.05) r 10.5.
 *
 * The whole motion is one function of time (`frame`), sampled once and
 * played by the platform's own animator: CSS keyframes on web (they run off
 * the main thread, so the loader stays smooth while the page it is waiting
 * for is busy loading), the native driver on iOS/Android.
 *
 * Drop-in for ActivityIndicator: `size` ('small' | 'large' | px), `color`.
 * A light `color` (white spinner on a filled button) draws the mark in that
 * one colour; anything else keeps the brand gradient and mint dot.
 */

const RING = require('../../images/icar-loader-ring.png');
const MINT = '#2EE6A8';

const DOT_X = 0.7373;
const DOT_Y = 0.3005;
const DOT_R = 0.105;

const CYCLE_MS = 1800;
const SAMPLES = 90;

const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** Progress of `u` through [a, b], eased, clamped to 0..1. */
const seg = (u: number, a: number, b: number, ease: (x: number) => number) =>
  u <= a ? 0 : u >= b ? 1 : ease((u - a) / (b - a));

// Timeline, as fractions of the cycle.
const SPIN_END = 0.62; //    0 → 540° (winds up, still turning as it's swallowed)
const FOLD = [0.4, 0.62]; // ring spirals into the dot
const HOP = [0.36, 0.49, 0.62]; // dot takes off, peaks, lands with the ring
const SWELL = [0.6, 0.68, 0.8]; // dot swallows the ring
const UNFOLD = [0.8, 1]; // ring unwinds out of the dot: 540 → 720° (= logo)
const HOP_HEIGHT = 0.22; // of the loader's size
const FOLDED_SCALE = 0.15; // small enough to sit fully behind the dot

type Frame = { tx: number; ty: number; s: number; rot: number; hop: number; dotS: number };

/** The whole loader at cycle position u (0..1). Distances are fractions of size. */
function frame(u: number): Frame {
  const hop =
    u < HOP[1]
      ? -HOP_HEIGHT * seg(u, HOP[0], HOP[1], EASE_OUT)
      : -HOP_HEIGHT * (1 - seg(u, HOP[1], HOP[2], EASE_IN_OUT));
  const fold = u < UNFOLD[0] ? seg(u, FOLD[0], FOLD[1], EASE_IN_OUT) : 1 - seg(u, UNFOLD[0], UNFOLD[1], EASE_OUT);
  const rot = u < UNFOLD[0] ? 540 * seg(u, 0, SPIN_END, EASE_IN_OUT) : 540 + 180 * seg(u, UNFOLD[0], UNFOLD[1], EASE_OUT);
  const dotS =
    u < SWELL[1]
      ? 1 + 0.3 * seg(u, SWELL[0], SWELL[1], EASE_OUT)
      : 1.3 - 0.3 * seg(u, SWELL[1], SWELL[2], EASE_IN_OUT);
  return {
    // The ring is drawn into the dot wherever the dot is — including mid-hop.
    tx: fold * (DOT_X - 0.5),
    ty: fold * (DOT_Y - 0.5 + hop),
    s: 1 - (1 - FOLDED_SCALE) * fold,
    rot,
    hop,
    dotS,
  };
}

const TIMELINE = Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES);
const FRAMES = TIMELINE.map(frame);
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

// ── Web: CSS keyframes ────────────────────────────────────────────────────
// Translations are percentages of the element's own box, so one set of
// keyframes serves every loader size.

/** The loader's stylesheet. public/index.html embeds the same text for the
 *  pre-JS splash (kept equal by __tests__/brandLoaderSplash.test.ts). */
export function loaderCss(): string {
  const pct = (i: number) => `${r4((i / SAMPLES) * 100)}%`;
  const ring = FRAMES.map(
    (f, i) =>
      `${pct(i)}{transform:translate(${r4(f.tx * 100)}%,${r4(f.ty * 100)}%) scale(${r4(f.s)}) rotate(${r4(f.rot)}deg)}`,
  ).join('');
  const dot = FRAMES.map(
    (f, i) => `${pct(i)}{transform:translateY(${r4((f.hop / (2 * DOT_R)) * 100)}%) scale(${r4(f.dotS)})}`,
  ).join('');
  return (
    `@keyframes icar-loader-ring{${ring}}@keyframes icar-loader-dot{${dot}}` +
    `@keyframes icar-loader-soft{0%,100%{opacity:1}50%{opacity:.45}}` +
    `[data-icar-loader="ring"]{animation:icar-loader-ring ${CYCLE_MS}ms linear infinite;will-change:transform}` +
    `[data-icar-loader="dot"]{animation:icar-loader-dot ${CYCLE_MS}ms linear infinite;will-change:transform}` +
    `@media (prefers-reduced-motion:reduce){[data-icar-loader="ring"]{animation:none}` +
    `[data-icar-loader="dot"]{animation:icar-loader-soft 1400ms ease-in-out infinite}}`
  );
}

/** Static markup of a loader, for the pre-JS splash in public/index.html. */
export function loaderSplashHtml(px: number, ringSrc: string): string {
  const r = DOT_R * px;
  const n = (v: number) => r4(v);
  return (
    `<div role="progressbar" aria-label="טוען" style="position:relative;width:${px}px;height:${px}px">` +
    `<div data-icar-loader="ring" style="position:absolute;left:0;top:0;width:${px}px;height:${px}px">` +
    `<img src="${ringSrc}" width="${px}" height="${px}" alt="" style="display:block"></div>` +
    `<div data-icar-loader="dot" style="position:absolute;left:${n(DOT_X * px - r)}px;top:${n(DOT_Y * px - r)}px;` +
    `width:${n(2 * r)}px;height:${n(2 * r)}px;border-radius:50%;background:${MINT}"></div></div>`
  );
}

function injectCss() {
  if (typeof document === 'undefined' || document.querySelector('style[data-icar-loader-css]')) return;
  const el = document.createElement('style');
  el.setAttribute('data-icar-loader-css', '');
  el.textContent = loaderCss();
  document.head.appendChild(el);
}

/** Every web loader runs on one clock that starts with the page, so loaders
 *  on screen move together and the pre-JS splash hands over to the app's
 *  boot screen mid-motion without a jump. */
const webPhaseDelay = () =>
  typeof performance === 'undefined' ? '0ms' : `${-Math.round(performance.now() % CYCLE_MS)}ms`;

// ── Native: the same samples through the native driver ────────────────────
function useReduceMotion(enabled: boolean) {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => alive && setReduce(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, [enabled]);
  return reduce;
}

function track(t: Animated.Value, pick: (f: Frame) => number, scale = 1) {
  return t.interpolate({ inputRange: TIMELINE, outputRange: FRAMES.map((f) => pick(f) * scale) });
}

// ──────────────────────────────────────────────────────────────────────────

type Props = {
  size?: 'small' | 'large' | number;
  color?: string;
  animating?: boolean;
  hidesWhenStopped?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
};

function isLight(color?: string): boolean {
  if (!color) return false;
  const c = color.trim().toLowerCase();
  if (c === 'white') return true;
  let r: number, g: number, b: number;
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/);
  const rgb = c.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((x) => x + x).join('') : hex[1];
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else if (rgb) {
    [r, g, b] = [+rgb[1], +rgb[2], +rgb[3]];
  } else {
    return false;
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.75;
}

const IS_WEB = Platform.OS === 'web';

export function BrandLoader({
  size = 'small',
  color,
  animating = true,
  hidesWhenStopped = true,
  style,
  accessibilityLabel = 'טוען',
  testID,
}: Props) {
  const px = typeof size === 'number' ? size : size === 'large' ? 36 : 20;
  const mono = isLight(color);
  const reduce = useReduceMotion(!IS_WEB);
  const t = useRef(new Animated.Value(0)).current;
  const phase = useRef(IS_WEB ? webPhaseDelay() : '0ms').current;

  if (IS_WEB) injectCss();

  useEffect(() => {
    if (IS_WEB || !animating) return;
    t.setValue(0);
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: reduce ? 1400 : CYCLE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [animating, reduce, t]);

  if (!animating && hidesWhenStopped) return null;

  const r = DOT_R * px;
  const ringBox = { position: 'absolute' as const, width: px, height: px };
  const dotBox = {
    position: 'absolute' as const,
    left: DOT_X * px - r,
    top: DOT_Y * px - r,
    width: r * 2,
    height: r * 2,
    borderRadius: r,
    backgroundColor: mono ? color : MINT,
  };
  const ringImage = (
    <Image source={RING} resizeMode="contain" style={[{ width: px, height: px }, mono && { tintColor: color }]} />
  );

  let ring: ReactNode;
  let dot: ReactNode;
  if (IS_WEB) {
    // react-native-web renders dataSet as data-* attributes for the CSS above.
    const web = (kind: string) => ({ dataSet: { icarLoader: animating ? kind : 'still' } }) as object;
    const sync = { animationDelay: phase } as ViewStyle;
    ring = <View {...web('ring')} style={[ringBox, sync]}>{ringImage}</View>;
    dot = <View {...web('dot')} style={[dotBox, sync]} />;
  } else if (reduce) {
    ring = <View style={ringBox}>{ringImage}</View>;
    dot = (
      <Animated.View
        style={[dotBox, { opacity: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.45, 1] }) }]}
      />
    );
  } else {
    ring = (
      <Animated.View
        style={[
          ringBox,
          {
            transform: [
              { translateX: track(t, (f) => f.tx, px) },
              { translateY: track(t, (f) => f.ty, px) },
              { scale: track(t, (f) => f.s) },
              {
                rotate: t.interpolate({ inputRange: TIMELINE, outputRange: FRAMES.map((f) => `${r4(f.rot)}deg`) }),
              },
            ],
          },
        ]}
      >
        {ringImage}
      </Animated.View>
    );
    dot = (
      <Animated.View
        style={[
          dotBox,
          { transform: [{ translateY: track(t, (f) => f.hop, px) }, { scale: track(t, (f) => f.dotS) }] },
        ]}
      />
    );
  }

  return (
    <View
      style={[{ width: px, height: px }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {ring}
      {dot}
    </View>
  );
}
