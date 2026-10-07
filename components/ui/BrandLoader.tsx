import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, Image, Platform, StyleProp, View, ViewStyle } from 'react-native';
import { t } from '../../lib/i18n';

/**
 * The icar loader: the logo stands still while a thin blue arc orbits it at
 * constant speed, a soft sheen sweeps across the mark and the mint dot
 * glows. Geometry is the exact mark (deliverables/branding/icar-logo-v2/
 * loader.py): ring artwork in a 100-unit frame, dot at (73.73, 30.05) r 10.5;
 * the mark's visual centre is (48, 47), which the arc circles.
 *
 * On web everything is CSS keyframes (off the main thread, so the loader
 * stays smooth while the page it waits for is busy); on iOS/Android the arc
 * and the dot run on the native driver.
 *
 * Drop-in for ActivityIndicator: `size` ('small' | 'large' | px), `color`.
 * A light `color` (white spinner on a filled button) draws the mark and arc
 * in that one colour; anything else keeps the brand gradient and mint dot.
 */

const RING = require('../../images/icar-loader-ring.png');
const MINT = '#2EE6A8';
const BLUE = '#2E6BFF';

const DOT_X = 0.7373;
const DOT_Y = 0.3005;
const DOT_R = 0.105;
const CX = 0.48; // the mark's visual centre
const CY = 0.47;
const ARC_R = 0.6; // arc radius, of size: clears the dot

const ARC_MS = 1100;
const SHEEN_MS = 1800;

// ── Web: CSS keyframes ────────────────────────────────────────────────────

/** The loader's stylesheet. public/index.html embeds the same text for the
 *  pre-JS splash (kept equal by __tests__/brandLoaderSplash.test.ts). */
export function loaderCss(): string {
  const ease = 'cubic-bezier(.45,0,.55,1)';
  return (
    `@keyframes icar-loader-spin{to{transform:rotate(360deg)}}` +
    `@keyframes icar-loader-sheen{from{-webkit-mask-position:130% 0;mask-position:130% 0}to{-webkit-mask-position:-30% 0;mask-position:-30% 0}}` +
    `@keyframes icar-loader-glow{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(46,230,168,0)}` +
    `50%{transform:scale(1.15);box-shadow:0 0 .9em .1em rgba(46,230,168,.5)}}` +
    `[data-icar-loader="arc"]{border-radius:50%;animation:icar-loader-spin ${ARC_MS}ms linear infinite;` +
    `background:conic-gradient(from 0deg,transparent 0 55%,currentColor 97%,transparent 97%);` +
    `-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - max(1.5px,.035em)),#000 calc(100% - max(1.5px,.035em) + .5px));` +
    `mask:radial-gradient(farthest-side,transparent calc(100% - max(1.5px,.035em)),#000 calc(100% - max(1.5px,.035em) + .5px))}` +
    // The sheen is a white copy of the ring seen through a moving gradient band.
    `[data-icar-loader="sheen"]{filter:brightness(0) invert(1);opacity:.75;` +
    `-webkit-mask:linear-gradient(105deg,transparent 38%,#000 50%,transparent 62%) 0 0/250% 100% no-repeat;` +
    `mask:linear-gradient(105deg,transparent 38%,#000 50%,transparent 62%) 0 0/250% 100% no-repeat;` +
    `animation:icar-loader-sheen ${SHEEN_MS}ms ${ease} infinite}` +
    `[data-icar-loader="dot"]{animation:icar-loader-glow ${SHEEN_MS}ms ${ease} infinite}` +
    `@media (prefers-reduced-motion:reduce){[data-icar-loader="arc"]{animation-duration:3s}` +
    `[data-icar-loader="sheen"]{animation:none;opacity:0}}`
  );
}

const arcBox = (px: number) => {
  const d = 2 * ARC_R * px;
  return {
    left: CX * px - d / 2,
    top: CY * px - d / 2,
    width: d,
    height: d,
    w: Math.max(1.5, px * 0.035),
  };
};

/** Static markup of a loader, for the pre-JS splash in public/index.html. */
export function loaderSplashHtml(px: number, ringSrc: string): string {
  const r = DOT_R * px;
  const a = arcBox(px);
  const n = (v: number) => Math.round(v * 1e4) / 1e4;
  return (
    `<div role="progressbar" aria-label="טוען" style="position:relative;width:${px}px;height:${px}px">` +
    `<div data-icar-loader="arc" style="position:absolute;left:${n(a.left)}px;top:${n(a.top)}px;width:${n(a.width)}px;` +
    `height:${n(a.height)}px;color:${BLUE};font-size:${px}px"></div>` +
    `<img src="${ringSrc}" width="${px}" height="${px}" alt="" style="position:absolute;left:0;top:0;display:block">` +
    `<div data-icar-loader="sheen" style="position:absolute;left:0;top:0;width:${px}px;height:${px}px">` +
    `<img src="${ringSrc}" width="${px}" height="${px}" alt="" style="display:block"></div>` +
    `<div data-icar-loader="dot" style="position:absolute;left:${n(DOT_X * px - r)}px;top:${n(DOT_Y * px - r)}px;` +
    `width:${n(2 * r)}px;height:${n(2 * r)}px;border-radius:50%;background:${MINT};font-size:${n(px / 6)}px"></div></div>`
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
const webPhaseDelay = (cycle: number) =>
  typeof performance === 'undefined' ? '0ms' : `${-Math.round(performance.now() % cycle)}ms`;

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
    const h =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map((x) => x + x)
            .join('')
        : hex[1];
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
  accessibilityLabel = t('common.loading'),
  testID,
}: Props) {
  const px = typeof size === 'number' ? size : size === 'large' ? 36 : 20;
  const mono = isLight(color);
  const spin = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const delays = useRef(IS_WEB ? [webPhaseDelay(ARC_MS), webPhaseDelay(SHEEN_MS)] : []).current;

  if (IS_WEB) injectCss();

  useEffect(() => {
    if (IS_WEB || !animating) return;
    // ponytail: native has the arc and the glow but no sheen (iCar ships as a website).
    const loops = [
      Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: ARC_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, {
            toValue: 1,
            duration: SHEEN_MS / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(glow, {
            toValue: 0,
            duration: SHEEN_MS / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [animating, spin, glow]);

  if (!animating && hidesWhenStopped) return null;

  const r = DOT_R * px;
  const a = arcBox(px);
  const arcColor = mono ? color! : BLUE;
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
    <Image
      source={RING}
      resizeMode="contain"
      style={[{ position: 'absolute', width: px, height: px }, mono && { tintColor: color }]}
    />
  );
  const arcPos = {
    position: 'absolute' as const,
    left: a.left,
    top: a.top,
    width: a.width,
    height: a.height,
  };

  let body: ReactNode;
  if (IS_WEB) {
    // react-native-web renders dataSet as data-* attributes for the CSS above.
    const web = (kind: string) => ({ dataSet: { icarLoader: animating ? kind : 'still' } }) as object;
    body = (
      <>
        <View
          {...web('arc')}
          style={[
            arcPos,
            {
              color: arcColor,
              fontSize: px,
              animationDelay: delays[0],
            } as ViewStyle,
          ]}
        />
        {ringImage}
        {!mono && (
          <View
            {...web('sheen')}
            style={[{ position: 'absolute', width: px, height: px }, { animationDelay: delays[1] } as ViewStyle]}
          >
            {ringImage}
          </View>
        )}
        <View {...web('dot')} style={[dotBox, { fontSize: px / 6, animationDelay: delays[1] } as ViewStyle]} />
      </>
    );
  } else {
    body = (
      <>
        <Animated.View
          style={[
            arcPos,
            {
              borderRadius: a.width / 2,
              borderWidth: Math.max(1.5, px * 0.035),
              borderColor: 'transparent',
              borderTopColor: arcColor,
              transform: [
                {
                  rotate: spin.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg'],
                  }),
                },
              ],
            },
          ]}
        />
        {ringImage}
        <Animated.View
          style={[
            dotBox,
            {
              transform: [
                {
                  scale: glow.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.15],
                  }),
                },
              ],
            },
          ]}
        />
      </>
    );
  }

  return (
    <View
      style={[{ width: px, height: px }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {body}
    </View>
  );
}
