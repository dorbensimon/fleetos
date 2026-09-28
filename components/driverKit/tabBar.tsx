import React, { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { NavigationContext, StackActions, type NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCompany } from '../../lib/CompanyContext';
import { ROLE_ROUTES } from '../../lib/session';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import type { RootStackParamList } from '../../navigation/types';
import { DK, DK_FONT } from './theme';
// Runtime-only uses: this file is imported by index.tsx itself.
import { DKText, useReducedMotion } from './index';
import { t, dirSign } from '../../lib/i18n';

/**
 * The phone's bottom bar: home and the menu, on every signed-in screen.
 * It steps aside while the page scrolls down (the content gets the whole
 * screen) and comes back on the first scroll up, at the top of a page, and
 * on every new screen. Screens with their own pinned action (a save
 * button) and full-screen tools keep the bottom to themselves.
 */

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Route = keyof RootStackParamList;

const NATIVE_DRIVER = Platform.OS !== 'web';
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

const BAR_HEIGHT = 62;
const BAR_WIDTH = 228;
const BAR_PAD = 5;
/** Room a page leaves under its content so the bar never covers its end. */
export const TAB_BAR_SPACE = 76;

/** Screens that own the whole screen or have no signed-in user yet. */
const HIDDEN_ROUTES = new Set<Route>(['Login', 'SetPassword', 'DocusealWebView', 'DriverSignDocument', 'ChecklistMeeting']);

// Distance a finger must travel one way before the bar reacts, so a
// jittery thumb or a list's own settle doesn't make it flicker.
const HIDE_AFTER = 28;
const SHOW_AFTER = 14;
// Near the top of a page the bar always shows.
const TOP_ZONE = 48;

type TabBarContextValue = {
  /** 1 while the bar is on screen, 0 while it is away. Drives what floats above it. */
  shown: Animated.Value;
  /** Whether a bar is present at all (a signed-in phone). */
  present: boolean;
  setPresent: (present: boolean) => void;
  scrollHidden: boolean;
  report: (key: object | string, y: number, max: number) => void;
  resetScroll: () => void;
  holds: number;
  hold: () => () => void;
};

const TabBarContext = createContext<TabBarContextValue | null>(null);

export function TabBarProvider({ children }: { children: ReactNode }) {
  const shown = useRef(new Animated.Value(0)).current;
  const [present, setPresent] = useState(false);
  const [scrollHidden, setScrollHidden] = useState(false);
  const [holds, setHolds] = useState(0);
  const track = useRef(new Map<object | string, { y: number; run: number }>()).current;

  const report = useCallback(
    (key: object | string, rawY: number, max: number) => {
      // iOS rubber-bands past both ends; those frames aren't the reader's intent.
      if (rawY < 0 || (max > 0 && rawY > max)) return;
      const y = rawY;
      const last = track.get(key);
      if (!last) {
        track.set(key, { y, run: 0 });
        return;
      }
      const dy = y - last.y;
      if (dy === 0) return;
      // Accumulate travel in one direction; a reversal starts a new run.
      const run = Math.sign(dy) === Math.sign(last.run) ? last.run + dy : dy;
      track.set(key, { y, run });
      if (y <= TOP_ZONE) setScrollHidden(false);
      else if (run >= HIDE_AFTER) setScrollHidden(true);
      else if (run <= -SHOW_AFTER) setScrollHidden(false);
    },
    [track]
  );

  const resetScroll = useCallback(() => {
    track.clear();
    setScrollHidden(false);
  }, [track]);

  const hold = useCallback(() => {
    setHolds((n) => n + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setHolds((n) => n - 1);
    };
  }, []);

  // On the web one listener hears every scroller on the page (capture
  // phase), so each screen doesn't have to be wired by hand.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onScroll = (event: Event) => {
      const target = event.target as (Element & { scrollTop: number }) | Document | null;
      if (!target) return;
      const el = target instanceof Document ? (target.scrollingElement as HTMLElement | null) : (target as HTMLElement);
      if (!el || typeof el.scrollTop !== 'number') return;
      // Dialogs and sheets scroll inside themselves; the bar is behind them.
      if (el.closest?.('[role="dialog"],[aria-modal="true"]')) return;
      const max = el.scrollHeight - el.clientHeight;
      // Small inner scrollers (a picker column, a short list) aren't the page.
      if (max < 80 || el.clientHeight < 240) return;
      report(el, el.scrollTop, max);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
  }, [report]);

  const value = useMemo(
    () => ({ shown, present, setPresent, scrollHidden, report, resetScroll, holds, hold }),
    [shown, present, scrollHidden, report, resetScroll, holds, hold]
  );
  return <TabBarContext.Provider value={value}>{children}</TabBarContext.Provider>;
}

/**
 * Props for a phone screen's main scroller so the bar can follow it. The
 * web hears every scroller already, so there this is empty.
 */
export function useTabBarScroll(): {
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
} {
  const ctx = useContext(TabBarContext);
  const key = useRef({}).current;
  const report = ctx?.report;
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      report?.(key, contentOffset.y, contentSize.height - layoutMeasurement.height);
    },
    [key, report]
  );
  if (Platform.OS === 'web' || !report) return {};
  return { onScroll, scrollEventThrottle: 16 };
}

/** Extra bottom room a page needs so its last item clears the bar. */
export function useTabBarSpace(): number {
  return useContext(TabBarContext)?.present ? TAB_BAR_SPACE : 0;
}

/**
 * A distance something floating (the add button) rises by while the bar is
 * shown, so it rides above the bar and settles back when the bar leaves.
 */
export function useTabBarLift(distance = TAB_BAR_SPACE): Animated.AnimatedInterpolation<number> | 0 {
  const ctx = useContext(TabBarContext);
  const lift = useMemo(() => ctx?.shown.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] }), [ctx?.shown, distance]);
  return lift ?? 0;
}

/**
 * Keeps the bar away while the calling screen is the one in front — for a
 * page whose own pinned action sits at the bottom.
 */
export function useTabBarHold(active: boolean) {
  const ctx = useContext(TabBarContext);
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  const hold = ctx?.hold;
  useEffect(() => {
    if (active && focused && hold) return hold();
  }, [active, focused, hold]);
}

// ── The bar ───────────────────────────────────────────────────────────────
//
// A capsule of smoked glass floating over the page. The selected tab sits
// under a lens of brand-tinted glass; moving between tabs, the lens flows
// across like a drop (it stretches on the way and settles round), a touch
// swells it, and the arriving icon springs into place.

type Tab = 'home' | 'menu';

export function MobileTabBar({ navigationRef }: { navigationRef: NavigationContainerRefWithCurrent<RootStackParamList> }) {
  const ctx = useContext(TabBarContext);
  const isDesktop = useIsDesktop();
  const { profile } = useCompany();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [route, setRoute] = useState<Route | null>(null);
  const [keyboard, setKeyboard] = useState(false);

  const home = profile?.role ? ROLE_ROUTES[profile.role] : null;
  const enabled = !isDesktop && !!home;
  const setPresent = ctx?.setPresent;
  const resetScroll = ctx?.resetScroll;

  useEffect(() => {
    setPresent?.(enabled);
  }, [enabled, setPresent]);

  // Follow the focused screen; every new screen brings the bar back.
  useEffect(() => {
    const sync = () => {
      if (!navigationRef.isReady()) return;
      const name = (navigationRef.getCurrentRoute()?.name ?? null) as Route | null;
      setRoute((prev) => {
        if (prev !== name) resetScroll?.();
        return name;
      });
    };
    sync();
    const off = navigationRef.addListener('state', sync);
    // The container may not be ready on the first pass.
    const timer = setTimeout(sync, 0);
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [navigationRef, resetScroll]);

  // A typed field needs the bottom of the screen for the keyboard.
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const isField = (el: EventTarget | null) =>
        el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      const onIn = (e: FocusEvent) => isField(e.target) && setKeyboard(true);
      const onOut = (e: FocusEvent) => isField(e.target) && setKeyboard(false);
      document.addEventListener('focusin', onIn);
      document.addEventListener('focusout', onOut);
      return () => {
        document.removeEventListener('focusin', onIn);
        document.removeEventListener('focusout', onOut);
      };
    }
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const visible =
    enabled && !!route && !HIDDEN_ROUTES.has(route) && !keyboard && !(ctx?.scrollHidden ?? false) && (ctx?.holds ?? 0) === 0;

  // `shown` is shared (the add button rides on it) so it moves without
  // overshoot; the bar's own rise is a spring that lands with a little life.
  const shown = ctx?.shown;
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!shown) return;
    Animated.timing(shown, {
      toValue: visible ? 1 : 0,
      // Leaving is quicker than arriving: out of the way at once, back with care.
      duration: visible ? 320 : 200,
      easing: EASE_OUT,
      useNativeDriver: NATIVE_DRIVER,
    }).start();
    (visible
      ? Animated.spring(rise, { toValue: 1, stiffness: 300, damping: 22, mass: 1, useNativeDriver: NATIVE_DRIVER })
      : Animated.timing(rise, { toValue: 0, duration: 200, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER })
    ).start();
  }, [shown, rise, visible]);

  const active: Tab | null = route === home ? 'home' : route === 'Menu' ? 'menu' : null;
  const lensAt = useRef(new Animated.Value(active === 'menu' ? 1 : 0)).current;
  const lensOn = useRef(new Animated.Value(active ? 1 : 0)).current;
  const stretch = useRef(new Animated.Value(0)).current;
  const swell = useRef(new Animated.Value(0)).current;
  const lastActive = useRef(active);
  useEffect(() => {
    const from = lastActive.current;
    lastActive.current = active;
    if (active) {
      Animated.spring(lensAt, {
        toValue: active === 'menu' ? 1 : 0,
        useNativeDriver: NATIVE_DRIVER,
        stiffness: reduce ? 900 : 320,
        damping: reduce ? 80 : 30,
        mass: 1,
      }).start();
      // Tab to tab, the lens pulls long in flight and rounds off as it lands.
      if (from && from !== active && !reduce) {
        stretch.setValue(0);
        Animated.sequence([
          Animated.timing(stretch, { toValue: 1, duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
          Animated.spring(stretch, { toValue: 0, stiffness: 260, damping: 14, mass: 1, useNativeDriver: NATIVE_DRIVER }),
        ]).start();
      }
    }
    Animated.timing(lensOn, { toValue: active ? 1 : 0, duration: 220, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start();
  }, [active, lensAt, lensOn, stretch, reduce]);

  const press = (down: boolean) => {
    if (reduce) return;
    (down
      ? Animated.timing(swell, { toValue: 1, duration: 140, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER })
      : Animated.spring(swell, { toValue: 0, stiffness: 380, damping: 18, mass: 1, useNativeDriver: NATIVE_DRIVER })
    ).start();
  };

  if (!ctx || !enabled || !shown || !home) return null;

  const bottom = Math.max(insets.bottom - 8, 14);
  const travel = BAR_HEIGHT + bottom + 24;

  const goHome = () => {
    if (!navigationRef.isReady()) return;
    const routes = navigationRef.getRootState()?.routes ?? [];
    if (route === home) return;
    // Back through the stack when home is under us (its scroll and filters
    // stay as they were); otherwise start over from home.
    if (routes.some((r) => r.name === home)) navigationRef.dispatch(StackActions.popTo(home));
    else navigationRef.reset({ index: 0, routes: [{ name: home }] });
  };

  const goMenu = () => {
    if (!navigationRef.isReady() || route === 'Menu') return;
    const routes = navigationRef.getRootState()?.routes ?? [];
    if (routes.some((r) => r.name === 'Menu')) navigationRef.dispatch(StackActions.popTo('Menu'));
    else navigationRef.navigate('Menu');
  };

  const slot = (BAR_WIDTH - BAR_PAD * 2) / 2;
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : travel, 0] });
  const barScale = rise.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 1 : 0.9, 1] });
  // RTL: home sits on the right, the menu on the left.
  const lensX = lensAt.interpolate({ inputRange: [0, 1], outputRange: [0, -slot * dirSign()] });
  const lensScaleX = Animated.add(
    Animated.add(lensOn.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }), stretch.interpolate({ inputRange: [0, 1], outputRange: [0, 0.34] })),
    swell.interpolate({ inputRange: [0, 1], outputRange: [0, 0.08] })
  );
  const lensScaleY = Animated.add(
    Animated.add(lensOn.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }), stretch.interpolate({ inputRange: [0, 1], outputRange: [0, -0.16] })),
    swell.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] })
  );
  const sheen = swell.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[styles.host, { bottom, opacity: shown, transform: [{ translateY }, { scale: barScale }] }]}
      {...(Platform.OS === 'web' ? ({ role: 'navigation', 'aria-label': t('nav.mainNavigation'), 'aria-hidden': !visible } as object) : {})}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      <View style={styles.shadow}>
        <View style={styles.bar}>
          <Glass />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.lens,
              { width: slot, opacity: lensOn, transform: [{ translateX: lensX }, { scaleX: lensScaleX }, { scaleY: lensScaleY }] },
            ]}
          >
            <LinearGradient
              colors={['rgba(140,168,255,0.55)', 'rgba(47,91,255,0.38)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {/* The rim light across the lens's upper edge. */}
            <LinearGradient
              colors={['rgba(255,255,255,0.42)', 'rgba(255,255,255,0)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <Animated.View style={[StyleSheet.absoluteFill, styles.lensSheen, { opacity: sheen }]} />
          </Animated.View>
          <TabButton icon="home" label={t('nav.home')} selected={active === 'home'} onPress={goHome} onPressChange={press} reduce={reduce} />
          <TabButton icon="grid" label={t('nav.menu')} selected={active === 'menu'} onPress={goMenu} onPressChange={press} reduce={reduce} />
        </View>
      </View>
    </Animated.View>
  );
}

/** The glass itself: a live blur of the page behind, smoked, with light on its upper edge. */
function Glass() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glassClip]}>
      {Platform.OS !== 'web' ? (
        <BlurView tint={Platform.OS === 'ios' ? 'systemChromeMaterialDark' : 'dark'} intensity={70} style={StyleSheet.absoluteFill} />
      ) : null}
      <LinearGradient
        colors={['rgba(30,52,104,0.74)', 'rgba(10,22,38,0.86)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* A soft specular bloom where light would strike the capsule. */}
      <LinearGradient
        colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.55, y: 0.75 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, styles.glassRim]} />
    </View>
  );
}

function TabButton({
  icon,
  label,
  selected,
  onPress,
  onPressChange,
  reduce,
}: {
  icon: 'home' | 'grid';
  label: string;
  selected: boolean;
  onPress: () => void;
  onPressChange: (down: boolean) => void;
  reduce: boolean;
}) {
  const squeeze = useRef(new Animated.Value(1)).current;
  const pop = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const [ring, setRing] = useState(false);

  // The arriving icon springs up into the lens; the leaving one settles.
  const wasSelected = useRef(selected);
  useEffect(() => {
    if (wasSelected.current === selected) return;
    wasSelected.current = selected;
    if (reduce) {
      pop.setValue(selected ? 1 : 0);
      return;
    }
    if (selected) {
      pop.setValue(0);
      Animated.spring(pop, { toValue: 1, stiffness: 340, damping: 13, mass: 1, useNativeDriver: NATIVE_DRIVER }).start();
    } else {
      Animated.timing(pop, { toValue: 0, duration: 180, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start();
    }
  }, [selected, pop, reduce]);

  const to = (value: number) =>
    (value < 1
      ? Animated.timing(squeeze, { toValue: value, duration: 110, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER })
      : Animated.spring(squeeze, { toValue: 1, stiffness: 420, damping: 16, mass: 1, useNativeDriver: NATIVE_DRIVER })
    ).start();

  const iconScale = Animated.multiply(squeeze, pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }));
  const iconLift = pop.interpolate({ inputRange: [0, 1], outputRange: [0, -1] });
  const color = selected ? '#FFFFFF' : 'rgba(255,255,255,0.58)';
  const glyph = (selected ? icon : `${icon}-outline`) as IconName;

  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      onPressIn={() => {
        if (!reduce) to(0.86);
        if (selected) onPressChange(true);
      }}
      onPressOut={() => {
        to(1);
        onPressChange(false);
      }}
      onFocus={(e) => setRing(isFocusVisible(e))}
      onBlur={() => setRing(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.tab, ring && styles.tabRing]}
      {...(Platform.OS === 'web' ? ({ 'aria-current': selected ? 'page' : undefined } as object) : {})}
    >
      <Animated.View style={[styles.tabInner, { transform: [{ translateY: iconLift }, { scale: iconScale }] }]}>
        <Ionicons name={glyph} size={22} color={color} />
        <DKText style={[styles.tabLabel, { color, fontFamily: selected ? DK_FONT.bold : DK_FONT.semibold }]}>{label}</DKText>
      </Animated.View>
    </Pressable>
  );
}

function isFocusVisible(event: unknown): boolean {
  if (Platform.OS !== 'web') return false;
  const target = (event as { nativeEvent?: { target?: unknown } })?.nativeEvent?.target;
  try {
    return !!(target as Element | undefined)?.matches?.(':focus-visible');
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    start: 0,
    end: 0,
    alignItems: 'center',
    zIndex: 50,
    ...Platform.select({ web: { position: 'fixed' } as object, default: {} }),
  },
  // The shadow lives outside the clipped glass so the clip doesn't cut it off.
  shadow: {
    borderRadius: BAR_HEIGHT / 2,
    ...Platform.select({
      web: {
        boxShadow: '0 22px 48px -8px rgba(10,22,38,0.42), 0 6px 16px rgba(10,22,38,0.20), 0 0 0 0.5px rgba(10,22,38,0.35)',
      } as object,
      default: { shadowColor: DK.nightInk, shadowOpacity: 0.34, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 14 },
    }),
  },
  bar: {
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    padding: BAR_PAD,
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(24px) saturate(185%)',
        WebkitBackdropFilter: 'blur(24px) saturate(185%)',
      } as object,
      default: {},
    }),
  },
  glassClip: { borderRadius: BAR_HEIGHT / 2, overflow: 'hidden' },
  glassRim: {
    borderRadius: BAR_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.16)',
    ...Platform.select({
      web: {
        borderWidth: 0,
        boxShadow:
          'inset 0 1px 0.5px rgba(255,255,255,0.38), inset 0 -1px 1px rgba(255,255,255,0.07), inset 0 0 0 0.5px rgba(255,255,255,0.16)',
      } as object,
      default: {},
    }),
  },
  lens: {
    position: 'absolute',
    top: BAR_PAD,
    end: BAR_PAD,
    bottom: BAR_PAD,
    borderRadius: (BAR_HEIGHT - BAR_PAD * 2) / 2,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(200,215,255,0.34)',
    ...Platform.select({
      web: {
        borderWidth: 0,
        boxShadow:
          '0 6px 18px -4px rgba(47,91,255,0.55), inset 0 1px 0.5px rgba(255,255,255,0.55), inset 0 -1px 1px rgba(255,255,255,0.12), inset 0 0 0 0.5px rgba(200,215,255,0.35)',
      } as object,
      default: { shadowColor: DK.accent, shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
    }),
  },
  lensSheen: { backgroundColor: 'rgba(255,255,255,0.14)' },
  tab: {
    flex: 1,
    borderRadius: (BAR_HEIGHT - BAR_PAD * 2) / 2,
    ...Platform.select({ web: { outlineStyle: 'none', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' } as object, default: {} }),
  },
  tabRing: Platform.select({
    web: { outlineStyle: 'solid', outlineWidth: 2, outlineColor: '#8CA8FF', outlineOffset: -2 } as object,
    default: {},
  }) as object,
  tabInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabLabel: { fontSize: 11.5, lineHeight: 14, letterSpacing: 0.3 },
});
