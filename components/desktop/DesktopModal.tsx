import React, { useEffect } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS, webOnly } from './desktopTheme';

/**
 * Generic centered floating modal for desktop quick actions (dashboard
 * "show more" lists, departments management, report export) — same visual
 * language as the driver/vehicle detail dialog in FleetDesktopView, pulled
 * out so every dashboard widget can open one without duplicating it.
 *
 * Uses RN's own `Modal` (not an absolutely/fixed-positioned View) because
 * the dashboard quick actions open this from inside the page's scrolling
 * content, and a CSS transform on any ancestor (react-native-web adds one
 * for its own layout in places) turns `position: fixed` back into
 * `absolute` relative to that ancestor. `Modal` renders through RN Web's
 * own portal at the document root, which sidesteps that entirely.
 */
export function DesktopModal({
  visible,
  title,
  onClose,
  children,
  maxWidth = 560,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, onClose]);

  const reduceMotion = Platform.OS === 'web' && typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, reduceMotion ? styles.overlayInReduced : styles.overlayIn]} onPress={onClose}>
        <Pressable
          style={[styles.dialog, { maxWidth }, reduceMotion ? styles.dialogInReduced : styles.dialogIn]}
          onPress={(event) => event.stopPropagation()}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <DText weight="bold" style={styles.title}>{title}</DText>
            <HoverPressable style={styles.closeButton} hoverStyle={styles.closeButtonHover} pressStyle={styles.closeButtonPress} onPress={onClose} accessibilityLabel="סגירה">
              <Ionicons name="close" size={14} color={DESKTOP_COLORS.ink} />
            </HoverPressable>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: DESKTOP_COLORS.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayIn: webOnly({
    animationKeyframes: { from: { opacity: 0 }, to: { opacity: 1 } },
    animationDuration: '180ms',
    animationTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
    animationFillMode: 'backwards',
  }),
  overlayInReduced: webOnly({
    animationKeyframes: { from: { opacity: 0 }, to: { opacity: 1 } },
    animationDuration: '200ms',
    animationTimingFunction: 'ease',
    animationFillMode: 'backwards',
  }),
  dialog: {
    width: '92%',
    maxHeight: '84%',
    backgroundColor: DESKTOP_COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    overflow: 'hidden',
    ...webOnly({ boxShadow: '0 16px 40px rgba(16,34,50,0.24)' }),
  },
  dialogIn: webOnly({
    animationKeyframes: {
      from: { opacity: 0, transform: [{ scale: 0.96 }, { translateY: 6 }] },
      to: { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }] },
    },
    animationDuration: '220ms',
    animationTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
    animationFillMode: 'backwards',
  }),
  dialogInReduced: webOnly({
    animationKeyframes: { from: { opacity: 0 }, to: { opacity: 1 } },
    animationDuration: '200ms',
    animationTimingFunction: 'ease',
    animationFillMode: 'backwards',
  }),
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.border,
  },
  title: { fontSize: 14.5 },
  closeButton: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonHover: { backgroundColor: DESKTOP_COLORS.canvas },
  closeButtonPress: { transform: [{ scale: 0.92 }] },
  body: { flexGrow: 0 },
  bodyContent: { paddingVertical: 4 },
});
