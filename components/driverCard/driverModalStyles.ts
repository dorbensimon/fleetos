import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../lib/theme';

/** The centred modal of the driver card's confirm, edit-email and reset-password dialogs. */
export const DRIVER_MODAL_BASE = {
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  modal: {
    width: '100%',
    maxWidth: 420,
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
  confirmBtn: { flex: 1.4 },
} satisfies Record<string, ViewStyle | TextStyle>;

/** The edit-email and reset-password modals. */
export const modalStyles = StyleSheet.create({
  ...DRIVER_MODAL_BASE,
  input: {
    height: 48,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.fieldBorder,
    backgroundColor: COLORS.field,
    paddingHorizontal: 14,
    fontSize: 15,
    color: COLORS.text,
  },
  error: { fontSize: 12.5, color: COLORS.dangerText, textAlign: 'center' },
});

export const modalKit = StyleSheet.create({
  fields: { marginHorizontal: -16 },
  cancel: { flex: 1 },
  confirm: { flex: 1.6 },
});
