// סרגל הלשוניות הצף בתחתית הטלפון
import React, { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { CommonActions, NavigationContext, StackActions, type NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCompany } from '../../lib/CompanyContext';
import { ROLE_ROUTES } from '../../lib/session';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import type { RootStackParamList } from '../../navigation/types';
import { BrandLogo } from '../ui/Brand';
// Runtime-only uses: this file is imported by index.tsx itself.
import { useReducedMotion } from './index';
import { t, dirSign } from '../../lib/i18n';

/**
 * The phone's bottom bar, drawn like iOS 26's: a floating capsule of light
 * glass with a tab per main place for the role (the manager: home, drivers,
 * vehicles, menu; the driver: home, vehicle, documents, menu; the owner: home,
 * companies, notifications, menu; alerts live in the title bar).
 * It steps aside while the page scrolls down (the content gets the whole
 * screen) and comes back on the first scroll up, at the top of a page, and
 * on every new screen. Screens with their own pinned action (a save
 * button) and full-screen tools keep the bottom to themselves.
 */

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Route = keyof RootStackParamList;

// האם האנימציה רצה בטלפון
const NATIVE_DRIVER = Platform.OS !== 'web';
// עקומת אנימציה
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

// גובה הסרגל
const BAR_HEIGHT = 62;
// הרוחב המרבי של הסרגל
const BAR_MAX_WIDTH = 440;
// המרווח מקצות המסך
const BAR_SIDE = 21;
// ריווח פנימי
const BAR_PAD = 4;
// צבע הלשונית הנבחרת (הכחול של iOS)
const TINT = '#007AFF';
// צבע לשונית שלא נבחרה
const INK = '#1C1C1E';
// הגופן של המערכת (SF באייפון), כמו בסרגל המקורי
const SYSTEM_FONT = Platform.OS === 'web' ? '-apple-system, BlinkMacSystemFont, system-ui, sans-serif' : undefined;
// קפיצי התנועה של הבועה (תגובה ושיכוך כמו ב-iOS)
/** Lifting into a drop: response 0.3s, damping 0.8. */
const SPRING_LIFT = { stiffness: 440, damping: 34, mass: 1 };
/** Travelling between tabs: response 0.35s, damping 0.8. */
const SPRING_SLIDE = { stiffness: 320, damping: 29, mass: 1 };
/** Settling back into the platter: response 0.4s, damping 0.75 (a soft squash). */
const SPRING_SETTLE = { stiffness: 250, damping: 24, mass: 1 };
// כמה הבועה גדלה כשהיא מורמת, וכמה האייקון שמתחתיה מוגדל
const LIFT_SCALE_X = 1.16;
const LIFT_SCALE_Y = 1.36;
const MAGNIFY = 1.16;

// מקום שהדף משאיר מתחת לתוכן
/** Room a page leaves under its content so the bar never covers its end. */
export const TAB_BAR_SPACE = 76;

// מסכים בלי סרגל
/** Screens that own the whole screen or have no signed-in user yet. */
const HIDDEN_ROUTES = new Set<Route>(['Login', 'SetPassword', 'CompanyPicker', 'DocusealWebView', 'DriverSignDocument', 'ChecklistMeeting']);

// כמה גלילה למטה מסתירה את הסרגל
// Distance a finger must travel one way before the bar reacts, so a
// jittery thumb or a list's own settle doesn't make it flicker.
const HIDE_AFTER = 28;
// כמה גלילה למעלה מחזירה אותו
const SHOW_AFTER = 14;
// ליד ראש הדף הסרגל תמיד מוצג
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

// מצב הסרגל המשותף
const TabBarContext = createContext<TabBarContextValue | null>(null);

// מנהל את הסתרת והצגת הסרגל
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

// מחבר גלילה של מסך לסרגל
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

// מאפס את מעקב הגלילה (הסרגל חוזר ולא מגיב לקפיצה הבאה)
/**
 * Forgets where every scroller was and brings the bar back. A screen calls
 * it right before it jumps its own scroller, so the jump doesn't read as the
 * reader scrolling down and send the bar away.
 */
export function useTabBarReset(): () => void {
  const reset = useContext(TabBarContext)?.resetScroll;
  return useCallback(() => reset?.(), [reset]);
}

// כמה מקום להשאיר בתחתית
/** Extra bottom room a page needs so its last item clears the bar. */
export function useTabBarSpace(): number {
  return useContext(TabBarContext)?.present ? TAB_BAR_SPACE : 0;
}

// כמה להרים כפתור צף מעל הסרגל
/**
 * A distance something floating (the add button) rises by while the bar is
 * shown, so it rides above the bar and settles back when the bar leaves.
 */
export function useTabBarLift(distance = TAB_BAR_SPACE): Animated.AnimatedInterpolation<number> | 0 {
  const ctx = useContext(TabBarContext);
  const lift = useMemo(() => ctx?.shown.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] }), [ctx?.shown, distance]);
  return lift ?? 0;
}

// מסתיר את הסרגל במסך מסוים
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

// הלוגו באמצע הכותרת: לחיצה מחזירה למסך הבית
/** The logo in the middle of a phone title bar (a row of buttons); a tap goes home, like the bar's home tab. */
export function HomeLogo() {
  const navigation = useContext(NavigationContext);
  const { profile } = useCompany();
  const isDesktop = useIsDesktop();
  const home = profile?.role ? ROLE_ROUTES[profile.role] : null;
  if (isDesktop || !navigation || !home) return null;
  const goHome = () => {
    const routes = navigation.getState()?.routes ?? [];
    if (routes.some((r) => r.name === home)) navigation.dispatch(StackActions.popTo(home));
    else navigation.reset({ index: 0, routes: [{ name: home }] });
  };
  return (
    <View style={[styles.homeLogo, { pointerEvents: 'box-none' }]}>
      <Pressable onPress={goHome} accessibilityRole="button" accessibilityLabel={t('nav.home')} hitSlop={10}>
        <BrandLogo height={20} onDark />
      </Pressable>
    </View>
  );
}

// ── The bar ───────────────────────────────────────────────────────────────
//
// A capsule of clear glass floating over the page, as in iOS 26. The selected
// tab rests on a soft gray platter. Touching the bar lifts the platter into a
// clear drop of glass, bigger than the bar, that magnifies the tab under it;
// the drop follows the finger (tap or slide) and settles back into a platter
// on the tab it lands on.

type Glyph = 'home' | 'people' | 'car-sport' | 'grid' | 'folder' | 'business' | 'notifications';
type TabDef = { key: string; icon: Glyph; label: string; go: () => void };
type Current = { name: Route; params?: Record<string, unknown> } | null;

// הסרגל עצמו
export function MobileTabBar({ navigationRef }: { navigationRef: NavigationContainerRefWithCurrent<RootStackParamList> }) {
  const ctx = useContext(TabBarContext);
  const isDesktop = useIsDesktop();
  const { profile } = useCompany();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const [current, setCurrent] = useState<Current>(null);
  const route = current?.name ?? null;
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
      const now = navigationRef.getCurrentRoute();
      const name = (now?.name ?? null) as Route | null;
      setCurrent((prev) => {
        if (prev?.name !== name) resetScroll?.();
        return name ? { name, params: now?.params as Record<string, unknown> | undefined } : null;
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

  // Goes to a tab's screen: back through the stack when it is already under us
  // (its scroll and filters stay as they were), otherwise forward to it.
  const goTo = (name: Route, params?: object) => {
    if (!navigationRef.isReady()) return;
    const routes = navigationRef.getRootState()?.routes ?? [];
    const nav = navigationRef as unknown as { navigate: (n: Route, p?: object) => void };
    // Already in front: just hand it the new params.
    if (navigationRef.getCurrentRoute()?.name === name) navigationRef.dispatch({ ...CommonActions.setParams(params ?? {}), source: navigationRef.getCurrentRoute()?.key });
    else if (name === home && !routes.some((r) => r.name === home)) navigationRef.reset({ index: 0, routes: [{ name: home, params } as never] });
    else if (routes.some((r) => r.name === name)) navigationRef.dispatch(StackActions.popTo(name, params));
    else nav.navigate(name, params);
  };

  const tabs: TabDef[] =
    profile?.role === 'admin'
      ? [
          { key: 'menu', icon: 'grid', label: t('nav.menu'), go: () => goTo('Menu') },
          { key: 'drivers', icon: 'people', label: t('common.drivers'), go: () => goTo('AdminHome', { mode: 'drivers', list: true }) },
          { key: 'vehicles', icon: 'car-sport', label: t('common.vehicles'), go: () => goTo('AdminHome', { mode: 'vehicles', list: true }) },
          { key: 'home', icon: 'home', label: t('nav.home'), go: () => goTo('AdminHome', { mode: current?.params?.mode, list: false }) },
        ]
      : profile?.role === 'driver'
      ? [
          { key: 'menu', icon: 'grid', label: t('nav.menu'), go: () => goTo('Menu') },
          { key: 'vehicle', icon: 'car-sport', label: t('driver.myVehicle'), go: () => goTo('DriverVehicle') },
          { key: 'documents', icon: 'folder', label: t('common.documents'), go: () => goTo('DriverDocuments') },
          { key: 'home', icon: 'home', label: t('nav.home'), go: () => goTo('DriverHome') },
        ]
      : profile?.role === 'owner'
      ? [
          { key: 'menu', icon: 'grid', label: t('nav.menu'), go: () => goTo('Menu') },
          { key: 'notifications', icon: 'notifications', label: t('notifications.title'), go: () => goTo('Notifications') },
          { key: 'companies', icon: 'business', label: t('owner.notif.companies'), go: () => goTo('OwnerHome', { list: true }) },
          { key: 'home', icon: 'home', label: t('nav.home'), go: () => goTo('OwnerHome', { list: false }) },
        ]
      : [
          { key: 'menu', icon: 'grid', label: t('nav.menu'), go: () => goTo('Menu') },
          { key: 'home', icon: 'home', label: t('nav.home'), go: () => home && goTo(home) },
        ];

  // Which tab the screen in front belongs to. The manager's drivers and
  // vehicles are the home screen's own lists, opened from the tab.
  const active: string | null =
    route === 'AdminHome'
      ? String(current?.params?.list) === 'true'
        ? current?.params?.mode === 'vehicles'
          ? 'vehicles'
          : 'drivers'
        : 'home'
      : route === 'OwnerHome'
      ? String(current?.params?.list) === 'true'
        ? 'companies'
        : 'home'
      : route === home
      ? 'home'
      : route === 'Notifications' && profile?.role === 'owner'
      ? 'notifications'
      : route === 'Menu'
      ? 'menu'
      : route === 'DriverVehicle'
      ? 'vehicle'
      : route === 'DriverDocuments'
      ? 'documents'
      : null;
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.key === active));
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  // The selection, iOS 26 style. `lensAt` is where it sits, in tab units (it
  // slides through fractions). `lift` takes it from the resting gray platter
  // (0) to a clear drop of glass bigger than the bar (1): it lifts on touch,
  // travels, and settles back down into the platter where it lands.
  const lensAt = useRef(new Animated.Value(activeIndex)).current;
  const lensOn = useRef(new Animated.Value(active ? 1 : 0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(0)).current;
  const touching = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<View>(null);
  const barLeft = useRef(0);
  const centers = useRef<number[]>([]);

  const fx = useRef({
    slideTo: (_i: number) => {},
    raise: () => {},
    settleSoon: (_ms: number) => {},
    indexAtX: (_x: number): number => 0,
  }).current;
  fx.slideTo = (index) =>
    reduce ? lensAt.setValue(index) : Animated.spring(lensAt, { toValue: index, ...SPRING_SLIDE, useNativeDriver: NATIVE_DRIVER }).start();
  fx.raise = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    if (!reduce) Animated.spring(lift, { toValue: 1, ...SPRING_LIFT, useNativeDriver: NATIVE_DRIVER }).start();
  };
  fx.settleSoon = (ms) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      if (touching.current) return;
      fx.slideTo(activeRef.current);
      Animated.spring(lift, { toValue: 0, ...SPRING_SETTLE, useNativeDriver: NATIVE_DRIVER }).start();
    }, ms);
  };
  // The finger's place on the bar, in tab units.
  fx.indexAtX = (pageX) => {
    const [c0, c1] = centers.current;
    if (c0 == null || c1 == null || c0 === c1) return activeRef.current;
    const at = (pageX - barLeft.current - c0) / (c1 - c0);
    return Math.min(tabsRef.current.length - 1, Math.max(0, at));
  };
  const measureBar = () => barRef.current?.measure((_x, _y, _w, _h, pageX) => (barLeft.current = pageX));

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  const lastActive = useRef(active);
  useEffect(() => {
    const from = lastActive.current;
    lastActive.current = active;
    Animated.timing(lensOn, { toValue: active ? 1 : 0, duration: 220, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start();
    if (!active) return;
    fx.slideTo(activeIndex);
    if (!from || from === active || reduce) return;
    // Tab to tab, the drop pulls long in flight and rounds off as it lands.
    stretch.setValue(0);
    Animated.sequence([
      Animated.timing(stretch, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
      Animated.spring(stretch, { toValue: 0, ...SPRING_SETTLE, useNativeDriver: NATIVE_DRIVER }),
    ]).start();
    // Changed by the finger or from elsewhere (back, a link): lift, travel, settle.
    fx.raise();
    fx.settleSoon(280);
  }, [active, activeIndex, lensOn, stretch, reduce, fx]);

  // Sliding a finger along the bar drags the drop with it, like iOS. Plain
  // pointer events: the web responder drops moves that start on a button.
  const dragging = useRef<{ id: number; x: number; on: boolean } | null>(null);
  const swallowClick = useRef(false);
  const dragHandlers =
    Platform.OS === 'web'
      ? {
          onPointerDown: (e: { pointerId: number; clientX: number }) => {
            dragging.current = { id: e.pointerId, x: e.clientX, on: false };
            measureBar();
          },
          onPointerMove: (e: { pointerId: number; clientX: number; currentTarget: Element }) => {
            const d = dragging.current;
            if (!d || d.id !== e.pointerId) return;
            if (!d.on) {
              if (Math.abs(e.clientX - d.x) < 8) return;
              d.on = true;
              touching.current = true;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              fx.raise();
            }
            lensAt.setValue(fx.indexAtX(e.clientX));
          },
          onPointerUp: (e: { pointerId: number; clientX: number }) => {
            const d = dragging.current;
            dragging.current = null;
            if (!d?.on || d.id !== e.pointerId) return;
            touching.current = false;
            // The click that follows the lift belongs to the drag, not to a tab.
            swallowClick.current = true;
            setTimeout(() => (swallowClick.current = false), 0);
            const i = Math.round(fx.indexAtX(e.clientX));
            fx.slideTo(i);
            tabsRef.current[i]?.go();
            fx.settleSoon(i === activeRef.current ? 120 : 400);
          },
          onPointerCancel: () => {
            if (!dragging.current?.on) return void (dragging.current = null);
            dragging.current = null;
            touching.current = false;
            fx.settleSoon(0);
          },
        }
      : {};

  if (!ctx || !enabled || !shown || !home) return null;

  const bottom = Math.max(insets.bottom - 8, 14);
  const travel = BAR_HEIGHT + bottom + 24;

  const barWidth = Math.min(screenWidth - BAR_SIDE * 2, BAR_MAX_WIDTH);
  const slot = (barWidth - BAR_PAD * 2) / tabs.length;
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : travel, 0] });
  const barScale = rise.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 1 : 0.9, 1] });
  // RTL: the menu sits on the right, home on the left.
  const lensX = Animated.multiply(lensAt, -slot * dirSign());
  const lensScaleX = Animated.add(
    Animated.add(lift.interpolate({ inputRange: [0, 1], outputRange: [1, LIFT_SCALE_X] }), stretch.interpolate({ inputRange: [0, 1], outputRange: [0, 0.14] })),
    lensOn.interpolate({ inputRange: [0, 1], outputRange: [-0.2, 0] })
  );
  const lensScaleY = Animated.add(
    Animated.add(lift.interpolate({ inputRange: [0, 1], outputRange: [1, LIFT_SCALE_Y] }), stretch.interpolate({ inputRange: [0, 1], outputRange: [0, -0.06] })),
    lensOn.interpolate({ inputRange: [0, 1], outputRange: [-0.2, 0] })
  );
  const platterOpacity = Animated.multiply(lensOn, lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' }));
  const glassOpacity = lift.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  // A tab is tinted as the selection passes over it, magnified while the drop is lifted.
  const shownSel = Animated.add(lensOn, lift).interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 1], extrapolate: 'clamp' });

  return (
    <>
    {/* iOS "scroll edge": the page softly blurs and fades under the bar. */}
    {Platform.OS === 'web' ? <Animated.View style={[styles.edge, { height: BAR_HEIGHT + bottom + 28, opacity: shown }, { pointerEvents: 'none' }]} /> : null}
    <Animated.View
      style={[styles.host, { bottom, opacity: shown, transform: [{ translateY }, { scale: barScale }] }, { pointerEvents: visible ? 'box-none' : 'none' }]}
      {...(Platform.OS === 'web' ? ({ role: 'navigation', 'aria-label': t('nav.mainNavigation'), 'aria-hidden': !visible } as object) : {})}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      {/* On web an Animated.View writes 'box-none' inline as plain 'none', which
          the bar would inherit; the bar takes its touches back here. */}
      <View style={[styles.shadow, { pointerEvents: visible ? 'auto' : 'none' }]}>
        <View ref={barRef} onLayout={measureBar} style={[styles.bar, { width: barWidth }]} {...(dragHandlers as object)}>
          <Glass />
          <Animated.View
            style={[styles.lens, { width: slot, transform: [{ translateX: lensX }, { scaleX: lensScaleX }, { scaleY: lensScaleY }] }, { pointerEvents: 'none' }]}
          >
            <Animated.View style={[styles.lensFill, styles.platter, { opacity: platterOpacity }]} />
            <Animated.View style={[styles.lensFill, styles.drop, { opacity: glassOpacity }]} />
          </Animated.View>
          {tabs.map((tab, i) => {
            const near = lensAt.interpolate({ inputRange: [i - 1, i, i + 1], outputRange: [0, 1, 0], extrapolate: 'clamp' });
            return (
              <TabButton
                key={tab.key}
                icon={tab.icon}
                label={tab.label}
                selected={active === tab.key}
                tint={Animated.multiply(
                  lensAt.interpolate({ inputRange: [i - 0.65, i - 0.35, i + 0.35, i + 0.65], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' }),
                  shownSel
                )}
                magnify={Animated.multiply(near, lift)}
                onPress={() => !swallowClick.current && tab.go()}
                onPressIn={() => {
                  measureBar();
                  touching.current = true;
                  fx.raise();
                  fx.slideTo(i);
                }}
                onPressOut={() => {
                  touching.current = false;
                  fx.settleSoon(160);
                }}
                onCenter={(x) => (centers.current[i] = x)}
              />
            );
          })}
        </View>
      </View>
    </Animated.View>
    </>
  );
}

// אפקט הזכוכית של הסרגל
/** The glass itself: a live blur of the page behind, with light caught on its rim. */
function Glass() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.glassClip, { pointerEvents: 'none' }]}>
      {Platform.OS !== 'web' ? (
        <BlurView tint={Platform.OS === 'ios' ? 'systemChromeMaterialLight' : 'light'} intensity={80} style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.glassTint]} />
      <View style={[StyleSheet.absoluteFill, styles.glassRim]} />
    </View>
  );
}

const WEB_HIDDEN = Platform.OS === 'web' ? ({ 'aria-hidden': true } as object) : {};

// כפתור לשונית
function TabButton({
  icon,
  label,
  selected,
  tint,
  magnify,
  onPress,
  onPressIn,
  onPressOut,
  onCenter,
}: {
  icon: Glyph;
  label: string;
  selected: boolean;
  tint: Animated.AnimatedMultiplication<number>;
  magnify: Animated.AnimatedMultiplication<number>;
  onPress: () => void;
  onPressIn: () => void;
  onPressOut: () => void;
  onCenter: (x: number) => void;
}) {
  const [ring, setRing] = useState(false);
  const glyph = icon as IconName;
  const scale = magnify.interpolate({ inputRange: [0, 1], outputRange: [1, MAGNIFY] });
  const ink = tint.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onLayout={(e) => onCenter(e.nativeEvent.layout.x + e.nativeEvent.layout.width / 2)}
      onFocus={(e) => setRing(isFocusVisible(e))}
      onBlur={() => setRing(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.tab, ring && styles.tabRing]}
      {...(Platform.OS === 'web' ? ({ 'aria-current': selected ? 'page' : undefined } as object) : {})}
    >
      <Animated.View style={[styles.tabInner, { transform: [{ scale }] }]}>
        {/* The blue copy fades in over the black one as the selection passes. */}
        <View>
          <Animated.View style={{ opacity: ink }}>
            <Ionicons name={glyph} size={24} color={INK} />
          </Animated.View>
          <Animated.View style={[styles.over, { opacity: tint }]} {...WEB_HIDDEN}>
            <Ionicons name={glyph} size={24} color={TINT} />
          </Animated.View>
        </View>
        <View>
          <Animated.Text style={[styles.tabLabel, { color: INK, opacity: ink }]} numberOfLines={1}>
            {label}
          </Animated.Text>
          <Animated.Text style={[styles.tabLabel, styles.over, { color: TINT, opacity: tint }]} numberOfLines={1} {...WEB_HIDDEN}>
            {label}
          </Animated.Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// האם להציג מסגרת מיקוד
function isFocusVisible(event: unknown): boolean {
  if (Platform.OS !== 'web') return false;
  const target = (event as { nativeEvent?: { target?: unknown } })?.nativeEvent?.target;
  try {
    return !!(target as Element | undefined)?.matches?.(':focus-visible');
  } catch {
    return false;
  }
}

// עיצוב הסרגל
const styles = StyleSheet.create({
  homeLogo: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
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
      web: { boxShadow: '0 6px 24px rgba(0,0,0,0.10), 0 0 1px rgba(0,0,0,0.10)' } as object,
      default: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
    }),
  },
  // הסרגל
  bar: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    padding: BAR_PAD,
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    ...Platform.select({
      web: {
        touchAction: 'none',
        backdropFilter: 'blur(12px) saturate(190%) brightness(1.05)',
        WebkitBackdropFilter: 'blur(12px) saturate(190%) brightness(1.05)',
      } as object,
      default: {},
    }),
  },
  glassClip: { borderRadius: BAR_HEIGHT / 2, overflow: 'hidden' },
  // זכוכית בהירה כמו ב-iOS
  glassTint: { backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.35)' },
  glassRim: {
    borderRadius: BAR_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    ...Platform.select({
      web: {
        borderWidth: 0,
        // Liquid Glass edge: light caught on the upper-left and lower-right rims, a faint glow inside.
        boxShadow:
          'inset 1px 1.5px 0 rgba(255,255,255,0.9), inset -1px -1px 0 rgba(255,255,255,0.55), inset 0 0 0 0.5px rgba(0,0,0,0.06), inset 0 0 14px rgba(255,255,255,0.45)',
      } as object,
      default: {},
    }),
  },
  // הבועה שמאחורי הלשונית הנבחרת
  lens: {
    position: 'absolute',
    top: BAR_PAD,
    end: BAR_PAD,
    bottom: BAR_PAD,
  },
  lensFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: (BAR_HEIGHT - BAR_PAD * 2) / 2 },
  // במנוחה: משטח אפור עדין
  platter: { backgroundColor: 'rgba(118,118,128,0.14)' },
  // מורמת: טיפת זכוכית שקופה עם אור על השוליים
  drop: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    ...Platform.select({
      web: {
        boxShadow:
          'inset 1.5px 2px 1px -0.5px rgba(255,255,255,0.95), inset -1.5px -2px 1px -0.5px rgba(255,255,255,0.7), inset 0 0 0 0.5px rgba(255,255,255,0.8), inset 0 0 12px rgba(255,255,255,0.4), 0 6px 18px rgba(0,0,0,0.13), 0 0 0 0.5px rgba(0,0,0,0.05)',
        backdropFilter: 'saturate(180%) brightness(1.06)',
        WebkitBackdropFilter: 'saturate(180%) brightness(1.06)',
      } as object,
      default: { shadowColor: '#000', shadowOpacity: 0.13, shadowRadius: 9, shadowOffset: { width: 0, height: 6 } },
    }),
  },
  over: { position: 'absolute', top: 0, left: 0, right: 0, textAlign: 'center', alignItems: 'center' },
  // לשונית
  tab: {
    flex: 1,
    borderRadius: (BAR_HEIGHT - BAR_PAD * 2) / 2,
    ...Platform.select({ web: { outlineStyle: 'none', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' } as object, default: {} }),
  },
  tabRing: Platform.select({
    web: { outlineStyle: 'solid', outlineWidth: 2, outlineColor: '#8CA8FF', outlineOffset: -2 } as object,
    default: {},
  }) as object,
  tabInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1 },
  tabLabel: { fontSize: 10, lineHeight: 12, fontWeight: '500', fontFamily: SYSTEM_FONT, letterSpacing: 0.1 },
  edge: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    zIndex: 49,
    ...Platform.select({
      web: {
        position: 'fixed',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        backgroundImage: 'linear-gradient(to top, rgba(242,244,248,0.75), rgba(242,244,248,0))',
        maskImage: 'linear-gradient(to top, #000 45%, transparent)',
        WebkitMaskImage: 'linear-gradient(to top, #000 45%, transparent)',
      } as object,
      default: {},
    }),
  },
});
