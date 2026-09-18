import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Modal,
  Pressable,
  Animated,
  Easing,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import { COLORS } from './ownerTheme';
import { CONTENT_MAX_WIDTH } from '../../lib/theme';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * A bottom sheet that slides up over a dim overlay, dismissible by tapping
 * outside. The overlay's dim and the sheet's slide share one driving value
 * so they read as a single material moving together, not two separate
 * transitions (the `Modal`'s own `fade` plus a manual slide). The sheet also
 * stays mounted through its close animation instead of vanishing the
 * instant `visible` flips, so the exit actually gets to play.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const translateY = useRef(new Animated.Value(300)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(translateY, { toValue: 0, duration: 220, easing: EASE_OUT, useNativeDriver: true }).start();
    } else {
      Animated.timing(translateY, { toValue: 300, duration: 200, easing: EASE_OUT, useNativeDriver: true }).start(
        ({ finished }) => finished && setMounted(false)
      );
    }
  }, [visible, translateY]);

  if (!mounted) return null;

  const overlayOpacity = translateY.interpolate({ inputRange: [0, 300], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <Animated.View style={[styles.sheetContainer, { transform: [{ translateY }], maxHeight: '85%' }]}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.sheetContentContainer}
              >
                {children}
              </ScrollView>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A centered, non-scrolling modal card over a dim overlay. */
export function CenterModal({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.centerOverlay} onPress={onClose}>
        <Pressable style={styles.centerModal} onPress={(e) => e.stopPropagation()}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  sheetContentContainer: {
    padding: 20,
    paddingBottom: 34,
    gap: 14,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDDDDD',
    alignSelf: 'center',
    marginBottom: 6,
  },
  sheetHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: COLORS.black },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centerModal: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 22,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    gap: 14,
  },
});
