import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, Alert, TextInput, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, LoadingState, ErrorState, useToast } from '../../components/ui';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { COLORS, FONT, formatDate } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { updateCompanyPhone } from '../../lib/companyApi';
import { formatPhone, isValidIsraeliPhone } from '../../lib/phone';
import { RootStackParamList } from '../../navigation/types';

/** The logged-in admin's own details, reached from the hamburger menu. */
type Props = NativeStackScreenProps<RootStackParamList, 'AdminProfile'>;

export default function AdminProfileScreen({ navigation }: Props) {
  const { profile, company, refresh } = useCompany();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
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
      const { error: fnError } = await updateCompanyPhone(company.id, form.companyPhone.trim());
      if (fnError) companyPhoneError = fnError.message || 'עדכון טלפון החברה נכשל';
    }
    setSaving(false);

    if (error) {
      Alert.alert('שמירה נכשלה', 'לא הצלחנו לשמור את השינויים. נסה שוב');
      return;
    }
    if (companyPhoneError) {
      Alert.alert('שמירה נכשלה', companyPhoneError);
      return;
    }
    setEditing(false);
    await refresh();
    showToast('נשמר בהצלחה');
  };

  const signOut = () => {
    Alert.alert('התנתקות', 'להתנתק מהחשבון?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'התנתק', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  return (
    <View style={styles.screen}>
      <AdminGradientBackground />

      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity onPress={signOut} activeOpacity={0.8}>
          <GlassPill size={40} blur={14} bg="rgba(255,255,255,.4)">
            <Ionicons name="log-out-outline" size={20} color="#1a1a1a" />
          </GlassPill>
        </TouchableOpacity>
        <AppText weight="bold" style={styles.headerCompany} numberOfLines={1}>
          {company?.name ?? ''}
        </AppText>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <GlassPill size={40} blur={14} bg="rgba(255,255,255,.4)">
            <Ionicons name="chevron-forward" size={20} color="#1a1a1a" />
          </GlassPill>
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.profileBlock}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={40} color="rgba(0,0,0,.28)" />
              </View>
              <TouchableOpacity onPress={toggleEdit} activeOpacity={0.8} style={styles.editBadgeWrap} disabled={saving}>
                <GlassPill size={28} blur={10} bg="rgba(255,255,255,.55)">
                  <Ionicons name={editing ? 'checkmark' : 'pencil'} size={13} color="#1a1a1a" />
                </GlassPill>
              </TouchableOpacity>
            </View>
            <AppText weight="bold" style={styles.name}>
              {editing ? form.fullName || profile?.full_name : profile?.full_name || '—'}
            </AppText>
            <AppText style={styles.role}>אדמין</AppText>
          </View>

          <SectionLabel text="פרטים אישיים" />
          <GlassCard>
            <Row icon="mail-outline" label="אימייל" value={email} first />
            <Row
              icon="call-outline"
              label="טלפון"
              value={form.phone ? formatPhone(form.phone) : profile?.phone ? formatPhone(profile.phone) : null}
              editing={editing}
              align="left"
              error={errors.phone}
              onChangeText={(v) => setForm((f) => ({ ...f, phone: v.replace(/\D/g, '') }))}
              inputValue={form.phone}
              keyboardType="phone-pad"
            />
            <Row
              icon="person-outline"
              label="שם מלא"
              value={form.fullName || profile?.full_name}
              editing={editing}
              align="right"
              error={errors.fullName}
              onChangeText={(v) => setForm((f) => ({ ...f, fullName: v }))}
              inputValue={form.fullName}
            />
            <Row icon="star-outline" label="תפקיד" value="אדמין" readOnly />
          </GlassCard>

          <SectionLabel text="פרטי חברה" />
          <GlassCard>
            <Row icon="business-outline" label="שם החברה" value={company?.name} first />
            <Row icon="pricetag-outline" label="סוג חברה" value={company?.company_type} />
            <Row icon="card-outline" label="ח.פ / ע.מ" value={company?.business_id} />
            <Row icon="location-outline" label="כתובת החברה" value={company?.address} />
            <Row
              icon="call-outline"
              label="טלפון החברה"
              value={form.companyPhone ? formatPhone(form.companyPhone) : company?.phone ? formatPhone(company.phone) : null}
              editing={editing}
              align="left"
              error={errors.companyPhone}
              onChangeText={(v) => setForm((f) => ({ ...f, companyPhone: v.replace(/\D/g, '') }))}
              inputValue={form.companyPhone}
              keyboardType="phone-pad"
            />
          </GlassCard>

          <SectionLabel text="" />
          <GlassCard>
            <Row icon="calendar-outline" label="תאריך הצטרפות" value={profile?.created_at ? formatDate(profile.created_at) : null} first readOnly />
          </GlassCard>
        </ScrollView>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Local glass components                                             */
/* ------------------------------------------------------------------ */

function GlassPill({
  size,
  blur,
  bg,
  children,
}: {
  size: number;
  blur: number;
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        pillStyles.wrap,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <BlurView intensity={blur} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: bg, borderRadius: size / 2, borderWidth: 0.5, borderColor: 'rgba(255,255,255,.6)' }]} />
      <View style={pillStyles.content}>{children}</View>
    </View>
  );
}

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={cardStyles.wrap}>
      <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFill} />
      <View style={cardStyles.tint} />
      <View>{children}</View>
    </View>
  );
}

function SectionLabel({ text }: { text: string }) {
  if (!text) return <View style={{ height: 0 }} />;
  return <AppText weight="bold" style={styles.sectionLabel}>{text}</AppText>;
}

function Row({
  icon,
  label,
  value,
  first,
  readOnly,
  editing,
  align = 'right',
  error,
  inputValue,
  onChangeText,
  keyboardType,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string | null;
  first?: boolean;
  readOnly?: boolean;
  editing?: boolean;
  align?: 'left' | 'right';
  error?: string;
  inputValue?: string;
  onChangeText?: (v: string) => void;
  keyboardType?: TextInput['props']['keyboardType'];
}) {
  const canEdit = !readOnly && !!onChangeText;
  const showInput = canEdit && editing;
  return (
    <View style={[rowStyles.row, !first && rowStyles.divider]}>
      <Ionicons name={icon} size={19} color="rgba(0,0,0,.45)" style={rowStyles.icon} />
      <AppText style={rowStyles.label}>{label}</AppText>
      <View style={{ flex: 1 }} />
      {showInput ? (
        <View style={rowStyles.inputWrap}>
          <TextInput
            value={inputValue}
            onChangeText={onChangeText}
            textAlign={align}
            keyboardType={keyboardType}
            placeholderTextColor="rgba(0,0,0,.3)"
            style={[rowStyles.input, error && rowStyles.inputErrorBorder]}
          />
          {!!error && (
            <AppText style={rowStyles.errorText}>{error}</AppText>
          )}
        </View>
      ) : (
        <>
          <AppText style={rowStyles.value} numberOfLines={1}>
            {value || '—'}
          </AppText>
          {canEdit && <Ionicons name="chevron-back" size={15} color="rgba(0,0,0,.25)" style={{ marginStart: 4 }} />}
        </>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */

const pillStyles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#505a82',
        shadowOpacity: 0.18,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  content: { alignItems: 'center', justifyContent: 'center' },
});

const cardStyles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.6)',
    ...Platform.select({
      ios: {
        shadowColor: '#505a82',
        shadowOpacity: 0.12,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 24,
      },
      android: { elevation: 4 },
    }),
  },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.42)' },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,.08)' },
  icon: { flexShrink: 0 },
  label: { fontSize: 14.5, color: '#1a1a1a', flexShrink: 0 },
  value: { fontSize: 14.5, color: 'rgba(0,0,0,.5)', flexShrink: 1, textAlign: 'left' },
  inputWrap: { maxWidth: 170, alignItems: 'flex-end' },
  input: {
    fontSize: 14.5,
    color: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,.15)',
    paddingVertical: 2,
    minWidth: 90,
    fontFamily: FONT.regular,
  },
  inputErrorBorder: { borderBottomColor: COLORS.dangerText },
  errorText: { fontSize: 11, color: COLORS.dangerText, marginTop: 2 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  headerCompany: { flex: 1, fontSize: 16, color: '#1a1a1a', textAlign: 'center', marginHorizontal: 8 },
  content: { padding: 20, paddingTop: 18, paddingBottom: 40, gap: 4 },
  profileBlock: { alignItems: 'center', paddingVertical: 18 },
  avatarWrap: { width: 84, height: 84 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(0,0,0,.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadgeWrap: { position: 'absolute', bottom: -2, left: -2 },
  name: { fontSize: 17, color: '#1a1a1a', marginTop: 12 },
  role: { fontSize: 13, color: 'rgba(20,20,30,.6)', marginTop: 2 },
  sectionLabel: { fontSize: 12, color: 'rgba(20,20,30,.55)', paddingBottom: 8, paddingTop: 12 },
});
