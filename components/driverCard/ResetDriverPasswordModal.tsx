import { Modal, Pressable, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { AppText, PrimaryButton } from '../ui';
import { COLORS, RADIUS, SPACING } from '../../lib/theme';

export function ResetDriverPasswordModal({
  visible,
  driverName,
  password,
  confirmPassword,
  error,
  loading,
  onPasswordChange,
  onConfirmPasswordChange,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  driverName: string | null | undefined;
  password: string;
  confirmPassword: string;
  error: string;
  loading: boolean;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(event) => event.stopPropagation()}>
          <AppText weight="bold" style={styles.title}>
            איפוס סיסמה
          </AppText>
          <AppText style={styles.subtitle}>
            קביעת סיסמה חדשה עבור {driverName ?? 'הנהג'}. הוא יתבקש לקבוע סיסמה קבועה משלו בכניסה הבאה,
            ולא יוכל להתחבר לפני כן.
          </AppText>

          <TextInput
            style={styles.input}
            value={password}
            onChangeText={onPasswordChange}
            placeholder="סיסמה חדשה (לפחות 6 תווים)"
            placeholderTextColor={COLORS.textFaint}
            secureTextEntry
            autoCapitalize="none"
            textAlign="left"
          />
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={onConfirmPasswordChange}
            placeholder="אימות סיסמה"
            placeholderTextColor={COLORS.textFaint}
            secureTextEntry
            autoCapitalize="none"
            textAlign="left"
          />

          {!!error && <AppText style={styles.error}>{error}</AppText>}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancel} onPress={onClose} disabled={loading}>
              <AppText weight="bold" style={styles.cancelText}>
                ביטול
              </AppText>
            </TouchableOpacity>
            <PrimaryButton label="אפס סיסמה" onPress={onSubmit} loading={loading} style={styles.confirmBtn} />
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
});
