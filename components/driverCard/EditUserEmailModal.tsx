import { Modal, Pressable, TextInput, TouchableOpacity, View } from 'react-native';
import { AppText, PrimaryButton } from '../ui';
import { COLORS } from '../../lib/theme';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { modalKit as kit, modalStyles as styles } from './driverModalStyles';
import { EditField, KitSheet, PrimaryAction, SheetActions } from '../driverKit';
import { t } from '../../lib/i18n';

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
        title={t('email.updateTitle')}
        subtitle={t('email.updateDescription', { v1: driverName ?? t('common.theDriver') })}
        footer={
          <SheetActions>
            <PrimaryAction label={t('common.cancel')} tone="ghost" onPress={onClose} disabled={loading} style={kit.cancel} />
            <PrimaryAction label={t('email.update')} icon="checkmark" onPress={onSubmit} loading={loading} style={kit.confirm} />
          </SheetActions>
        }
      >
        <View style={kit.fields}>
          <EditField first label={t('email.address')} value={email} onChangeText={onEmailChange} keyboardType="email-address" ltr error={error || undefined} placeholder="name@example.com" autoComplete="email" />
        </View>
      </KitSheet>
    );
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(event) => event.stopPropagation()}>
          <AppText weight="bold" style={styles.title}>
            {t('email.updateTitle')}
          </AppText>
          <AppText style={styles.subtitle}>
            {t('email.ofPrefix')} {driverName ?? t('common.theDriver')} {t('email.usedForSignIn')}
          </AppText>

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={onEmailChange}
            placeholder={t('email.address')}
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
                {t('common.cancel')}
              </AppText>
            </TouchableOpacity>
            <PrimaryButton label={t('email.updateAction')} onPress={onSubmit} loading={loading} style={styles.confirmBtn} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
