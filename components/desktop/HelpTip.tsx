// סימן שאלה קטן עם הסבר בבועה
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS, webOnly } from './desktopTheme';

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const BRAND_SOFT = '#E6F2F9';
const NAVY = '#102536';

// הסבר בסימן שאלה שמנהל את עצמו
/** A "?" that keeps its own open state, for a section heading. */
export function HeadingHelp({ text, title, label, reduceMotion }: { text: string; title?: string; label: string; reduceMotion: boolean }) {
  const [open, setOpen] = useState(false);
  return <HelpTip text={text} title={title} label={label} open={open} onOpenChange={setOpen} reduceMotion={reduceMotion} />;
}

/**
 * A small "?" beside a card's title. Clicking it opens a short explanation
 * right under it; a click anywhere else, or Escape, closes it.
 */
export function HelpTip({
  text,
  title,
  label,
  open,
  onOpenChange,
  reduceMotion,
}: {
  text: string;
  /** Shown in bold above the explanation: the full name, for a row where it may be cut short. */
  title?: string;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reduceMotion: boolean;
}) {
  const ref = useRef<View>(null);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const away = (event: PointerEvent) => {
      const node = ref.current as unknown as HTMLElement | null;
      if (node && !node.contains(event.target as Node)) onOpenChange(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onOpenChange(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open, onOpenChange]);

  return (
    <View ref={ref} style={styles.help}>
      <HoverPressable
        style={styles.helpButton}
        hoverStyle={styles.helpButtonHover}
        onPress={() => onOpenChange(!open)}
        accessibilityLabel={`${label}: ${text}`}
        accessibilityState={{ expanded: open }}
      >
        <Ionicons name={open ? 'help-circle' : 'help-circle-outline'} size={15} color={open ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkFaint} />
      </HoverPressable>
      {open && (
        <View style={[styles.helpBubble, !reduceMotion && styles.helpBubbleIn]} accessibilityLiveRegion="polite">
          {!!title && <DText weight="bold" style={styles.helpText}>{title}</DText>}
          <DText style={styles.helpText}>{text}</DText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  help: { position: 'relative', flexShrink: 0 },
  helpButton: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease' }) },
  helpButtonHover: { backgroundColor: BRAND_SOFT },
  helpBubble: {
    position: 'absolute',
    top: 26,
    end: -6,
    width: 240,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: NAVY,
    ...webOnly({ boxShadow: '0 8px 24px rgba(16,24,40,0.18)', transformOrigin: 'top right' }),
  },
  helpBubbleIn: webOnly({
    animationKeyframes: { from: { opacity: 0, transform: [{ scale: 0.96 }] }, to: { opacity: 1, transform: [{ scale: 1 }] } },
    animationDuration: '150ms',
    animationTimingFunction: EASE_OUT,
  }),
  helpText: { fontSize: 12, lineHeight: 17, color: '#FFFFFF' },
});
