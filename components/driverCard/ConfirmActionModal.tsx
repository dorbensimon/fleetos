import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { AppText, PrimaryButton } from '../ui';
import { COLORS, RADIUS, SPACING } from '../../lib/theme';

/**
 * Generic "are you sure?" confirmation modal — cancel + confirm side by side.
 *
 * `requireTypedText` turns it into the stronger variant used for actions
 * that cannot be undone: the confirm button stays disabled until the exact
 * text (a driver's name, say) has been typed out, so the action can't be
 * reached by muscle memory.
 */
export function ConfirmActionModal({
  visible,
  title,
  message,
  confirmLabel,
  destructive,
  loading,
  requireTypedText,
  typedTextHint,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  loading?: boolean;
  requireTypedText?: string | null;
  typedTextHint?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');

  // Never carry one confirmation's typing into the next one.
  useEffect(() => {
    if (!visible) setTyped('');
  }, [visible]);

  const expected = requireTypedText?.trim() ?? '';
  const matches = !expected || typed.trim() === expected;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(event) => event.stopPropagation()}>
          <AppText weight="bold" style={styles.title}>
            {title}
          </AppText>
          <AppText style={styles.subtitle}>{message}</AppText>

          {!!expected && (
            <>
              <AppText style={styles.subtitle}>{typedTextHint ?? `לאישור, הקלד: ${expected}`}</AppText>
              <TextInput
                value={typed}
                onChangeText={setTyped}
                editable={!loading}
                placeholder={expected}
                placeholderTextColor={COLORS.textMuted}
                style={styles.input}
                textAlign="right"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancel} onPress={onClose} disabled={loading}>
              <AppText weight="bold" style={styles.cancelText}>
                ביטול
              </AppText>
            </TouchableOpacity>
            <PrimaryButton
              label={confirmLabel}
              onPress={onConfirm}
              loading={loading}
              disabled={!matches}
              style={[styles.confirmBtn, destructive && styles.destructiveBtn]}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  modal: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  title: { fontSize: 16.5, color: COLORS.text, textAlign: 'right' },
  subtitle: { fontSize: 12.5, color: COLORS.textMuted, textAlign: 'right', lineHeight: 18 },
  actions: { flexDirection: 'row-reverse', gap: SPACING.sm, marginTop: SPACING.xs },
  cancel: {
    flex: 1,
    height: 48,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.fieldBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 14, color: COLORS.text },
  input: {
    height: 46,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.fieldBorder,
    paddingHorizontal: SPACING.md,
    fontSize: 15,
    color: COLORS.text,
  },
  confirmBtn: { flex: 1.4 },
  destructiveBtn: { backgroundColor: COLORS.dangerText },
});
