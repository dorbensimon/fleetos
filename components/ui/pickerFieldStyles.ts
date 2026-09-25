import type { TextStyle, ViewStyle } from 'react-native';
import { COLORS, RADIUS } from '../../lib/theme';

/** The field box and the iOS picker sheet, shared by DateField, TimeField and Select. */
export const PICKER_FIELD_STYLES = {
  box: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.field,
    borderWidth: 1.5,
    borderColor: COLORS.fieldBorder,
    paddingHorizontal: 14,
  },
  boxError: { borderColor: COLORS.dangerText },
  boxDisabled: { opacity: 0.55 },
  value: { flex: 1, fontSize: 15, textAlign: 'left' },
  placeholder: { color: COLORS.textFaint },
  iosDone: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 24 },
  iosDoneText: { color: COLORS.accent, fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingBottom: 8,
  },
} satisfies Record<string, ViewStyle | TextStyle>;
