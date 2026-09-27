import React, { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  Platform,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { NavigationContext, StackActions, type NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCompany } from '../../lib/CompanyContext';
import { ROLE_ROUTES } from '../../lib/session';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import type { RootStackParamList } from '../../navigation/types';
import { DK, DK_FONT } from './theme';
// Runtime-only uses: this file is imported by index.tsx itself.
import { DKText, Pressy, useReducedMotion } from './index';

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

const BAR_HEIGHT = 64;
const BAR_WIDTH = 236;
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
    const t = setTimeout(sync, 0);
    return () => {
      off();
      clearTimeout(t);
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

  const shown = ctx?.shown;
  useEffect(() => {
    if (!shown) return;
    Animated.timing(shown, {
      toValue: visible ? 1 : 0,
      // Leaving is quicker than arriving: out of the way at once, back with care.
      duration: visible ? 340 : 220,
      easing: EASE_OUT,
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [shown, visible]);

  const active: Tab | null = route === home ? 'home' : route === 'Menu' ? 'menu' : null;
  const indicator = useRef(new Animated.Value(active === 'menu' ? 1 : 0)).current;
  const indicatorOn = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    if (active) {
      Animated.spring(indicator, {
        toValue: active === 'menu' ? 1 : 0,
        useNativeDriver: NATIVE_DRIVER,
        // Critically damped: it lands, it doesn't wobble.
        stiffness: 420,
        damping: 40,
        mass: 1,
      }).start();
    }
    Animated.timing(indicatorOn, { toValue: active ? 1 : 0, duration: 200, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start();
  }, [active, indicator, indicatorOn]);

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

  const slot = (BAR_WIDTH - 10) / 2;
  const translateY = shown.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : travel, 0] });
  const scale = shown.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 1 : 0.94, 1] });
  // RTL: home sits on the right, the menu on the left.
  const indicatorX = indicator.interpolate({ inputRange: [0, 1], outputRange: [0, -slot] });
  const indicatorScale = indicatorOn.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[styles.host, { bottom, opacity: shown, transform: [{ translateY }, { scale }] }]}
      {...(Platform.OS === 'web' ? ({ role: 'navigation', 'aria-label': 'ניווט ראשי', 'aria-hidden': !visible } as object) : {})}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      <View style={styles.bar}>
        <Animated.View
          pointerEvents="none"
          style={[styles.indicator, { width: slot, opacity: indicatorOn, transform: [{ translateX: indicatorX }, { scale: indicatorScale }] }]}
        />
        <TabButton icon="home" label="בית" selected={active === 'home'} onPress={goHome} />
        <TabButton icon="menu" label="תפריט" selected={active === 'menu'} onPress={goMenu} />
      </View>
    </Animated.View>
  );
}

function TabButton({ icon, label, selected, onPress }: { icon: IconName; label: string; selected: boolean; onPress: () => void }) {
  const color = selected ? DK.onNight : 'rgba(255,255,255,0.62)';
  const glyph = (selected || icon === 'menu' ? icon : `${icon}-outline`) as IconName;
  return (
    <Pressy
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      accessibilityLabel={label}
      style={styles.tab}
      pressScale={0.9}
    >
      <View style={styles.tabInner} {...(Platform.OS === 'web' ? ({ 'aria-current': selected ? 'page' : undefined } as object) : {})}>
        <Ionicons name={glyph} size={23} color={color} />
        <DKText style={[styles.tabLabel, { color, fontFamily: selected ? DK_FONT.bold : DK_FONT.semibold }]}>{label}</DKText>
      </View>
    </Pressy>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
    ...Platform.select({ web: { position: 'fixed' } as object, default: {} }),
  },
  bar: {
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    padding: 5,
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    backgroundColor: 'rgba(10,22,38,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    ...Platform.select({
      web: {
        backgroundColor: 'rgba(11,28,69,0.78)',
        backdropFilter: 'blur(22px) saturate(170%)',
        WebkitBackdropFilter: 'blur(22px) saturate(170%)',
        boxShadow: '0 18px 44px rgba(10,22,38,0.30), 0 3px 10px rgba(10,22,38,0.18), inset 0 1px 0 rgba(255,255,255,0.10)',
      } as object,
      default: { shadowColor: DK.nightInk, shadowOpacity: 0.3, shadowRadius: 22, shadowOffset: { width: 0, height: 14 }, elevation: 12 },
    }),
  },
  indicator: {
    position: 'absolute',
    top: 5,
    right: 5,
    bottom: 5,
    borderRadius: (BAR_HEIGHT - 10) / 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  tab: { flex: 1 },
  tabInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1 },
  tabLabel: { fontSize: 12.5, lineHeight: 16, letterSpacing: 0.2 },
});
