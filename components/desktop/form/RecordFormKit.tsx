import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { BrandLoader } from '../../ui/BrandLoader';
import { Ionicons } from '@expo/vector-icons';
import { DLtrText, DText, HoverPressable, prefersReducedMotion } from '../primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from '../desktopTheme';

/**
 * The shared design of the desktop "new driver" and "new vehicle" forms —
 * the same language as the company settings page, so the three read as one
 * family:
 *
 *  - a dark ink hero where the record being created appears as a live card
 *    while it is typed, next to the numbered steps of the form;
 *  - numbered sections of iOS inset-grouped rows (label right, box left);
 *  - a floating dock that always shows what is still missing and holds the
 *    one create button. When something is missing, the button leads there.
 */

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Critically damped (ratio ≈ 1, response ≈ 0.35s): glides and settles with no bounce. */
const SPRING = { stiffness: 320, damping: 36, mass: 1, useNativeDriver: false } as const;
const PANEL_SHADOW = '0 1px 2px rgba(16,24,40,0.04), 0 6px 20px rgba(16,24,40,0.05)';
/** Room above a section when the page scrolls to it. */
const JUMP_OFFSET = 20;

export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(prefersReducedMotion);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduce)
      .catch(() => {});
  }, []);
  return reduce;
}

/** Section offsets, measured on layout, so steps and the dock can scroll the page to a section. */
export function useSectionJump<K extends string>() {
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<K, number>>>({});
  const track = useCallback(
    (key: K) => (e: LayoutChangeEvent) => {
      offsets.current[key] = e.nativeEvent.layout.y;
    },
    [],
  );
  const jump = useCallback((key: K) => {
    const y = offsets.current[key];
    if (y == null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - JUMP_OFFSET), animated: !prefersReducedMotion() });
  }, []);
  return { scrollRef, track, jump };
}

/** The scrolling page and the dock that floats over its bottom edge. */
export function RecordFormPage({
  scrollRef,
  dock,
  children,
}: {
  scrollRef: React.RefObject<ScrollView | null>;
  dock: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.root}>
      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.page}>
        {children}
      </ScrollView>
      {dock}
    </View>
  );
}

export interface FormStep<K extends string> {
  key: K;
  label: string;
  /** Required fields in the step, and how many are filled. A step with none is "done" once visited. */
  total: number;
  filled: number;
}

/**
 * The dark opening scene: what is being created, its steps (each one a
 * button to its section), and on the left the live card of the record.
 */
export function RecordHero<K extends string>({
  icon,
  eyebrow,
  title,
  subtitle,
  steps,
  onJump,
  card,
}: {
  icon: IconName;
  eyebrow: string;
  title: string;
  subtitle: string;
  steps: FormStep<K>[];
  onJump: (key: K) => void;
  card: React.ReactNode;
}) {
  return (
    <View style={[styles.hero, heroEnter()]}>
      <View style={styles.heroGrid} pointerEvents="none" />
      <View style={styles.heroBody}>
        <View style={styles.heroIntro}>
          <View style={styles.eyebrow}>
            <Ionicons name={icon} size={15} color="#9FD8F5" />
            <DText weight="semiBold" style={styles.eyebrowText}>{eyebrow}</DText>
          </View>
          <DText weight="extraBold" style={styles.heroTitle} accessibilityRole="header" numberOfLines={2}>
            {title}
          </DText>
          <DText style={styles.heroSubtitle}>{subtitle}</DText>

          <View style={styles.steps}>
            {steps.map((step, i) => {
              const done = step.total > 0 && step.filled === step.total;
              return (
                <HoverPressable
                  key={step.key}
                  style={styles.step}
                  hoverStyle={styles.stepHover}
                  pressMotionStyle={styles.stepPress}
                  onPress={() => onJump(step.key)}
                  accessibilityLabel={`${step.label}${done ? ', הושלם' : ''}`}
                >
                  <View style={[styles.stepNum, done && styles.stepNumDone]}>
                    {done ? (
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    ) : (
                      <DText weight="bold" style={styles.stepNumText}>{i + 1}</DText>
                    )}
                  </View>
                  <View style={styles.stepText}>
                    <DText weight="semiBold" style={styles.stepLabel} numberOfLines={1}>{step.label}</DText>
                    <DText style={[styles.stepMeta, done && styles.stepMetaDone]} numberOfLines={1}>
                      {step.total === 0 ? 'רשות' : done ? 'הושלם' : `${step.filled} מתוך ${step.total}`}
                    </DText>
                  </View>
                </HoverPressable>
              );
            })}
          </View>
        </View>

        <View style={styles.heroStage}>{card}</View>
      </View>
    </View>
  );
}

function heroEnter() {
  const reduce = prefersReducedMotion();
  return webOnly({
    animationKeyframes: reduce
      ? { from: { opacity: 0 }, to: { opacity: 1 } }
      : { from: { opacity: 0, transform: [{ translateY: 12 }, { scale: 0.985 }] }, to: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] } },
    animationDuration: reduce ? '200ms' : '600ms',
    animationTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
    animationFillMode: 'backwards',
  });
}

/**
 * The white card that stands for the record in the hero. It leans back a
 * little, and straightens up under a fine pointer. A light sheen runs across
 * its face; reduced motion keeps it flat.
 */
export function LiveCard({ children, label }: { children: React.ReactNode; label: string }) {
  const [hovered, setHovered] = useState(false);
  const reduce = useReducedMotion();
  return (
    <Pressable
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      focusable={false}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.liveCard,
        !reduce && {
          transform: hovered
            ? [{ perspective: 1100 }, { rotateY: '0deg' }, { rotateX: '0deg' }, { translateY: -4 }]
            : [{ perspective: 1100 }, { rotateY: '10deg' }, { rotateX: '4deg' }, { translateY: 0 }],
        },
        webOnly({ cursor: 'default' }),
      ]}
    >
      <View style={styles.liveCardSheen} pointerEvents="none" />
      {children}
    </Pressable>
  );
}

/** Placeholder bar for a card value that has not been typed yet. */
export function GhostBar({ width, dark }: { width: number; dark?: boolean }) {
  return <View style={[styles.ghostBar, dark && styles.ghostBarDark, { width }]} />;
}

/** A numbered block of the form. Its number turns into a green check once its required fields are in. */
export function FormSection({
  index,
  title,
  hint,
  done,
  onLayout,
  children,
}: {
  index: number;
  title: string;
  hint: string;
  done: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  const enter = useRef(new Animated.Value(0)).current;
  const reduce = useReducedMotion();

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      delay: 140 + index * 60,
      easing: EASE_OUT,
      useNativeDriver: false,
    }).start();
  }, [enter, index]);

  const translateY = reduce ? 0 : enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <Animated.View onLayout={onLayout} style={[styles.section, { opacity: enter, transform: [{ translateY }] }]}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionGlyph, done && styles.sectionGlyphDone]}>
          {done ? (
            <Ionicons name="checkmark" size={24} color="#FFFFFF" />
          ) : (
            <DText weight="extraBold" style={styles.sectionNum}>{index + 1}</DText>
          )}
        </View>
        <View style={styles.sectionHeadText}>
          <DText weight="bold" style={styles.sectionTitle} accessibilityRole="header">{title}</DText>
          <DText style={styles.sectionHint}>{hint}</DText>
        </View>
      </View>
      {children}
    </Animated.View>
  );
}

/** iOS inset-grouped platter; rows sit 1px up so the first hairline hides under its edge. */
export function FormPanel({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.panel}>
      <View style={styles.rows}>{children}</View>
    </View>
  );
}

/** One field as a row: label on the right, the box on the left; on a narrow window the box drops under its label. */
export function FormCell({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  /** A short line under the box that explains what the field is for. */
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.cell}>
      <DText weight="semiBold" style={styles.cellLabel}>
        {label}
        {required && <DText style={styles.required}> *</DText>}
      </DText>
      <View style={styles.cellControl}>
        {children}
        {!!error ? (
          <View style={styles.cellError}>
            <Ionicons name="alert-circle" size={15} color={DESKTOP_TONES.bad.fg} />
            <DText style={styles.cellErrorText}>{error}</DText>
          </View>
        ) : !!hint ? (
          <DText style={styles.cellHint}>{hint}</DText>
        ) : null}
      </View>
    </View>
  );
}

export interface ChoiceTile<T extends string> {
  value: T;
  label: string;
  description?: string;
  /** Renders the tile's picture in the given color. */
  art?: (color: string) => React.ReactNode;
  /** A status dot in front of the label. */
  dot?: string;
}

/**
 * A handful of options as big tiles you can see all at once — nothing hides
 * in a dropdown. One is chosen at a time; it fills with the brand color.
 */
export function ChoiceTiles<T extends string>({
  value,
  options,
  onChange,
  hasError,
  label,
}: {
  value: T | null;
  options: ChoiceTile<T>[];
  onChange: (v: T) => void;
  hasError?: boolean;
  label: string;
}) {
  return (
    <View style={styles.tiles} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <HoverPressable
            key={o.value}
            style={[styles.tile, !!o.art && styles.tileArt, selected && styles.tileSelected, hasError && !selected && styles.tileError]}
            hoverStyle={selected ? undefined : styles.tileHover}
            pressMotionStyle={styles.tilePress}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            aria-checked={selected}
            accessibilityLabel={o.description ? `${o.label}, ${o.description}` : o.label}
          >
            {!!o.art && <View style={styles.tileArtBox}>{o.art(selected ? '#FFFFFF' : DESKTOP_COLORS.brand)}</View>}
            <View style={styles.tileLabelRow}>
              {!!o.dot && <View style={[styles.tileDot, { backgroundColor: selected ? '#FFFFFF' : o.dot }]} />}
              <DText weight="bold" style={[styles.tileLabel, selected && styles.tileLabelSelected]} numberOfLines={1}>
                {o.label}
              </DText>
            </View>
            {!!o.description && (
              <DText style={[styles.tileDesc, selected && styles.tileDescSelected]} numberOfLines={2}>
                {o.description}
              </DText>
            )}
            {selected && (
              <View style={styles.tileCheck}>
                <Ionicons name="checkmark" size={13} color={DESKTOP_COLORS.brand} />
              </View>
            )}
          </HoverPressable>
        );
      })}
    </View>
  );
}

const SWITCH_W = 46;
const SWITCH_H = 28;
const KNOB = 24;
const KNOB_STRETCH = 5;

function AppleSwitch({ value, pressed }: { value: boolean; pressed: boolean }) {
  const on = useRef(new Animated.Value(value ? 1 : 0)).current;
  const press = useRef(new Animated.Value(0)).current;
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) on.setValue(value ? 1 : 0);
    else Animated.spring(on, { toValue: value ? 1 : 0, speed: 18, bounciness: 0, useNativeDriver: false }).start();
  }, [value, on, reduce]);

  useEffect(() => {
    if (reduce) press.setValue(0);
    else Animated.spring(press, { toValue: pressed ? 1 : 0, speed: 30, bounciness: 0, useNativeDriver: false }).start();
  }, [pressed, press, reduce]);

  // RTL: "on" sits at the left end, like iOS in Hebrew.
  const offLeft = SWITCH_W - KNOB - 2;
  const stretch = Animated.multiply(press, KNOB_STRETCH);
  const left = Animated.subtract(
    on.interpolate({ inputRange: [0, 1], outputRange: [offLeft, 2] }),
    Animated.multiply(stretch, on.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })),
  );

  return (
    <Animated.View
      style={[
        styles.switchTrack,
        { backgroundColor: on.interpolate({ inputRange: [0, 1], outputRange: ['rgba(120,120,128,0.2)', '#34C759'] }) },
      ]}
    >
      <Animated.View style={[styles.switchKnob, { left, width: Animated.add(KNOB, stretch) }]} />
    </Animated.View>
  );
}

/** A whole-row toggle: the label, what it means right now, and the switch are one target. */
export function FormToggleRow({
  title,
  caption,
  value,
  onValueChange,
}: {
  title: string;
  caption: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      aria-checked={value}
      accessibilityLabel={title}
      style={[styles.toggleRow, hovered && styles.toggleRowHover]}
    >
      <View style={styles.toggleText}>
        <DText weight="semiBold" style={styles.toggleTitle}>{title}</DText>
        <DText style={[styles.toggleCaption, value && styles.toggleCaptionOn]}>{caption}</DText>
      </View>
      <AppleSwitch value={value} pressed={pressed} />
    </Pressable>
  );
}

/** A quiet explanatory note inside a section, in place of fields that are not available yet. */
export function FormNote({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <View style={[styles.panel, styles.note]}>
      <View style={styles.noteIcon}>
        <Ionicons name={icon} size={22} color={DESKTOP_COLORS.brand} />
      </View>
      <View style={styles.noteText}>
        <DText weight="bold" style={styles.noteTitle}>{title}</DText>
        <DText style={styles.noteBody}>{text}</DText>
      </View>
    </View>
  );
}

/**
 * The floating dock. It always tells what is left — each missing field is a
 * button to it — and holds the single create button. While fields are
 * missing, that button reads "what's next" and scrolls there instead of
 * sitting disabled.
 */
export function CreateDock({
  total,
  filled,
  missing,
  canSubmit,
  saving,
  ctaLabel,
  readyText,
  ctaIcon,
  onSave,
}: {
  total: number;
  filled: number;
  missing: { label: string; onPress: () => void }[];
  canSubmit: boolean;
  saving: boolean;
  ctaLabel: string;
  readyText: string;
  ctaIcon: IconName;
  onSave: () => void;
}) {
  const reduce = useReducedMotion();
  const enter = useRef(new Animated.Value(0)).current;
  const fill = useRef(new Animated.Value(total ? filled / total : 1)).current;

  useEffect(() => {
    Animated.spring(enter, { toValue: 1, ...SPRING, delay: 260 } as Animated.SpringAnimationConfig).start();
  }, [enter]);

  useEffect(() => {
    const to = total ? filled / total : 1;
    if (reduce) fill.setValue(to);
    else Animated.spring(fill, { toValue: to, ...SPRING }).start();
  }, [filled, total, fill, reduce]);

  const translateY = reduce ? 0 : enter.interpolate({ inputRange: [0, 1], outputRange: [90, 0] });
  const next = missing[0];

  return (
    <View pointerEvents="box-none" style={styles.dockWrap}>
      <Animated.View style={[styles.dock, { opacity: enter, transform: [{ translateY }] }]} accessibilityLiveRegion="polite">
        <View
          style={styles.dockStatus}
          accessible
          accessibilityLabel={canSubmit ? readyText : `נשארו ${missing.length} פרטי חובה: ${missing.map((m) => m.label).join(', ')}`}
        >
          <View style={[styles.dockBadge, canSubmit && styles.dockBadgeReady]}>
            {canSubmit ? (
              <Ionicons name="checkmark" size={14} color="#FFFFFF" />
            ) : (
              <DLtrText weight="bold" style={[styles.dockBadgeText, styles.tabular]}>{total - filled}</DLtrText>
            )}
          </View>
          <DText weight="semiBold" style={styles.dockTitle} numberOfLines={1}>
            {canSubmit ? 'הכל מוכן' : missing.length === 1 ? 'נשאר פרט אחד' : `נשארו ${missing.length} פרטים`}
          </DText>
          <View style={styles.dockTrack}>
            <Animated.View
              style={[
                styles.dockFill,
                canSubmit && styles.dockFillReady,
                { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
              ]}
            />
          </View>
        </View>

        <HoverPressable
          style={[styles.dockCta, !canSubmit && styles.dockCtaNext]}
          hoverStyle={saving ? undefined : canSubmit ? styles.dockCtaHover : styles.dockCtaNextHover}
          pressMotionStyle={styles.dockCtaPress}
          onPress={canSubmit ? onSave : next?.onPress}
          disabled={saving}
          accessibilityLabel={saving ? 'שומר' : canSubmit ? ctaLabel : `המשך למילוי ${next?.label ?? ''}`}
        >
          <View style={[styles.dockCtaInner, saving && styles.busy]}>
            <Ionicons name={canSubmit ? ctaIcon : 'arrow-down'} size={17} color={canSubmit ? '#FFFFFF' : DESKTOP_COLORS.brand} />
            <DText weight="bold" style={[styles.dockCtaText, !canSubmit && styles.dockCtaNextText]} numberOfLines={1}>
              {canSubmit ? ctaLabel : `להמשך: ${next?.label ?? ''}`}
            </DText>
          </View>
          {saving && <BrandLoader size="small" color="#FFFFFF" style={StyleSheet.absoluteFill} />}
        </HoverPressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabular: webOnly({ fontVariantNumeric: 'tabular-nums' }),
  root: { flex: 1, backgroundColor: DESKTOP_COLORS.canvas },
  scroll: { flex: 1 },
  page: {
    paddingTop: 32,
    paddingHorizontal: 28,
    paddingBottom: 120,
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
  },

  // Hero
  hero: {
    marginBottom: 48,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: DESKTOP_COLORS.ink,
    ...webOnly({
      backgroundImage:
        'radial-gradient(90% 120% at 100% 0%, rgba(0,136,204,0.55) 0%, rgba(0,136,204,0) 55%), radial-gradient(70% 100% at 0% 100%, rgba(0,136,204,0.32) 0%, rgba(0,136,204,0) 60%), linear-gradient(160deg, #1D2E3D 0%, #16222E 60%)',
      boxShadow: '0 2px 4px rgba(16,24,40,0.08), 0 24px 48px -12px rgba(22,34,46,0.35)',
    }),
  },
  heroGrid: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.55,
    ...webOnly({
      backgroundImage:
        'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
      backgroundSize: '32px 32px',
      maskImage: 'radial-gradient(70% 110% at 0% 50%, #000 0%, transparent 75%)',
      WebkitMaskImage: 'radial-gradient(70% 110% at 0% 50%, #000 0%, transparent 75%)',
    }),
  },
  heroBody: { flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', gap: 32, padding: 36 },
  heroIntro: { flexGrow: 1, flexBasis: 380, minWidth: 0 },
  eyebrow: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: 'rgba(95,193,240,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(95,193,240,0.22)',
  },
  eyebrowText: { fontSize: 14, color: '#9FD8F5' },
  heroTitle: { marginTop: 16, fontSize: 40, lineHeight: 46, letterSpacing: -1.1, color: '#FFFFFF' },
  heroSubtitle: { marginTop: 10, fontSize: 17, lineHeight: 26, color: 'rgba(255,255,255,0.7)', maxWidth: 480 },
  steps: { marginTop: 28, flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  step: {
    flexGrow: 1,
    flexBasis: 118,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 10,
    paddingRight: 10,
    paddingLeft: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    ...webOnly({
      backdropFilter: 'blur(12px)',
      transition: 'background-color 150ms ease, border-color 150ms ease, transform 160ms cubic-bezier(0.23, 1, 0.32, 1)',
    }),
  },
  stepHover: { backgroundColor: 'rgba(255,255,255,0.13)', borderColor: 'rgba(255,255,255,0.2)' },
  stepPress: { transform: [{ scale: 0.97 }] },
  stepNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    ...webOnly({ transition: 'background-color 240ms ease' }),
  },
  stepNumDone: { backgroundColor: '#34C759' },
  stepNumText: { fontSize: 15, color: '#FFFFFF' },
  stepText: { flex: 1, minWidth: 0, gap: 1 },
  stepLabel: { fontSize: 15.5, color: '#FFFFFF' },
  stepMeta: { fontSize: 13, color: 'rgba(255,255,255,0.55)' },
  stepMetaDone: { color: '#7EE2A0' },
  heroStage: {
    flexGrow: 0,
    flexShrink: 0,
    width: 344,
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },

  // Live card
  liveCard: {
    width: 340,
    maxWidth: '100%',
    height: 214,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    ...webOnly({
      backgroundImage:
        'radial-gradient(120% 90% at 100% 0%, #E9F6FD 0%, rgba(233,246,253,0) 55%), radial-gradient(90% 80% at 0% 100%, #EEF2F5 0%, rgba(238,242,245,0) 60%)',
      boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 2px 6px rgba(0,0,0,0.18), 0 30px 60px -18px rgba(0,0,0,0.6)',
      transformOrigin: 'center',
      transition: 'transform 520ms cubic-bezier(0.23, 1, 0.32, 1)',
    }),
  },
  liveCardSheen: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    ...webOnly({
      backgroundImage:
        'linear-gradient(115deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.75) 48%, rgba(255,255,255,0) 62%), repeating-radial-gradient(circle at 110% -20%, rgba(0,136,204,0.05) 0 1px, transparent 1px 9px)',
    }),
  },
  ghostBar: { height: 10, borderRadius: 5, backgroundColor: 'rgba(22,34,46,0.08)' },
  ghostBarDark: { backgroundColor: 'rgba(22,34,46,0.16)' },

  // Sections
  section: { marginBottom: 48 },
  sectionHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, marginBottom: 16, paddingHorizontal: 4 },
  sectionGlyph: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: DESKTOP_COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({
      boxShadow: '0 1px 2px rgba(0,136,204,0.2), 0 4px 12px rgba(0,136,204,0.2)',
      transition: 'background-color 240ms ease, box-shadow 240ms ease',
    }),
  },
  sectionGlyphDone: {
    backgroundColor: '#34C759',
    ...webOnly({ boxShadow: '0 1px 2px rgba(52,199,89,0.25), 0 4px 12px rgba(52,199,89,0.25)' }),
  },
  sectionNum: { fontSize: 21, color: '#FFFFFF' },
  sectionHeadText: { flex: 1, minWidth: 0, gap: 3 },
  sectionTitle: { fontSize: 24, letterSpacing: -0.5, lineHeight: 30 },
  sectionHint: { fontSize: 15, lineHeight: 22, color: DESKTOP_COLORS.inkMuted },

  panel: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderRadius: 18,
    overflow: 'hidden',
    ...webOnly({ boxShadow: PANEL_SHADOW }),
  },
  rows: { marginTop: -1 },
  cell: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 24,
    rowGap: 8,
    minHeight: 76,
    marginRight: 20,
    paddingLeft: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: DESKTOP_COLORS.borderSoft,
  },
  cellLabel: { flexBasis: 170, flexShrink: 0, fontSize: 16, lineHeight: 22, color: DESKTOP_COLORS.ink },
  cellControl: { flexGrow: 1, flexBasis: 280, minWidth: 0, maxWidth: 560, gap: 6 },
  required: { color: DESKTOP_COLORS.danger, fontSize: 16 },
  cellError: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  cellErrorText: { fontSize: 14, color: DESKTOP_TONES.bad.fg },
  cellHint: { fontSize: 14, lineHeight: 20, color: DESKTOP_COLORS.inkFaint },

  // Choice tiles
  tiles: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexGrow: 1,
    flexBasis: 118,
    minHeight: 72,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: DESKTOP_COLORS.border,
    backgroundColor: DESKTOP_COLORS.surface,
    justifyContent: 'center',
    gap: 2,
    ...webOnly({
      transition: 'background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms cubic-bezier(0.23, 1, 0.32, 1)',
    }),
  },
  tileArt: { alignItems: 'flex-end', paddingTop: 14 },
  tileHover: { borderColor: 'rgba(0,136,204,0.45)', backgroundColor: '#F5FAFD' },
  tilePress: { transform: [{ scale: 0.97 }] },
  tileSelected: {
    borderColor: DESKTOP_COLORS.brand,
    backgroundColor: DESKTOP_COLORS.brand,
    ...webOnly({
      backgroundImage: 'linear-gradient(160deg, #1AA0E0 0%, #0088CC 55%, #0075B0 100%)',
      boxShadow: '0 1px 2px rgba(0,136,204,0.25), 0 8px 20px -6px rgba(0,136,204,0.55)',
    }),
  },
  tileError: { borderColor: 'rgba(213,37,28,0.45)' },
  tileArtBox: { height: 30, justifyContent: 'center', marginBottom: 4 },
  tileLabelRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  tileDot: { width: 9, height: 9, borderRadius: 5 },
  tileLabel: { fontSize: 17, color: DESKTOP_COLORS.ink },
  tileLabelSelected: { color: '#FFFFFF' },
  tileDesc: { fontSize: 13.5, lineHeight: 18, color: DESKTOP_COLORS.inkMuted },
  tileDescSelected: { color: 'rgba(255,255,255,0.85)' },
  tileCheck: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 16,
    minHeight: 76,
    marginRight: 20,
    paddingLeft: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: DESKTOP_COLORS.borderSoft,
    ...webOnly({ cursor: 'pointer', userSelect: 'none', transition: 'opacity 150ms ease-out' }),
  },
  toggleRowHover: { opacity: 0.85 },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: { fontSize: 16 },
  toggleCaption: { fontSize: 14.5, color: DESKTOP_COLORS.inkMuted },
  toggleCaptionOn: { color: DESKTOP_TONES.ok.fg },
  switchTrack: { width: SWITCH_W, height: SWITCH_H, borderRadius: SWITCH_H / 2 },
  switchKnob: {
    position: 'absolute',
    top: 2,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: '#FFFFFF',
    ...webOnly({ boxShadow: '0 2px 5px rgba(0,0,0,0.16), 0 0 0 0.5px rgba(0,0,0,0.04)' }),
  },

  // Note
  note: { flexDirection: 'row-reverse', alignItems: 'center', gap: 16, padding: 22 },
  noteIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: DESKTOP_COLORS.brandFocusRing,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteText: { flex: 1, gap: 3 },
  noteTitle: { fontSize: 16.5 },
  noteBody: { fontSize: 15, lineHeight: 22, color: DESKTOP_COLORS.inkMuted },

  // Dock: one small floating line
  dockWrap: { position: 'absolute', left: 0, right: 0, bottom: 20, alignItems: 'center', paddingHorizontal: 24 },
  dock: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 6,
    paddingRight: 14,
    paddingLeft: 6,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    ...webOnly({
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      boxShadow: '0 10px 28px rgba(16,24,40,0.14), 0 2px 6px rgba(16,24,40,0.06)',
    }),
  },
  dockStatus: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  dockBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: DESKTOP_TONES.warn.fg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockBadgeReady: { backgroundColor: '#34C759' },
  dockBadgeText: { fontSize: 12.5, color: '#FFFFFF' },
  dockTitle: { fontSize: 15, color: DESKTOP_COLORS.ink },
  dockTrack: { width: 72, height: 5, borderRadius: 3, backgroundColor: 'rgba(22,34,46,0.08)', overflow: 'hidden' },
  dockFill: {
    height: 5,
    borderRadius: 3,
    backgroundColor: DESKTOP_COLORS.brand,
    ...webOnly({ backgroundImage: 'linear-gradient(90deg, #0088CC, #5FC1F0)' }),
  },
  dockFillReady: { backgroundColor: '#34C759', ...webOnly({ backgroundImage: 'linear-gradient(90deg, #1E9E4C, #34C759)' }) },
  dockCta: {
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 13,
    backgroundColor: DESKTOP_COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({
      backgroundImage: 'linear-gradient(160deg, #1AA0E0 0%, #0088CC 55%, #0075B0 100%)',
      boxShadow: '0 1px 2px rgba(0,136,204,0.3), 0 8px 18px -8px rgba(0,136,204,0.65)',
      transition: 'filter 150ms ease-out, transform 100ms ease-out, background-color 150ms ease-out',
    }),
  },
  dockCtaHover: webOnly({ filter: 'brightness(1.06)' }),
  dockCtaPress: { transform: [{ scale: 0.97 }] },
  dockCtaNext: {
    backgroundColor: '#E6F4FB',
    ...webOnly({ backgroundImage: 'none', boxShadow: 'none' }),
  },
  dockCtaNextHover: { backgroundColor: '#D6EDF9' },
  dockCtaInner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  dockCtaText: { fontSize: 15.5, color: '#FFFFFF' },
  dockCtaNextText: { color: DESKTOP_COLORS.brand, fontSize: 15 },
  busy: { opacity: 0 },
});
