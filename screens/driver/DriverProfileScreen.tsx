import React, { useCallback, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, ErrorState, LoadingState } from '../../components/ui';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { formatDate } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { getDriver, listDepartments, type Department, type DriverRow } from '../../lib/adminApi';
import { formatPhone } from '../../lib/phone';
import { RootStackParamList } from '../../navigation/types';
import { departmentNameById } from '../../lib/driverFields';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverProfile'>;

export default function DriverProfileScreen({ navigation }: Props) {
  const { profile, company, companyId } = useCompany();
  const insets = useSafeAreaInsets();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
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

  const startEdit = () => profile && navigation.navigate('DriverForm', { driverId: profile.id });
  const signOut = () => Alert.alert('התנתקות', 'להתנתק מהחשבון?', [
    { text: 'ביטול', style: 'cancel' },
    { text: 'התנתק', style: 'destructive', onPress: () => supabase.auth.signOut() },
  ]);
  const departmentName = departmentNameById(departments, driver?.department_id);

  return (
    <View style={styles.screen}>
      <AdminGradientBackground />
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity onPress={signOut} activeOpacity={0.8}>
          <GlassPill size={40} blur={14} bg="rgba(255,255,255,.4)"><Ionicons name="log-out-outline" size={20} color="#1a1a1a" /></GlassPill>
        </TouchableOpacity>
        <AppText weight="bold" style={styles.headerCompany} numberOfLines={1}>{company?.name ?? ''}</AppText>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <GlassPill size={40} blur={14} bg="rgba(255,255,255,.4)"><Ionicons name="chevron-forward" size={20} color="#1a1a1a" /></GlassPill>
        </TouchableOpacity>
      </View>

      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.profileBlock}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}><Ionicons name="person" size={40} color="rgba(0,0,0,.28)" /></View>
              <TouchableOpacity onPress={startEdit} activeOpacity={0.8} style={styles.editBadgeWrap}>
                <GlassPill size={28} blur={10} bg="rgba(255,255,255,.55)"><Ionicons name="pencil" size={13} color="#1a1a1a" /></GlassPill>
              </TouchableOpacity>
            </View>
            <AppText weight="bold" style={styles.name}>{driver?.full_name || '—'}</AppText>
            <AppText style={styles.role}>נהג</AppText>
          </View>

          <SectionLabel text="פרטים אישיים" />
          <GlassCard>
            <Row icon="mail-outline" label="אימייל" value={email} first readOnly />
            <Row icon="call-outline" label="טלפון" value={driver?.phone ? formatPhone(driver.phone) : null} />
            <Row icon="person-outline" label="שם מלא" value={driver?.full_name} />
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

function GlassPill({ size, blur, bg, children }: { size: number; blur: number; bg: string; children: React.ReactNode }) {
  return <View style={[pillStyles.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
    <BlurView intensity={blur} tint="light" style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: bg, borderRadius: size / 2, borderWidth: 0.5, borderColor: 'rgba(255,255,255,.6)' }]} />
    <View style={pillStyles.content}>{children}</View>
  </View>;
}

function GlassCard({ children }: { children: React.ReactNode }) {
  return <View style={cardStyles.wrap}><BlurView intensity={22} tint="light" style={StyleSheet.absoluteFill} /><View style={cardStyles.tint} /><View>{children}</View></View>;
}

function SectionLabel({ text }: { text: string }) { return <AppText weight="bold" style={styles.sectionLabel}>{text}</AppText>; }

function Row({ icon, label, value, first, readOnly }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value?: string | null; first?: boolean; readOnly?: boolean }) {
  return <View style={[rowStyles.row, !first && rowStyles.divider]}>
    <Ionicons name={icon} size={19} color="rgba(0,0,0,.45)" style={rowStyles.icon} />
    <AppText style={rowStyles.label}>{label}</AppText>
    <View style={{ flex: 1 }} />
    <AppText style={rowStyles.value} numberOfLines={1}>{value || '—'}</AppText>
    {!readOnly && <Ionicons name="chevron-back" size={15} color="rgba(0,0,0,.25)" style={{ marginStart: 4 }} />}
  </View>;
}

const pillStyles = StyleSheet.create({ wrap: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', ...Platform.select({ ios: { shadowColor: '#505a82', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8 }, android: { elevation: 3 } }) }, content: { alignItems: 'center', justifyContent: 'center' } });
const cardStyles = StyleSheet.create({ wrap: { overflow: 'hidden', borderRadius: 22, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.6)', ...Platform.select({ ios: { shadowColor: '#505a82', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 8 }, shadowRadius: 24 }, android: { elevation: 4 } }) }, tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.42)' } });
const rowStyles = StyleSheet.create({ row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 }, divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,.08)' }, icon: { flexShrink: 0 }, label: { fontSize: 14.5, color: '#1a1a1a', flexShrink: 0 }, value: { fontSize: 14.5, color: 'rgba(0,0,0,.5)', flexShrink: 1, textAlign: 'left' } });
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#F2F2F7' }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }, headerCompany: { flex: 1, fontSize: 16, color: '#1a1a1a', textAlign: 'center', marginHorizontal: 8 }, content: { padding: 20, paddingTop: 18, paddingBottom: 40, gap: 4 }, profileBlock: { alignItems: 'center', paddingVertical: 18 }, avatarWrap: { width: 84, height: 84 }, avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(0,0,0,.06)', alignItems: 'center', justifyContent: 'center' }, editBadgeWrap: { position: 'absolute', bottom: -2, left: -2 }, name: { fontSize: 17, color: '#1a1a1a', marginTop: 12 }, role: { fontSize: 13, color: 'rgba(20,20,30,.6)', marginTop: 2 }, sectionLabel: { fontSize: 12, color: 'rgba(20,20,30,.55)', paddingBottom: 8, paddingTop: 12 } });
