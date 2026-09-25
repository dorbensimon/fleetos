import { Modal, Pressable, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { AppText, PrimaryButton } from '../ui';
import { COLORS, RADIUS, SPACING } from '../../lib/theme';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { EditField, FieldMessage, KitSheet, PrimaryAction, SheetActions } from '../driverKit';

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
  const desktop = useIsDesktop();
  if (!desktop) {
    return (
      <KitSheet
        visible={visible}
        onClose={onClose}
        dismissable={!loading}
        icon="key"
        title="איפוס סיסמה"
        subtitle={`סיסמה זמנית חדשה עבור ${driverName ?? 'הנהג'}. בכניסה הבאה הוא יתבקש לקבוע סיסמה קבועה משלו.`}
        footer={
          <SheetActions>
            <PrimaryAction label="ביטול" tone="ghost" onPress={onClose} disabled={loading} style={kit.cancel} />
            <PrimaryAction label="איפוס הסיסמה" icon="key" onPress={onSubmit} loading={loading} style={kit.confirm} />
          </SheetActions>
        }
      >
        <View style={kit.fields}>
          <EditField first label="סיסמה חדשה" value={password} onChangeText={onPasswordChange} keyboardType="number-pad" ltr secureTextEntry hint="לפחות 4 ספרות" placeholder="••••" />
          <EditField label="אימות הסיסמה" value={confirmPassword} onChangeText={onConfirmPasswordChange} keyboardType="number-pad" ltr secureTextEntry placeholder="••••" />
          <View style={{ paddingHorizontal: 16 }}>
            <FieldMessage error={error || undefined} />
          </View>
        </View>
      </KitSheet>
    );
  }
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
            placeholder="סיסמה חדשה (לפחות 4 ספרות)"
            keyboardType="number-pad"
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
            keyboardType="number-pad"
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
    maxWidth: 420,
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

const kit = StyleSheet.create({
  fields: { marginHorizontal: -16 },
  cancel: { flex: 1 },
  confirm: { flex: 1.6 },
});
