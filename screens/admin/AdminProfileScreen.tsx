import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { showAlert } from '../../lib/platformAlert';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState, useToast } from '../../components/ui';
import {
  ActionRow,
  Avatar,
  DK,
  DKText,
  DriverPage,
  EditField,
  ErrorPanel,
  HeroButton,
  HeroTitle,
  InfoLine,
  KitSection,
  ListRow,
  LoadingPanel,
  PrimaryAction,
  Reveal,
  Surface,
} from '../../components/driverKit';
import { formatDate } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { signOut as signOutEverywhere } from '../../lib/signOut';
import { updateCompanySettings } from '../../lib/companyApi';
import { functionErrorMessage } from '../../lib/functionError';
import { formatPhone, isValidIsraeliPhone } from '../../lib/phone';
import { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { AdminProfileDesktopView } from '../../components/desktop/AdminProfileDesktopView';
import { t, textStart } from '../../lib/i18n';
import { companyTypeLabel } from '../../lib/companyType';
import { errorMessage } from '../../lib/requestError';

/** The logged-in admin's own details, reached from the hamburger menu. */
type Props = NativeStackScreenProps<RootStackParamList, 'AdminProfile'>;

export default function AdminProfileScreen({ navigation }: Props) {
  const { profile, company, refresh } = useCompany();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequest = useRef(0);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fullName: '', phone: '', companyPhone: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const shownOnce = useRef(false);
  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    // The loader shows the first time only; a return refreshes quietly.
    const quiet = shownOnce.current;
    if (!quiet) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const [{ data }] = await Promise.all([supabase.auth.getUser(), refresh()]);
      if (requestId === loadRequest.current) {
        setEmail(data.user?.email ?? null);
        shownOnce.current = true;
      }
    } catch (err: any) {
      if (requestId === loadRequest.current && !quiet) setLoadError(errorMessage(err, t('profile.loadFailed')));
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        loadRequest.current += 1;
      };
    }, [load])
  );

  const toggleEdit = () => {
    if (editing) {
      save();
      return;
    }
    setForm({
      fullName: profile?.full_name || '',
      phone: profile?.phone || '',
      companyPhone: company?.phone || '',
    });
    setErrors({});
    setEditing(true);
  };

  const save = async () => {
    if (!profile || !company) return;
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = t('validation.required');
    if (!form.phone.trim()) e.phone = t('validation.required');
    else if (!isValidIsraeliPhone(form.phone)) e.phone = t('validation.invalidPhone');
    if (form.companyPhone.trim() && !isValidIsraeliPhone(form.companyPhone)) {
      e.companyPhone = t('validation.invalidPhone');
    }
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: form.fullName.trim(), phone: form.phone.trim() })
      .eq('id', profile.id);

    let companyPhoneError: string | null = null;
    if (!error && form.companyPhone.trim() && form.companyPhone.trim() !== (company.phone || '')) {
      const { data, error: fnError } = await updateCompanySettings(company.id, { landline: form.companyPhone.trim() });
      if (fnError) companyPhoneError = await functionErrorMessage(fnError, data, t('profile.companyPhoneFailed'), false);
    }
    setSaving(false);

    if (error) {
      showAlert(t('common.saveFailed'), t('profile.saveChangesFailed'));
      return;
    }
    if (companyPhoneError) {
      showAlert(t('common.saveFailed'), companyPhoneError);
      return;
    }
    setEditing(false);
    await refresh();
    showToast(t('common.savedSuccessfully'));
  };

  const signOut = () => {
    showAlert(t('auth.signOut'), t('auth.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('auth.signOutAction'), style: 'destructive', onPress: () => void signOutEverywhere().catch(() => showAlert(t('auth.signOutFailed'), t('common.tryAgainShortly'))) },
    ]);
  };

  if (isDesktop) {
    return (
      <DesktopShell active="AdminProfile" breadcrumbs={[t('nav.account'), t('nav.myDetails')]}>
        {loading ? null : loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : (
          <AdminProfileDesktopView
            fullName={editing ? form.fullName || profile?.full_name || '' : profile?.full_name || ''}
            role={t('role.adminShort')}
            email={email}
            company={company}
            editing={editing}
            form={form}
            errors={errors}
            saving={saving}
            onToggleEdit={toggleEdit}
            onChangeField={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
            onChangePassword={() => navigation.navigate('SetPassword', { voluntary: true })}
            onOpenCompanySettings={() => navigation.navigate('CompanySettings')}
            createdAt={profile?.created_at ?? null}
          />
        )}
      </DesktopShell>
    );
  }

  const set = (field: keyof typeof form, value: string) => setForm((f) => ({ ...f, [field]: value }));
  return (
    <DriverPage
      insetTop={insets.top}
      insetBottom={insets.bottom}
      hero={
        <HeroTitle
          title={editing ? t('profile.editDetailsTitle') : t('nav.myDetails')}
          subtitle={company?.name ? t('profile.fleetManagerAt', { name: company.name }) : t('role.fleetManager')}
          onBack={() => (editing ? setEditing(false) : navigation.goBack())}
          right={!loading && !loadError && !editing ? <HeroButton icon="create-outline" label={t('profile.editDetailsTitle')} onPress={toggleEdit} /> : undefined}
        />
      }
      footer={
        editing ? (
          <View style={styles.footer}>
            <PrimaryAction label={t('common.cancel')} tone="ghost" onPress={() => setEditing(false)} style={styles.footerCancel} />
            <PrimaryAction label={t('common.saveChangesAction')} icon="checkmark" onPress={() => void save()} loading={saving} style={styles.footerSave} />
          </View>
        ) : undefined
      }
    >
      {loading ? (
        <LoadingPanel />
      ) : loadError ? (
        <ErrorPanel message={loadError} onRetry={load} />
      ) : editing ? (
        <>
          <Reveal index={0}>
            <KitSection>
              <EditField first label={t('common.fullName')} required value={form.fullName} onChangeText={(v) => set('fullName', v)} error={errors.fullName} />
              <EditField label={t('common.phone')} required value={form.phone} onChangeText={(v) => set('phone', v.replace(/\D/g, ''))} keyboardType="phone-pad" ltr error={errors.phone} />
            </KitSection>
          </Reveal>
          <Reveal index={1}>
            <KitSection title={t('owner.theCompany')}>
              <EditField first label={t('company.phone')} value={form.companyPhone} onChangeText={(v) => set('companyPhone', v.replace(/\D/g, ''))} keyboardType="phone-pad" ltr error={errors.companyPhone} hint={t('profile.companyEditedInSettings')} />
            </KitSection>
          </Reveal>
        </>
      ) : (
        <>
          <Reveal index={0}>
            <Surface style={styles.identity}>
              <Avatar name={profile?.full_name} size={72} />
              <View style={styles.flex}>
                <DKText variant="title" numberOfLines={2}>
                  {profile?.full_name || '—'}
                </DKText>
                <DKText variant="caption" color={DK.muted} ltr style={styles.alignRight} numberOfLines={1}>
                  {email || ''}
                </DKText>
                <View style={styles.roleChip}>
                  <Ionicons name="shield-checkmark" size={14} color={DK.accent} />
                  <DKText variant="micro" color={DK.accent}>
                    {t('role.fleetManager')}
                  </DKText>
                </View>
              </View>
            </Surface>
          </Reveal>
          <Reveal index={1}>
            <KitSection title={t('driver.personalDetails')}>
              <InfoLine first icon="person" label={t('common.fullName')} value={profile?.full_name} />
              <InfoLine icon="call" label={t('common.phone')} value={profile?.phone ? formatPhone(profile.phone) : null} ltr />
              <InfoLine icon="mail" label={t('common.emailAddress')} value={email} ltr locked />
              <InfoLine icon="calendar" label={t('profile.joined')} value={profile?.created_at ? formatDate(profile.created_at) : null} locked />
            </KitSection>
          </Reveal>
          <Reveal index={2}>
            <KitSection title={t('owner.theCompany')}>
              <InfoLine first icon="business" label={t('company.name')} value={company?.name} />
              <InfoLine icon="pricetag" label={t('company.type')} value={companyTypeLabel(company?.company_type)} />
              <InfoLine icon="card" label={t('company.businessId')} value={company?.business_id} ltr />
              <InfoLine icon="location" label={t('common.address')} value={company?.address} />
              <InfoLine icon="call" label={t('company.phone')} value={company?.phone ? formatPhone(company.phone) : null} ltr />
              <ListRow icon="settings" title={t('nav.companySettings')} subtitle={t('profile.companySettingsHint')} onPress={() => navigation.navigate('CompanySettings')} />
            </KitSection>
          </Reveal>
          <Reveal index={3}>
            <KitSection title={t('profile.security')}>
              <ActionRow icon="lock-closed" label={t('password.change')} hint={t('profile.newPasswordHint')} onPress={() => navigation.navigate('SetPassword', { voluntary: true })} />
              <ActionRow first={false} icon="log-out-outline" tone="danger" label={t('auth.signOutOfAccountAction')} onPress={signOut} />
            </KitSection>
          </Reveal>
        </>
      )}
    </DriverPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 3 },
  alignRight: { textAlign: textStart() },
  identity: { flexDirection: 'row-reverse', alignItems: 'center', gap: 16, padding: 18 },
  roleChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, alignSelf: 'flex-end', marginTop: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: DK.accentSoft },
  footer: { flexDirection: 'row-reverse', gap: 10 },
  footerCancel: { flex: 1 },
  footerSave: { flex: 2 },
});
