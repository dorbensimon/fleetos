import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, type ScrollView, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Lands the user on the exact field a notification or task is about: the
 * screen gets `focus` (one key or several, e.g. from a route param), every
 * <FocusTarget> with a matching id lights up for a moment, and the page
 * scrolls to the first one in the order the keys were given.
 */

type Registry = Map<string, View>;

interface FocusContext {
  keys: readonly string[];
  register: (id: string, node: View) => void;
}

const Ctx = createContext<FocusContext>({ keys: [], register: () => {} });

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const NATIVE_DRIVER = Platform.OS !== 'web';

/** "license_expiry,license_number" or ['license_expiry'] -> ['license_expiry', 'license_number']. */
export function focusKeys(focus: string | readonly string[] | null | undefined): string[] {
  if (!focus) return [];
  const list = typeof focus === 'string' ? focus.split(',') : focus;
  return list.map((key) => key.trim()).filter(Boolean);
}

function scrollToNode(node: View, scrollRef: RefObject<ScrollView | null> | undefined, reduce: boolean) {
  if (Platform.OS === 'web') {
    const element = node as unknown as { scrollIntoView?: (options: ScrollIntoViewOptions) => void };
    element.scrollIntoView?.({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    return;
  }
  const scroll = scrollRef?.current as (ScrollView & { getInnerViewRef?: () => unknown; getInnerViewNode?: () => unknown }) | null | undefined;
  if (!scroll) return;
  const inner = scroll.getInnerViewRef?.() ?? scroll.getInnerViewNode?.();
  if (!inner) return;
  node.measureLayout(
    inner as never,
    (_x, y) => scroll.scrollTo({ y: Math.max(0, y - 140), animated: !reduce }),
    () => {},
  );
}

function useReduceMotion() {
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

export function FocusTargetProvider({
  focus,
  scrollRef,
  children,
}: {
  focus?: string | readonly string[] | null;
  /** The page's ScrollView on iOS/Android. The web scrolls the element itself into view. */
  scrollRef?: RefObject<ScrollView | null>;
  children: ReactNode;
}) {
  const joined = focusKeys(focus).join(',');
  const keys = useMemo(() => focusKeys(joined), [joined]);
  const registry = useRef<Registry>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrolledFor = useRef('');
  const reduce = useReduceMotion();

  useEffect(() => {
    registry.current.clear();
    scrolledFor.current = '';
  }, [joined]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Targets register as they mount (data may still be loading); scroll once,
  // shortly after the last of them arrives, to the first key that exists.
  const register = useCallback((id: string, node: View) => {
    registry.current.set(id, node);
    if (scrolledFor.current === joined) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const first = keys.find((key) => registry.current.has(key));
      const target = first ? registry.current.get(first) : null;
      if (!target) return;
      scrolledFor.current = joined;
      scrollToNode(target, scrollRef, reduce);
    }, 220);
  }, [joined, keys, scrollRef, reduce]);

  const value = useMemo(() => ({ keys, register }), [keys, register]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Wraps one field or row. `id` may list several keys ("license_expiry,license")
 * when one row stands for more than one thing.
 */
export function FocusTarget({
  id,
  children,
  style,
  radius = 12,
  tint = '#2F5BFF',
}: {
  id: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  tint?: string;
}) {
  const { keys, register } = useContext(Ctx);
  const ids = useMemo(() => focusKeys(id), [id]);
  const match = ids.find((key) => keys.includes(key)) ?? null;
  const node = useRef<View>(null);
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!match || !node.current) return;
    register(match, node.current);
    glow.setValue(0);
    const run = Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 200, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }),
      Animated.delay(2200),
      Animated.timing(glow, { toValue: 0, duration: 700, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }),
    ]);
    run.start();
    return () => run.stop();
  }, [match, register, glow]);

  return (
    <View ref={node} style={style} collapsable={false}>
      {children}
      {!!match && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.glow,
            { borderRadius: radius, borderColor: tint, backgroundColor: `${tint}14`, opacity: glow },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { borderWidth: 2, margin: -2 },
});
