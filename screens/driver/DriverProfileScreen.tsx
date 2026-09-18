import React, { useCallback, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, BackButton, ErrorState, LoadingState, useToast } from '../../components/ui';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { COLORS, CONTENT_MAX_WIDTH, FONT, formatDate } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { getDriver, listDepartments, updateDriver, type Department, type DriverRow } from '../../lib/adminApi';
import { formatPhone, isValidIsraeliPhone } from '../../lib/phone';
import { RootStackParamList } from '../../navigation/types';
import { departmentNameById } from '../../lib/driverFields';
import { showAlert } from '../../lib/platformAlert';
import { GlassPill, GLASS_SHADOW_COLOR } from '../../components/ui/GlassPill';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DesktopFieldRow, DesktopInput, DText, HoverPressable } from '../../components/desktop/primitives';
import { DESKTOP_COLORS } from '../../components/desktop/desktopTheme';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverProfile'>;

export default function DriverProfileScreen({ navigation }: Props) {
  const { profile, company, companyId } = useCompany();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);
  const hasLoadedOnce = useRef(false);

  const [editMode, setEditMode] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ full_name?: string; phone?: string }>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    // Only show the full-screen loading state on the very first load — a
    // background refetch on refocus (e.g. returning from a pushed screen)
    // must not remount the ScrollView, or the user's scroll position resets
    // to the top every time they navigate back.
    if (!hasLoadedOnce.current) setLoading(true);
    setError(null);
    if (!profile) {
      setError('פרופיל הנהג אינו זמין');
      setLoading(false);
      return;
    }
    try {
      const [loadedDriver, { data: auth }, deps] = await Promise.all([
        getDriver(profile.id),
        supabase.auth.getUser(),
        companyId ? listDepartments(companyId) : Promise.resolve([]),
      ]);
      if (requestId !== loadRequest.current) return;
      setDriver(loadedDriver);
      setEmail(auth.user?.email ?? null);
      setDepartments(deps);
      hasLoadedOnce.current = true;
    } catch (err: any) {
      if (requestId === loadRequest.current) setError(err?.message ?? 'טעינת הפרטים נכשלה');
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [profile, companyId]);

  useFocusEffect(useCallback(() => {
    load();
    return () => { loadRequest.current += 1; };
  }, [load]));

  const toggleEdit = () => {
    if (editMode) {
      void saveEdit();
      return;
    }
    setNameDraft(driver?.full_name ?? '');
    setPhoneDraft(driver?.phone ?? '');
    setFieldErrors({});
    setEditMode(true);
  };

  const saveEdit = async () => {
    if (!profile) return;
    const errors: { full_name?: string; phone?: string } = {};
    if (!nameDraft.trim()) errors.full_name = 'שדה חובה';
    if (!phoneDraft.trim()) errors.phone = 'שדה חובה';
    else if (!isValidIsraeliPhone(phoneDraft)) errors.phone = 'מספר טלפון לא תקין';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await updateDriver(profile.id, { full_name: nameDraft.trim(), phone: phoneDraft.trim() });
      setDriver((prev) => (prev ? { ...prev, full_name: nameDraft.trim(), phone: phoneDraft.trim() } : prev));
      setEditMode(false);
      showToast('נשמר בהצלחה');
    } catch (err: any) {
      showAlert('השמירה נכשלה', err?.message ?? 'נסה שוב');
    } finally {
      setSaving(false);
    }
  };

  const signOut = () => showAlert('התנתקות', 'להתנתק מהחשבון?', [
    { text: 'ביטול', style: 'cancel' },
    { text: 'התנתק', style: 'destructive', onPress: () => supabase.auth.signOut() },
  ]);
  const departmentName = departmentNameById(departments, driver?.department_id);

  if (isDesktop) {
    return (
      <DesktopShell active="DriverProfile" breadcrumbs={['חשבון', 'הפרטים שלי']}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <View style={ds.wrap}>
            <View style={ds.headRow}>
              <DText weight="bold" style={ds.heading}>{driver?.full_name || '—'}</DText>
              <HoverPressable style={ds.editButton} onPress={toggleEdit} disabled={saving}>
                <DText weight="semiBold" style={ds.editButtonText}>{editMode ? (saving ? 'שומר…' : 'שמירה') : 'עריכה'}</DText>
              </HoverPressable>
            </View>

            <DText weight="bold" style={ds.sectionTitle}>פרטים אישיים</DText>
            <View style={ds.card}>
              <DesktopFieldRow label="אימייל"><DesktopInput value={email ?? ''} editable={false} ltr /></DesktopFieldRow>
              <DesktopFieldRow label="טלפון" error={fieldErrors.phone}>
                {editMode ? (
                  <DesktopInput value={phoneDraft} onChangeText={setPhoneDraft} keyboardType="phone-pad" ltr hasError={!!fieldErrors.phone} />
                ) : (
                  <DesktopInput value={driver?.phone ? formatPhone(driver.phone) : ''} editable={false} ltr />
                )}
              </DesktopFieldRow>
              <DesktopFieldRow label="שם מלא" error={fieldErrors.full_name}>
                {editMode ? (
                  <DesktopInput value={nameDraft} onChangeText={setNameDraft} hasError={!!fieldErrors.full_name} />
                ) : (
                  <DesktopInput value={driver?.full_name ?? ''} editable={false} />
                )}
              </DesktopFieldRow>
              <DesktopFieldRow label="תפקיד" last><DesktopInput value="נהג" editable={false} /></DesktopFieldRow>
            </View>

            <DText weight="bold" style={ds.sectionTitle}>פרטי עבודה</DText>
            <View style={ds.card}>
              <DesktopFieldRow label="חברה"><DesktopInput value={company?.name ?? ''} editable={false} /></DesktopFieldRow>
              <DesktopFieldRow label="מספר עובד"><DesktopInput value={driver?.employee_number ?? ''} editable={false} /></DesktopFieldRow>
              <DesktopFieldRow label="מחלקה" last><DesktopInput value={departmentName ?? ''} editable={false} /></DesktopFieldRow>
            </View>

            <DText weight="bold" style={ds.sectionTitle}>רישיון נהיגה</DText>
            <View style={ds.card}>
              <DesktopFieldRow label="תעודת זהות"><DesktopInput value={driver?.national_id ?? ''} editable={false} ltr /></DesktopFieldRow>
              <DesktopFieldRow label="דרגת רישיון"><DesktopInput value={driver?.license_classes ?? ''} editable={false} /></DesktopFieldRow>
              <DesktopFieldRow label="תוקף רישיון"><DesktopInput value={driver?.license_expiry ? formatDate(driver.license_expiry) : ''} editable={false} ltr /></DesktopFieldRow>
              <DesktopFieldRow label="הצטרפות לאפליקציה" last><DesktopInput value={driver?.created_at ? formatDate(driver.created_at) : ''} editable={false} ltr /></DesktopFieldRow>
            </View>

            <HoverPressable style={ds.signOutButton} onPress={signOut}>
              <DText weight="semiBold" style={ds.signOutText}>התנתקות</DText>
            </HoverPressable>
          </View>
        )}
      </DesktopShell>
    );
  }

  return (
    <View style={styles.screen}>
      <AdminGradientBackground />
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity onPress={signOut} activeOpacity={0.8}>
          <GlassPill size={40} blur={14} bg="rgba(255,255,255,.4)"><Ionicons name="log-out-outline" size={20} color={COLORS.text} /></GlassPill>
        </TouchableOpacity>
        <AppText weight="bold" style={styles.headerCompany} numberOfLines={1}>{company?.name ?? ''}</AppText>
        <BackButton onPress={() => navigation.goBack()} />
      </View>

      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.profileBlock}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}><Ionicons name="person" size={40} color="rgba(0,0,0,.28)" /></View>
              <TouchableOpacity onPress={toggleEdit} activeOpacity={0.8} style={styles.editBadgeWrap} disabled={saving}>
                <GlassPill size={28} blur={10} bg="rgba(255,255,255,.55)">
                  <Ionicons name={editMode ? 'checkmark' : 'pencil'} size={13} color={COLORS.text} />
                </GlassPill>
              </TouchableOpacity>
            </View>
            <AppText weight="bold" style={styles.name}>{editMode ? nameDraft || driver?.full_name : driver?.full_name || '—'}</AppText>
            <AppText style={styles.role}>נהג</AppText>
          </View>

          <SectionLabel text="פרטים אישיים" />
          <GlassCard>
            <Row icon="mail-outline" label="אימייל" value={email} first readOnly />
            <Row icon="call-outline" label="טלפון" value={phoneDraft ? formatPhone(phoneDraft) : driver?.phone ? formatPhone(driver.phone) : null} editing={editMode} align="left" error={fieldErrors.phone} inputValue={phoneDraft} onChangeText={setPhoneDraft} keyboardType="phone-pad" />
            <Row icon="person-outline" label="שם מלא" value={nameDraft || driver?.full_name} editing={editMode} error={fieldErrors.full_name} inputValue={nameDraft} onChangeText={setNameDraft} />
            <Row icon="star-outline" label="תפקיד" value="נהג" readOnly />
          </GlassCard>

          <SectionLabel text="פרטי עבודה" />
          <GlassCard>
            <Row icon="business-outline" label="חברה" value={company?.name} first readOnly />
            <Row icon="briefcase-outline" label="מספר עובד" value={driver?.employee_number} readOnly />
            <Row icon="people-outline" label="מחלקה" value={departmentName} readOnly />
          </GlassCard>

          <SectionLabel text="רישיון נהיגה" />
          <GlassCard>
            <Row icon="card-outline" label="תעודת זהות" value={driver?.national_id} first readOnly />
            <Row icon="ribbon-outline" label="דרגת רישיון" value={driver?.license_classes} readOnly />
            <Row icon="calendar-outline" label="תוקף רישיון" value={driver?.license_expiry ? formatDate(driver.license_expiry) : null} readOnly />
            <Row icon="time-outline" label="תאריך הצטרפות לאפליקציה" value={driver?.created_at ? formatDate(driver.created_at) : null} readOnly />
          </GlassCard>
        </ScrollView>
      )}
    </View>
  );
}

function GlassCard({ children }: { children: React.ReactNode }) {
  return <View style={cardStyles.wrap}><BlurView intensity={22} tint="light" style={StyleSheet.absoluteFill} /><View style={cardStyles.tint} /><View>{children}</View></View>;
}

function SectionLabel({ text }: { text: string }) { return <AppText weight="bold" style={styles.sectionLabel}>{text}</AppText>; }

function Row({
  icon, label, value, first, readOnly, editing, align = 'right', error, inputValue, onChangeText, keyboardType,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value?: string | null; first?: boolean; readOnly?: boolean;
  editing?: boolean; align?: 'left' | 'right'; error?: string; inputValue?: string; onChangeText?: (value: string) => void;
  keyboardType?: TextInput['props']['keyboardType'];
}) {
  const canEdit = !readOnly && !!onChangeText;
  const showInput = canEdit && editing;
  return <View style={[rowStyles.row, !first && rowStyles.divider]}>
    <Ionicons name={icon} size={19} color="rgba(0,0,0,.45)" style={rowStyles.icon} />
    <AppText style={rowStyles.label}>{label}</AppText>
    <View style={{ flex: 1 }} />
    {showInput ? (
      <View style={rowStyles.inputWrap}>
        <TextInput value={inputValue} onChangeText={onChangeText} textAlign={align} keyboardType={keyboardType} placeholderTextColor="rgba(0,0,0,.3)" style={[rowStyles.input, error && rowStyles.inputErrorBorder]} />
        {!!error && <AppText style={rowStyles.errorText}>{error}</AppText>}
      </View>
    ) : <AppText style={rowStyles.value} numberOfLines={1}>{value || '—'}</AppText>}
  </View>;
}
const cardStyles = StyleSheet.create({ wrap: { overflow: 'hidden', borderRadius: 22, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.6)', ...Platform.select({ ios: { shadowColor: GLASS_SHADOW_COLOR, shadowOpacity: 0.12, shadowOffset: { width: 0, height: 8 }, shadowRadius: 24 }, android: { elevation: 4 } }) }, tint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(255,255,255,0.42)' } });
const rowStyles = StyleSheet.create({ row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 }, divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,.08)' }, icon: { flexShrink: 0 }, label: { fontSize: 14.5, color: COLORS.text, flexShrink: 0 }, value: { fontSize: 14.5, color: 'rgba(0,0,0,.5)', flexShrink: 1, textAlign: 'left' }, inputWrap: { maxWidth: 170, alignItems: 'flex-end' }, input: { fontSize: 14.5, color: COLORS.text, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,.15)', paddingVertical: 2, minWidth: 90, fontFamily: FONT.regular }, inputErrorBorder: { borderBottomColor: COLORS.dangerText }, errorText: { fontSize: 11, color: COLORS.dangerText, marginTop: 2 } });
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#F2F2F7' }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' }, headerCompany: { flex: 1, fontSize: 16, color: COLORS.text, textAlign: 'center', marginHorizontal: 8 },
  // Without an explicit flex here, ScrollView (a plain div under react-native-web)
  // sizes to its own content instead of stretching into the remaining flex
  // space under `header`/`editBar`, so on web the whole page scrolls instead
  // of just this area.
  scroll: { flex: 1 },
  content: { padding: 20, paddingTop: 18, paddingBottom: 40, gap: 4, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' }, profileBlock: { alignItems: 'center', paddingVertical: 18 }, avatarWrap: { width: 84, height: 84 }, avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(0,0,0,.06)', alignItems: 'center', justifyContent: 'center' }, editBadgeWrap: { position: 'absolute', bottom: -2, left: -2 }, name: { fontSize: 17, color: COLORS.text, marginTop: 12 }, role: { fontSize: 13, color: 'rgba(20,20,30,.6)', marginTop: 2 }, sectionLabel: { fontSize: 12, color: 'rgba(20,20,30,.55)', paddingBottom: 8, paddingTop: 12 } });

const ds = StyleSheet.create({
  wrap: { padding: 24, maxWidth: 520, alignSelf: 'center', width: '100%', gap: 6 },
  headRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  heading: { fontSize: 16 },
  editButton: { height: 30, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, borderColor: DESKTOP_COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: DESKTOP_COLORS.surface },
  editButtonText: { fontSize: 12, color: DESKTOP_COLORS.brand },
  sectionTitle: { fontSize: 12, letterSpacing: 0.4, color: DESKTOP_COLORS.inkMuted, marginTop: 10, marginBottom: 6 },
  card: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 8, paddingHorizontal: 16 },
  signOutButton: { alignSelf: 'center', marginTop: 20, height: 32, paddingHorizontal: 16, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  signOutText: { fontSize: 12.5, color: DESKTOP_COLORS.danger },
});
