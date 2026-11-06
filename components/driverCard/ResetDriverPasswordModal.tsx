// חלון איפוס סיסמה לנהג
import { useEffect, useState } from 'react';
import { Modal, Pressable, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, PrimaryButton } from '../ui';
import { COLORS } from '../../lib/theme';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { modalKit as kit, modalStyles as styles } from './driverModalStyles';
import { DK, DKText, EditField, FieldMessage, KitSheet, PrimaryAction, Pressy, SheetActions } from '../driverKit';
import { generateTemporaryPassword } from '../../lib/validation';
import { t } from '../../lib/i18n';

// החלון
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
  // A generated password is shown in clear so the admin can pass it on.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!visible) setRevealed(false);
  }, [visible]);
  const generate = () => {
    const value = generateTemporaryPassword();
    onPasswordChange(value);
    onConfirmPasswordChange(value);
    setRevealed(true);
  };
  const generateButton = (
    <Pressy onPress={generate} disabled={loading} accessibilityLabel={t('password.generateRandom')} style={generateStyle} pressScale={0.95}>
      <Ionicons name="sparkles" size={14} color={DK.accent} />
      <DKText variant="micro" color={DK.accent}>
        {t('password.autoGenerate')}
      </DKText>
    </Pressy>
  );
  if (!desktop) {
    return (
      <KitSheet
        visible={visible}
        onClose={onClose}
        dismissable={!loading}
        icon="key"
        title={t('password.reset')}
        subtitle={t('password.resetDescription', { v1: driverName ?? t('common.theDriver') })}
        footer={
          <SheetActions>
            <PrimaryAction label={t('common.cancel')} tone="ghost" onPress={onClose} disabled={loading} style={kit.cancel} />
            <PrimaryAction label={t('password.resetAction')} icon="key" onPress={onSubmit} loading={loading} style={kit.confirm} />
          </SheetActions>
        }
      >
        <View style={kit.fields}>
          <View style={{ paddingHorizontal: 16, paddingTop: 12, alignItems: 'flex-end' }}>{generateButton}</View>
          <EditField first label={t('password.new')} value={password} onChangeText={onPasswordChange} autoComplete="off" ltr secureTextEntry={!revealed} hint={t('validation.min4DigitsPlaceholder')} placeholder="••••••••" />
          <EditField label={t('password.confirmThe')} value={confirmPassword} onChangeText={onConfirmPasswordChange} autoComplete="off" ltr secureTextEntry={!revealed} placeholder="••••••••" />
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
            {t('password.reset')}
          </AppText>
          <AppText style={styles.subtitle}>
            {t('password.setNewFor')} {driverName ?? t('common.theDriver')}{t('password.setNewForSuffix')}
          </AppText>

          <View style={{ alignItems: 'flex-end', marginBottom: 8 }}>{generateButton}</View>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={onPasswordChange}
            placeholder={t('password.newMin4')}
            placeholderTextColor={COLORS.textFaint}
            secureTextEntry={!revealed}
            autoCapitalize="none"
            textAlign="left"
          />
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={onConfirmPasswordChange}
            placeholder={t('password.confirm')}
            placeholderTextColor={COLORS.textFaint}
            secureTextEntry={!revealed}
            autoCapitalize="none"
            textAlign="left"
          />

          {!!error && <AppText style={styles.error}>{error}</AppText>}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancel} onPress={onClose} disabled={loading}>
              <AppText weight="bold" style={styles.cancelText}>
                {t('common.cancel')}
              </AppText>
            </TouchableOpacity>
            <PrimaryButton label={t('password.resetShort')} onPress={onSubmit} loading={loading} style={styles.confirmBtn} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const generateStyle = { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 10, borderRadius: 999, backgroundColor: DK.accentSoft } as const;
