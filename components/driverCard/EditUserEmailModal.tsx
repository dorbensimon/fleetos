import { Modal, Pressable, TextInput, TouchableOpacity, View } from 'react-native';
import { AppText, PrimaryButton } from '../ui';
import { COLORS } from '../../lib/theme';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { modalKit as kit, modalStyles as styles } from './driverModalStyles';
import { EditField, KitSheet, PrimaryAction, SheetActions } from '../driverKit';

export function EditUserEmailModal({
  visible,
  driverName,
  email,
  error,
  loading,
  onEmailChange,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  driverName: string | null | undefined;
  email: string;
  error: string;
  loading: boolean;
  onEmailChange: (value: string) => void;
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
        icon="mail"
        title="עדכון כתובת מייל"
        subtitle={`כתובת המייל של ${driverName ?? 'הנהג'} משמשת להתחברות לאפליקציה. עדכון כאן משנה אותה מיידית.`}
        footer={
          <SheetActions>
            <PrimaryAction label="ביטול" tone="ghost" onPress={onClose} disabled={loading} style={kit.cancel} />
            <PrimaryAction label="עדכון המייל" icon="checkmark" onPress={onSubmit} loading={loading} style={kit.confirm} />
          </SheetActions>
        }
      >
        <View style={kit.fields}>
          <EditField first label="כתובת מייל" value={email} onChangeText={onEmailChange} keyboardType="email-address" ltr error={error || undefined} placeholder="name@example.com" autoComplete="email" />
        </View>
      </KitSheet>
    );
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(event) => event.stopPropagation()}>
          <AppText weight="bold" style={styles.title}>
            עדכון כתובת מייל
          </AppText>
          <AppText style={styles.subtitle}>
            כתובת המייל של {driverName ?? 'הנהג'} משמשת להתחברות לאפליקציה. עדכון כאן משנה אותה מיידית.
          </AppText>

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={onEmailChange}
            placeholder="כתובת מייל"
            placeholderTextColor={COLORS.textFaint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textAlign="left"
          />

          {!!error && <AppText style={styles.error}>{error}</AppText>}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancel} onPress={onClose} disabled={loading}>
              <AppText weight="bold" style={styles.cancelText}>
                ביטול
              </AppText>
            </TouchableOpacity>
            <PrimaryButton label="עדכן מייל" onPress={onSubmit} loading={loading} style={styles.confirmBtn} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
