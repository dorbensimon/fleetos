import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { prefersReducedMotion } from './primitives';
import { DESKTOP_COLORS, webOnly } from './desktopTheme';

/**
 * The top bar's dropdowns (notifications, "needs attention") share one open
 * slot, so opening one closes the other instead of stacking them. Escape or
 * a click anywhere outside closes whichever is open.
 */

type HeaderMenuSlot = { openId: string | null; setOpenId: (id: string | null) => void };

const HeaderMenuContext = createContext<HeaderMenuSlot | null>(null);

export function HeaderMenuProvider({ children }: { children: React.ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const value = useMemo(() => ({ openId, setOpenId }), [openId]);

  useEffect(() => {
    if (!openId || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenId(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openId]);

  return <HeaderMenuContext.Provider value={value}>{children}</HeaderMenuContext.Provider>;
}

/** Open state of one top-bar dropdown. Outside the shell it falls back to its own state. */
export function useHeaderMenu(id: string) {
  const shared = useContext(HeaderMenuContext);
  const [ownOpen, setOwnOpen] = useState(false);
  const open = shared ? shared.openId === id : ownOpen;
  const setOpen = (next: boolean) => (shared ? shared.setOpenId(next ? id : null) : setOwnOpen(next));
  return { open, setOpen, toggle: () => setOpen(!open), close: () => setOpen(false) };
}

/** Transparent full-window layer under an open dropdown: a click outside closes it. */
export function HeaderMenuBackdrop({ onClose }: { onClose: () => void }) {
  return <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="סגירה" />;
}

/** Dropdown drops from its trigger: short fade + slight scale, opacity only when motion is reduced. */
export function headerMenuEnter() {
  const reduced = prefersReducedMotion();
  return webOnly({
    animationKeyframes: reduced
      ? { from: { opacity: 0 }, to: { opacity: 1 } }
      : {
          from: { opacity: 0, transform: [{ translateY: -4 }, { scale: 0.97 }] },
          to: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
        },
    animationDuration: reduced ? '120ms' : '200ms',
    animationTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
    transformOrigin: 'top left',
  });
}

/** The shared look of every top-bar dropdown. */
export const headerMenuStyles = StyleSheet.create({
  wrap: { position: 'relative' },
  wrapOpen: { zIndex: 40 },
  menu: {
    position: 'absolute',
    top: 40,
    left: 0,
    width: 380,
    backgroundColor: DESKTOP_COLORS.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DESKTOP_COLORS.border,
    overflow: 'hidden',
    ...webOnly({ boxShadow: '0 12px 32px rgba(16,34,50,0.18), 0 2px 6px rgba(16,34,50,0.06)' }),
  },
  head: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DESKTOP_COLORS.border,
  },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, color: DESKTOP_COLORS.ink, letterSpacing: -0.2 },
  hint: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint, marginTop: 3 },
  scroll: { ...webOnly({ maxHeight: 'calc(100vh - 170px)' }) },
  footer: {
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: DESKTOP_COLORS.border,
  },
  footerText: { fontSize: 13, color: DESKTOP_COLORS.brand },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
});

const styles = StyleSheet.create({
  backdrop: { ...webOnly({ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, cursor: 'default' }) },
});
