import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner, DK, DKText, DriverPage, EditField, HeroButton, KitInput, KitSection, PrimaryAction, Pressy, Reveal, STATUS } from '../components/driverKit';
import { showAlert } from '../lib/platformAlert';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { supabase } from '../lib/supabase';
import { resolveRouteForUser } from '../lib/session';
import { MIN_PASSWORD_LENGTH } from '../lib/validation';
import { functionErrorMessage } from '../lib/functionError';
import { useIsDesktop } from '../lib/useDesktopLayout';
import { SetPasswordDesktopView } from '../components/desktop/SetPasswordDesktopView';
import { BrandLogo } from '../components/ui/Brand';
import { t, dirIcon } from '../lib/i18n';

/**
 * Shown once, right after a first login with an owner/admin-assigned
 * temporary password. Blocks entry to every home screen until the user
 * picks a permanent password of their own (must_change_password=true
 * is the gate — see resolveRouteForUser).
 */

type Props = NativeStackScreenProps<RootStackParamList, 'SetPassword'>;

export default function SetPasswordScreen({ navigation, route }: Props) {
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const voluntary = route.params?.voluntary ?? false;
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState('');
  const [saving, setSaving] = useState(false);

  const signOut = () => {
    showAlert(t('auth.signOut'), t('password.signOutToLogin'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('auth.signOutAction'), style: 'destructive', onPress: () => { void supabase.auth.signOut(); } },
    ]);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!password) e.password = t('validation.required');
    else if (password.length < MIN_PASSWORD_LENGTH) e.password = t('password.min8');
    if (!confirmPassword) e.confirmPassword = t('validation.required');
    else if (confirmPassword !== password) e.confirmPassword = t('password.mismatch');
    return e;
  };

  const submit = async () => {
    setGeneralError('');
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    try {
      // Setting the password and clearing must_change_password happen
      // together, server-side — the client is never trusted to report on
      // its own that setup is complete. See complete-password-setup and
      // 71_lock_must_change_password_column.sql.
      const { data, error } = await supabase.functions.invoke('complete-password-setup', {
        body: { newPassword: password },
      });
      if (error || !data?.success) {
        setGeneralError(await functionErrorMessage(error, data, t('password.updateFailed')));
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        setGeneralError(t('password.updatedUserLoadFailed'));
        return;
      }

      const result = await resolveRouteForUser(userData.user.id);
      if (!result.ok) {
        setGeneralError(result.error);
        return;
      }

      if (!voluntary && result.route === 'DriverHome') {
        showAlert(
          t('password.welcome'),
          t('password.driverWelcomeBody'),
          [{ text: t('common.gotIt'), onPress: () => navigation.reset({ index: 0, routes: [{ name: result.route }] }) }]
        );
      } else {
        navigation.reset({ index: 0, routes: [{ name: result.route }] });
      }
    } catch {
      setGeneralError(t('common.errorTryAgain'));
    } finally {
      setSaving(false);
    }
  };

  return (
    isDesktop ? (
      <SetPasswordDesktopView
        voluntary={voluntary}
        password={password}
        confirmPassword={confirmPassword}
        showPassword={showPassword}
        errors={errors}
        generalError={generalError}
        saving={saving}
        onPasswordChange={setPassword}
        onConfirmPasswordChange={setConfirmPassword}
        onTogglePassword={() => setShowPassword((current) => !current)}
        onSubmit={() => { void submit(); }}
        onCancel={voluntary ? () => navigation.goBack() : signOut}
      />
    ) : (
      <DriverPage
        insetTop={insets.top}
        insetBottom={insets.bottom}
        hero={
          <View>
            <View style={styles.bar}>
              {voluntary ? <HeroButton icon={dirIcon('chevron-forward')} label={t('common.goBack')} onPress={() => navigation.goBack()} /> : <View />}
              <BrandLogo height={22} onDark />
            </View>
            <DKText variant="display" color={DK.onNight} accessibilityRole="header">
              {voluntary ? t('password.change') : t('password.welcomePlural')}
            </DKText>
            <DKText variant="body" color={DK.onNightMuted} style={styles.subtitle}>
              {voluntary ? t('password.chooseNewForAccount') : t('password.firstSignInChoose')}
            </DKText>
          </View>
        }
        footer={
          <View style={styles.footer}>
            <PrimaryAction label={voluntary ? t('password.save') : t('common.continue')} icon={voluntary ? 'checkmark' : dirIcon('arrow-back')} onPress={() => void submit()} loading={saving} />
            <Pressy onPress={voluntary ? () => navigation.goBack() : signOut} accessibilityLabel={voluntary ? t('common.cancel') : t('password.notMeSignOutComma')} style={styles.secondary}>
              <DKText variant="label" color={DK.muted}>
                {voluntary ? t('common.cancel') : t('password.notMeSignOutDot')}
              </DKText>
            </Pressy>
          </View>
        }
      >
        <Reveal index={0}>
          <KitSection>
            <EditField
              first
              label={t('password.new')}
              error={errors.password}
              editor={
                <View style={styles.row}>
                  <KitInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    placeholder={t('password.min8')}
                    autoCapitalize="none"
                    autoComplete="new-password"
                    ltr
                    hasError={!!errors.password}
                    accessibilityLabel={t('password.new')}
                    style={styles.flex}
                  />
                  <Pressy onPress={() => setShowPassword((v) => !v)} accessibilityLabel={showPassword ? t('password.hideThe') : t('password.showThe')} style={styles.eye} pressScale={0.92}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={DK.accent} />
                  </Pressy>
                </View>
              }
            />
            <EditField
              label={t('password.confirmThe')}
              error={errors.confirmPassword}
              editor={
                <KitInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  placeholder={t('password.typeAgain')}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  ltr
                  hasError={!!errors.confirmPassword}
                  accessibilityLabel={t('password.confirmThe')}
                />
              }
            />
          </KitSection>
        </Reveal>
        <Reveal index={1}>
          <View style={styles.checks} accessibilityLiveRegion="polite">
            <Check ok={password.length >= MIN_PASSWORD_LENGTH} label={t('password.minChars', { MIN_PASSWORD_LENGTH })} />
            <Check ok={!!confirmPassword && confirmPassword === password} label={t('password.bothMatch')} />
          </View>
        </Reveal>
        {!!generalError && <Banner tone="expired">{generalError}</Banner>}
      </DriverPage>
    )
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.check}>
      <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={ok ? STATUS.ok.fg : DK.faint} />
      <DKText variant="caption" color={ok ? STATUS.ok.fg : DK.muted}>
        {label}
      </DKText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, marginBottom: 20 },
  subtitle: { marginTop: 8 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  eye: { width: 52, height: 52, borderRadius: 16, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
  checks: { gap: 8, paddingHorizontal: 6 },
  check: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  footer: { gap: 4 },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
