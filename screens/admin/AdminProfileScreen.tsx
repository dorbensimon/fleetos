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
import { updateCompanySettings } from '../../lib/companyApi';
import { functionErrorMessage } from '../../lib/functionError';
import { formatPhone, isValidIsraeliPhone } from '../../lib/phone';
import { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { AdminProfileDesktopView } from '../../components/desktop/AdminProfileDesktopView';

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

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [{ data }] = await Promise.all([supabase.auth.getUser(), refresh()]);
      if (requestId === loadRequest.current) {
        setEmail(data.user?.email ?? null);
      }
    } catch (err: any) {
      if (requestId === loadRequest.current) setLoadError(err?.message ?? 'טעינת הפרטים נכשלה');
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
    if (!form.fullName.trim()) e.fullName = 'שדה חובה';
    if (!form.phone.trim()) e.phone = 'שדה חובה';
    else if (!isValidIsraeliPhone(form.phone)) e.phone = 'מספר טלפון לא תקין';
    if (form.companyPhone.trim() && !isValidIsraeliPhone(form.companyPhone)) {
      e.companyPhone = 'מספר טלפון לא תקין';
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
      if (fnError) companyPhoneError = await functionErrorMessage(fnError, data, 'עדכון טלפון החברה נכשל', false);
    }
    setSaving(false);

    if (error) {
      showAlert('שמירה נכשלה', 'לא הצלחנו לשמור את השינויים. נסה שוב');
      return;
    }
    if (companyPhoneError) {
      showAlert('שמירה נכשלה', companyPhoneError);
      return;
    }
    setEditing(false);
    await refresh();
    showToast('נשמר בהצלחה');
  };

  const signOut = () => {
    showAlert('התנתקות', 'להתנתק מהחשבון?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'התנתק', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  if (isDesktop) {
    return (
      <DesktopShell active="AdminProfile" breadcrumbs={['חשבון', 'הפרטים שלי']}>
        {loading ? null : loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : (
          <AdminProfileDesktopView
            fullName={editing ? form.fullName || profile?.full_name || '' : profile?.full_name || ''}
            role="אדמין"
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
          title={editing ? 'עריכת הפרטים' : 'הפרטים שלי'}
          subtitle={company?.name ? `מנהל צי · ${company.name}` : 'מנהל צי'}
          onBack={() => (editing ? setEditing(false) : navigation.goBack())}
          right={!loading && !loadError && !editing ? <HeroButton icon="create-outline" label="עריכת הפרטים" onPress={toggleEdit} /> : undefined}
        />
      }
      footer={
        editing ? (
          <View style={styles.footer}>
            <PrimaryAction label="ביטול" tone="ghost" onPress={() => setEditing(false)} style={styles.footerCancel} />
            <PrimaryAction label="שמירת השינויים" icon="checkmark" onPress={() => void save()} loading={saving} style={styles.footerSave} />
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
              <EditField first label="שם מלא" required value={form.fullName} onChangeText={(v) => set('fullName', v)} error={errors.fullName} />
              <EditField label="טלפון" required value={form.phone} onChangeText={(v) => set('phone', v.replace(/\D/g, ''))} keyboardType="phone-pad" ltr error={errors.phone} />
            </KitSection>
          </Reveal>
          <Reveal index={1}>
            <KitSection title="החברה">
              <EditField first label="טלפון החברה" value={form.companyPhone} onChangeText={(v) => set('companyPhone', v.replace(/\D/g, ''))} keyboardType="phone-pad" ltr error={errors.companyPhone} hint="שאר פרטי החברה נערכים בהגדרות החברה" />
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
                    מנהל צי
                  </DKText>
                </View>
              </View>
            </Surface>
          </Reveal>
          <Reveal index={1}>
            <KitSection title="פרטים אישיים">
              <InfoLine first icon="person" label="שם מלא" value={profile?.full_name} />
              <InfoLine icon="call" label="טלפון" value={profile?.phone ? formatPhone(profile.phone) : null} ltr />
              <InfoLine icon="mail" label="אימייל" value={email} ltr locked />
              <InfoLine icon="calendar" label="הצטרפות" value={profile?.created_at ? formatDate(profile.created_at) : null} locked />
            </KitSection>
          </Reveal>
          <Reveal index={2}>
            <KitSection title="החברה">
              <InfoLine first icon="business" label="שם החברה" value={company?.name} />
              <InfoLine icon="pricetag" label="סוג חברה" value={company?.company_type} />
              <InfoLine icon="card" label="ח.פ / ע.מ" value={company?.business_id} ltr />
              <InfoLine icon="location" label="כתובת" value={company?.address} />
              <InfoLine icon="call" label="טלפון החברה" value={company?.phone ? formatPhone(company.phone) : null} ltr />
              <ListRow icon="settings" title="הגדרות החברה" subtitle="אנשי קשר, קציני בטיחות, לוגו וחותמת" onPress={() => navigation.navigate('CompanySettings')} />
            </KitSection>
          </Reveal>
          <Reveal index={3}>
            <KitSection title="אבטחה">
              <ActionRow icon="lock-closed" label="שינוי סיסמה" hint="סיסמה חדשה לכניסה לאפליקציה" onPress={() => navigation.navigate('SetPassword', { voluntary: true })} />
              <ActionRow first={false} icon="log-out-outline" tone="danger" label="התנתקות מהחשבון" onPress={signOut} />
            </KitSection>
          </Reveal>
        </>
      )}
    </DriverPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 3 },
  alignRight: { textAlign: 'right' },
  identity: { flexDirection: 'row-reverse', alignItems: 'center', gap: 16, padding: 18 },
  roleChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, alignSelf: 'flex-end', marginTop: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: DK.accentSoft },
  footer: { flexDirection: 'row-reverse', gap: 10 },
  footerCancel: { flex: 1 },
  footerSave: { flex: 2 },
});
