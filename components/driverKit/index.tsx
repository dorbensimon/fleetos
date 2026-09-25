import React, { ReactNode, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { BrandLoader } from '../ui/BrandLoader';
import { syncWebThemeColor } from '../../lib/webThemeColor';
import { DK, DK_FONT, DK_RADIUS, DK_SHADOW, DK_SPACE, STATUS, type Status } from './theme';

export * from './theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const NATIVE_DRIVER = Platform.OS !== 'web';
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

// ── Motion ────────────────────────────────────────────────────────────────

export function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => alive && setReduce(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/**
 * Content arrives in a short cascade (fade + 14px rise, 280ms, 55ms apart)
 * so a screen reads top-down instead of popping in at once. Reduced motion
 * keeps the fade and drops the movement.
 */
export function Reveal({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 280,
      delay: 40 + index * 55,
      easing: EASE_OUT,
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [index, t]);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : 14, 0] });
  return <Animated.View style={[style, { opacity: t, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/**
 * Every tappable surface: a quick press-in (scale .97, 110ms) and a spring
 * back, so a tap is felt immediately. A light haptic on native for actions.
 */
export function Pressy({
  onPress,
  disabled,
  style,
  children,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  haptic = false,
  pressScale = 0.97,
}: {
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link';
  haptic?: boolean;
  pressScale?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  // Layout belongs to the touch target (it is the flex item); the look and
  // the press motion belong to the view inside it.
  const { outer, inner } = splitLayout(style);
  const to = (value: number, spring: boolean) =>
    (spring
      ? Animated.spring(scale, { toValue: value, useNativeDriver: NATIVE_DRIVER, speed: 28, bounciness: 6 })
      : Animated.timing(scale, { toValue: value, duration: 110, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER })
    ).start();
  return (
    <Pressable
      onPress={() => {
        if (haptic && Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      onPressIn={() => to(pressScale, false)}
      onPressOut={() => to(1, true)}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      style={(state) => [outer, (state as { focused?: boolean }).focused && styles.focusRing]}
    >
      <Animated.View style={[inner, { transform: [{ scale }] }, disabled && styles.disabled]}>{children}</Animated.View>
    </Pressable>
  );
}

const LAYOUT_KEYS = new Set([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'width', 'minWidth', 'maxWidth', 'alignSelf',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
  'position', 'top', 'bottom', 'left', 'right', 'zIndex',
]);

function splitLayout(style: StyleProp<ViewStyle>) {
  const flat = (StyleSheet.flatten(style) || {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) (LAYOUT_KEYS.has(key) ? outer : inner)[key] = value;
  if (outer.flex != null || outer.flexGrow != null) inner.flexGrow = 1;
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}

// ── Type ──────────────────────────────────────────────────────────────────

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'micro' | 'number';

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontFamily: DK_FONT.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  title: { fontFamily: DK_FONT.title, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  heading: { fontFamily: DK_FONT.bold, fontSize: 17, lineHeight: 23 },
  body: { fontFamily: DK_FONT.regular, fontSize: 16, lineHeight: 23 },
  label: { fontFamily: DK_FONT.semibold, fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: DK_FONT.medium, fontSize: 13.5, lineHeight: 19 },
  micro: { fontFamily: DK_FONT.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  number: { fontFamily: DK_FONT.numeric, fontSize: 16, lineHeight: 22, fontVariant: ['tabular-nums'] },
};

export function DKText({
  variant = 'body',
  color = DK.ink,
  style,
  ltr,
  ...rest
}: TextProps & { variant?: Variant; color?: string; ltr?: boolean }) {
  return (
    <Text
      {...rest}
      style={[
        VARIANTS[variant],
        { color, textAlign: ltr ? 'left' : 'right', writingDirection: ltr ? 'ltr' : 'rtl' },
        style,
      ]}
    />
  );
}

// ── Night hero ────────────────────────────────────────────────────────────

const RING = require('../../images/icar-loader-ring.png');

/**
 * The top of every driver screen: brand ink lit by the blue and cyan of the
 * logo, with the logo's own ring turning into place behind the content once
 * on arrival. It runs under the status bar, so the clock sits on the night.
 */
export function NightHero({
  insetTop,
  children,
  compact = false,
  style,
}: {
  insetTop: number;
  children: ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotion();
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(ring, { toValue: 1, duration: 600, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start();
  }, [ring]);
  // The hero often appears after a loading state, well after navigation
  // sampled the page top; sample again so Safari's bar turns night too.
  useEffect(() => {
    syncWebThemeColor();
  }, []);
  const size = compact ? 230 : 330;
  return (
    <View style={[styles.hero, { paddingTop: insetTop + 10, paddingBottom: compact ? 44 : 56 }, style]}>
      {/* Top-to-bottom, so the top edge is one flat colour: iOS paints the
          status bar and the overscroll area with exactly that colour, and
          nothing decorative reaches the edge to be cut off by it. */}
      <LinearGradient colors={DK.night} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {Platform.OS === 'web' && (
        <>
          <View pointerEvents="none" style={[styles.glow, styles.glowBlue, { top: insetTop + 10 }]} />
          <View pointerEvents="none" style={[styles.glow, styles.glowCyan]} />
        </>
      )}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Animated.Image
          source={RING}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.heroRing,
            { width: size, height: size, top: insetTop + (compact ? 40 : 56), left: -size * 0.34 },
            {
              opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] }),
              transform: [{ rotate: ring.interpolate({ inputRange: [0, 1], outputRange: [reduce ? '-24deg' : '-64deg', '-24deg'] }) }],
            },
          ]}
        />
      </View>
      <View style={styles.heroContent}>{children}</View>
    </View>
  );
}

/**
 * The night colour held behind the clock and battery while the page scrolls
 * (Home Screen app and native, where the page runs under the status bar),
 * so light cards never slide under white status-bar symbols.
 */
export function StatusBand({ insetTop }: { insetTop: number }) {
  if (!insetTop) return null;
  return <View pointerEvents="none" style={[styles.statusBand, { height: insetTop }]} />;
}

/** Round glass button on the night hero (48pt target). */
export function HeroButton({ icon, onPress, label, badge = false }: { icon: IconName; onPress: () => void; label: string; badge?: boolean }) {
  return (
    <Pressy onPress={onPress} accessibilityLabel={label} style={styles.heroButton} pressScale={0.92}>
      <Ionicons name={icon} size={21} color={DK.onNight} />
      {badge && <View style={styles.heroBadge} />}
    </Pressy>
  );
}

/** Title row for inner screens: back on the right (RTL), title, optional action. */
export function HeroTitle({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: ReactNode;
}) {
  return (
    <View>
      <View style={styles.heroBar}>
        <HeroButton icon="chevron-forward" label="חזרה" onPress={onBack} />
        <View style={styles.heroBarSlot}>{right}</View>
      </View>
      <DKText variant="display" color={DK.onNight} style={styles.heroTitle} accessibilityRole="header" numberOfLines={2}>
        {title}
      </DKText>
      {!!subtitle && (
        <DKText variant="body" color={DK.onNightMuted} style={styles.heroSubtitle}>
          {subtitle}
        </DKText>
      )}
    </View>
  );
}

/**
 * A slim night bar for full-height tools (signing, viewing a document):
 * back, the title on one line, an optional action — and nothing else, so
 * the document gets the screen.
 */
export function NightBar({
  insetTop,
  title,
  subtitle,
  onBack,
  right,
}: {
  insetTop: number;
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: ReactNode;
}) {
  useEffect(() => {
    syncWebThemeColor();
  }, []);
  return (
    <View style={[styles.nightBar, { paddingTop: insetTop + 8 }]}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={[DK.night[0], DK.night[1]]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <HeroButton icon="chevron-forward" label="חזרה" onPress={onBack} />
      <View style={styles.nightBarText}>
        <DKText variant="heading" color={DK.onNight} numberOfLines={1} accessibilityRole="header">
          {title}
        </DKText>
        {!!subtitle && (
          <DKText variant="caption" color={DK.onNightMuted} numberOfLines={1}>
            {subtitle}
          </DKText>
        )}
      </View>
      <View style={styles.heroBarSlot}>{right}</View>
    </View>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

/**
 * Frame for every inner driver screen: the night hero with its title, and
 * the content rising over its lower edge on the cool canvas.
 */
export function DriverPage({
  insetTop,
  insetBottom,
  hero,
  children,
  footer,
}: {
  insetTop: number;
  insetBottom: number;
  hero: ReactNode;
  children: ReactNode;
  /** Pinned under the scroll (e.g. a save button), above the home indicator. */
  footer?: ReactNode;
}) {
  return (
    <View style={styles.page}>
      <StatusBar barStyle="light-content" />
      <NightUnderlay />
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={[styles.pageContent, { paddingBottom: footer ? 24 : insetBottom + 36 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <NightHero insetTop={insetTop} compact>
          {hero}
        </NightHero>
        <View style={styles.pageBody}>{children}</View>
      </ScrollView>
      <StatusBand insetTop={insetTop} />
      {!!footer && <View style={[styles.pageFooter, { paddingBottom: insetBottom + 12 }]}>{footer}</View>}
    </View>
  );
}

/**
 * Pulling a page down past its top shows what is behind the scroll view.
 * Night fills the upper half there, so the hero seems to stretch instead of
 * a pale gap opening above it; the content itself paints the canvas.
 */
export function NightUnderlay() {
  return <View pointerEvents="none" style={styles.underlay} />;
}

// ── Surfaces ──────────────────────────────────────────────────────────────

export function Surface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

export function SectionHeader({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <DKText variant="heading" accessibilityRole="header">
        {title}
      </DKText>
      {trailing}
    </View>
  );
}

export function StatusChip({ status, label, onNight = false }: { status: Status; label?: string; onNight?: boolean }) {
  const s = STATUS[status];
  return (
    <View style={[styles.chip, { backgroundColor: onNight ? 'rgba(255,255,255,0.14)' : s.soft }]}>
      <Ionicons name={s.icon} size={14} color={onNight ? s.fill : s.fg} />
      <DKText variant="micro" color={onNight ? DK.onNight : s.fg}>
        {label ?? s.label}
      </DKText>
    </View>
  );
}

/**
 * A validity gauge: label and status on one line, the date under it, and a
 * bar that fills (from the right, in reading order) to how much validity is
 * left. Status is always spelled out and iconed, never colour alone.
 */
export function Gauge({
  label,
  value,
  detail,
  status,
  progress,
  index = 0,
  onPress,
  last = false,
}: {
  label: string;
  value: string;
  detail?: string | null;
  status: Status;
  progress: number;
  index?: number;
  onPress?: () => void;
  last?: boolean;
}) {
  const reduce = useReducedMotion();
  const fill = useRef(new Animated.Value(reduce ? progress : 0)).current;
  useEffect(() => {
    Animated.timing(fill, {
      toValue: progress,
      duration: reduce ? 0 : 480,
      delay: reduce ? 0 : 140 + index * 60,
      easing: EASE_OUT,
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [fill, index, progress, reduce]);
  const s = STATUS[status];
  const body = (
    <View style={[styles.gauge, !last && styles.gaugeDivider]}>
      <View style={styles.gaugeTop}>
        <DKText variant="label">{label}</DKText>
        <StatusChip status={status} />
      </View>
      <View style={styles.gaugeMeta}>
        <DKText variant="number" color={DK.inkSoft}>
          {value}
        </DKText>
        {!!detail && (
          <DKText variant="caption" color={status === 'expired' ? s.fg : DK.muted}>
            {detail}
          </DKText>
        )}
      </View>
      <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Animated.View style={[styles.trackFill, { backgroundColor: s.fill, transform: [{ scaleX: fill }] }]} />
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressy onPress={onPress} accessibilityLabel={`${label}, ${s.label}, ${value}${detail ? `, ${detail}` : ''}`} pressScale={0.985}>
      {body}
    </Pressy>
  );
}

/** Israeli plate: yellow field, blue IL strip, number in reading order. */
export function Plate({ number, size = 'md' }: { number: string; size?: 'md' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <View style={styles.plate} accessibilityLabel={`לוחית רישוי ${number}`} accessible>
      <View style={[styles.plateIl, lg && styles.plateIlLg]}>
        <DKText variant="micro" color="#FFFFFF" ltr style={styles.plateIlText}>
          IL
        </DKText>
      </View>
      <View style={[styles.plateField, lg && styles.plateFieldLg]}>
        <DKText ltr style={[styles.plateText, lg && styles.plateTextLg]}>
          {number}
        </DKText>
      </View>
    </View>
  );
}

/** A tappable list row with an icon tile. 60pt tall for comfortable thumbs. */
export function ListRow({
  icon,
  tint = DK.accent,
  title,
  subtitle,
  value,
  trailing,
  onPress,
  first = false,
  ltrValue = false,
}: {
  icon: IconName;
  tint?: string;
  title: string;
  subtitle?: string | null;
  value?: string | null;
  trailing?: ReactNode;
  onPress?: () => void;
  first?: boolean;
  ltrValue?: boolean;
}) {
  const content = (
    <View style={[styles.row, !first && styles.rowDivider]}>
      <View style={[styles.rowIcon, { backgroundColor: `${tint}14` }]}>
        <Ionicons name={icon} size={19} color={tint} />
      </View>
      <View style={styles.rowText}>
        <DKText variant="label" numberOfLines={1}>
          {title}
        </DKText>
        {!!subtitle && (
          <DKText variant="caption" color={DK.muted} numberOfLines={2}>
            {subtitle}
          </DKText>
        )}
      </View>
      {!!value && (
        <DKText variant="number" color={DK.inkSoft} ltr={ltrValue} numberOfLines={1} style={styles.rowValue}>
          {value}
        </DKText>
      )}
      {trailing}
      {!!onPress && <Ionicons name="chevron-back" size={18} color={DK.faint} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressy onPress={onPress} accessibilityLabel={[title, subtitle, value].filter(Boolean).join(', ')} pressScale={0.985}>
      {content}
    </Pressy>
  );
}

export function PrimaryAction({
  label,
  icon,
  onPress,
  loading = false,
  disabled = false,
  tone = 'accent',
  style,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: 'accent' | 'ghost' | 'danger';
  style?: StyleProp<ViewStyle>;
}) {
  const ghost = tone !== 'accent';
  const fg = tone === 'accent' ? '#FFFFFF' : tone === 'danger' ? STATUS.expired.fg : DK.accent;
  return (
    <Pressy
      onPress={onPress}
      disabled={disabled || loading}
      haptic
      accessibilityLabel={label}
      style={[styles.action, ghost ? (tone === 'danger' ? styles.actionDanger : styles.actionGhost) : styles.actionAccent, style]}
    >
      {loading ? (
        <BrandLoader size={22} color={ghost ? undefined : '#FFFFFF'} />
      ) : (
        <>
          {!!icon && <Ionicons name={icon} size={19} color={fg} />}
          <DKText variant="label" color={fg}>
            {label}
          </DKText>
        </>
      )}
    </Pressy>
  );
}

const styles = StyleSheet.create({
  focusRing: Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 2, outlineColor: DK.accent, outlineOffset: 3, borderRadius: 16 } as any, default: {} }),
  disabled: { opacity: 0.45 },

  hero: {
    overflow: 'hidden',
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    backgroundColor: DK.night[0],
    // Safari drops a rounded clip while a child is animating (the corners
    // flash square); a mask keeps the clip on the GPU layer.
    ...Platform.select({ web: { WebkitMaskImage: '-webkit-radial-gradient(white, black)', isolation: 'isolate' } as any, default: {} }),
  },
  // Soft light from the logo's blue and cyan. Radial gradients fade to
  // nothing inside their own box, so no edge can ever show (a CSS blur
  // filter is clipped to a hard square on iOS).
  glow: { position: 'absolute' },
  glowBlue: {
    width: 420,
    height: 420,
    right: -170,
    backgroundImage: 'radial-gradient(closest-side, rgba(47,91,255,0.42), rgba(47,91,255,0.16) 55%, rgba(47,91,255,0) 100%)',
  } as any,
  glowCyan: {
    width: 320,
    height: 320,
    bottom: -190,
    left: -90,
    backgroundImage: 'radial-gradient(closest-side, rgba(25,198,240,0.28), rgba(25,198,240,0) 100%)',
  } as any,
  heroRing: { position: 'absolute' },
  statusBand: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: DK.night[0] },
  heroContent: { paddingHorizontal: DK_SPACE.lg, width: '100%', maxWidth: 560, alignSelf: 'center' },
  heroButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DK.glass,
    borderWidth: 1,
    borderColor: DK.glassBorder,
  },
  heroBadge: {
    position: 'absolute',
    top: 11,
    left: 12,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF4D5E',
    borderWidth: 2,
    borderColor: '#12306E',
  },
  heroBar: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  heroBarSlot: { minWidth: 48, alignItems: 'flex-start' },
  heroTitle: {},
  nightBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: DK_SPACE.md,
    paddingBottom: 12,
    backgroundColor: DK.night[0],
    zIndex: 2,
  },
  nightBarText: { flex: 1, gap: 1 },
  heroSubtitle: { marginTop: 6 },

  page: { flex: 1, backgroundColor: DK.canvas },
  pageScroll: { flex: 1 },
  pageContent: { flexGrow: 1, backgroundColor: DK.canvas },
  underlay: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%', backgroundColor: DK.night[0] },
  pageBody: { marginTop: -24, paddingHorizontal: DK_SPACE.md, gap: 18, width: '100%', maxWidth: 560, alignSelf: 'center' },
  pageFooter: {
    paddingHorizontal: DK_SPACE.md,
    paddingTop: 12,
    backgroundColor: DK.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: DK.hairline,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },

  surface: {
    backgroundColor: DK.surface,
    borderRadius: DK_RADIUS.card,
    ...DK_SHADOW,
  },
  sectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 8,
    marginBottom: 10,
  },
  chip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: DK_RADIUS.pill,
  },

  gauge: { paddingHorizontal: DK_SPACE.lg, paddingVertical: 16, gap: 8 },
  gaugeDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DK.hairline },
  gaugeTop: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  gaugeMeta: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 10 },
  track: { height: 6, borderRadius: 3, backgroundColor: '#E9EDF3', overflow: 'hidden' },
  trackFill: { ...StyleSheet.absoluteFill, borderRadius: 3, transformOrigin: 'right' },

  plate: {
    flexDirection: 'row',
    borderRadius: 10,
    overflow: 'hidden',
    alignSelf: 'flex-end',
    borderWidth: 1.5,
    borderColor: 'rgba(10,22,38,0.85)',
    ...Platform.select({
      web: { boxShadow: '0 8px 20px rgba(0,0,0,0.28)' } as any,
      default: { shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
    }),
  },
  plateIl: { width: 26, backgroundColor: '#1D4FD8', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 },
  plateIlLg: { width: 32 },
  plateIlText: { fontSize: 10, textAlign: 'center' },
  plateField: { backgroundColor: '#F7D117', paddingHorizontal: 12, paddingVertical: 6 },
  plateFieldLg: { paddingHorizontal: 16, paddingVertical: 9 },
  plateText: { fontFamily: DK_FONT.display, fontSize: 19, letterSpacing: 1, color: '#111318', fontVariant: ['tabular-nums'] },
  plateTextLg: { fontSize: 25, letterSpacing: 1.4 },

  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: DK_SPACE.md, paddingVertical: 10 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowValue: { flexShrink: 1, maxWidth: '48%' },

  action: {
    minHeight: 54,
    borderRadius: 18,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  actionAccent: {
    backgroundColor: DK.accent,
    ...Platform.select({
      web: { boxShadow: '0 10px 24px rgba(47,91,255,0.32)' } as any,
      default: { shadowColor: DK.accent, shadowOpacity: 0.32, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
    }),
  },
  actionGhost: { backgroundColor: DK.accentSoft },
  actionDanger: { backgroundColor: STATUS.expired.soft },
});

export { DK_SHADOW as SURFACE_SHADOW };
