import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  Modal,
  Pressable,
  Animated,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import { COLORS } from './ownerTheme';

/** A bottom sheet that slides up over a dim overlay, dismissible by tapping outside. */
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

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : 300,
      duration: 220,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `translateY` is a stable ref
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.overlay} onPress={onClose}>
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
        </Pressable>
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
    gap: 14,
  },
});
