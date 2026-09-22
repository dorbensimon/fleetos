import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LoadingState,
  ErrorState,
  AppText,
  BackButton,
  Input,
  useToast,
} from '../components/ui';
import { LiquidGlassSwitch } from '../components/ui/LiquidGlassSwitch';
import { AdminGradientBackground } from '../components/admin/AdminGradientBackground';
import { useCompany } from '../lib/CompanyContext';
import { RootStackParamList } from '../navigation/types';
import { DC_COLORS, DC_SPACING, DC_TYPO } from '../components/driverCard/driverCardTheme';
import {
  ADMIN_NOTIFICATION_TYPES,
  DRIVER_NOTIFICATION_TYPES,
  NotificationType,
  NotificationPreferencesMap,
  getPreferences,
  setPreference,
  getVehicleExpiryLeadDays,
  setVehicleExpiryLeadDays,
  MIN_VEHICLE_EXPIRY_LEAD_DAYS,
  MAX_VEHICLE_EXPIRY_LEAD_DAYS,
} from '../lib/notificationPreferencesApi';
import { useIsDesktop } from '../lib/useDesktopLayout';
import { DesktopShell } from '../components/desktop/DesktopShell';
import { DesktopInput, DText, HoverPressable } from '../components/desktop/primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from '../components/desktop/desktopTheme';

/**
 * Notification preferences, reached from Settings — shared by admin and
 * driver. Each role sees only notification types that are relevant to it.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'NotificationPreferences'>;

export default function NotificationPreferencesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { profile, companyId } = useCompany();
  const { showToast } = useToast();
  const isDesktop = useIsDesktop();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferencesMap | null>(null);
  const [savingType, setSavingType] = useState<NotificationType | null>(null);
  // Company-wide lead time for vehicle folder expiry alerts (admins only).
  const [leadDays, setLeadDays] = useState<number | null>(null);
  const [leadDraft, setLeadDraft] = useState('');
  const [savingLead, setSavingLead] = useState(false);
  const loadRequest = useRef(0);

  const isDriver = profile?.role === 'driver';
  const profileId = profile?.id;
  const visibleTypes = isDriver ? DRIVER_NOTIFICATION_TYPES : ADMIN_NOTIFICATION_TYPES;

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setError(null);
    if (!profileId) {
      if (requestId === loadRequest.current) {
        setError('פרופיל המשתמש אינו זמין');
        setLoading(false);
      }
      return;
    }
    try {
      const data = await getPreferences(profileId);
      if (requestId !== loadRequest.current) return;
      setPrefs(data);
      if (!isDriver && companyId) {
        // Hidden rather than failing the whole screen if the setting can't be read.
        const days = await getVehicleExpiryLeadDays(companyId).catch(() => null);
        if (requestId !== loadRequest.current) return;
        setLeadDays(days);
        setLeadDraft(days != null ? String(days) : '');
      }
    } catch (err: any) {
      if (requestId === loadRequest.current) setError(err?.message ?? 'טעינת ההעדפות נכשלה');
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [profileId, isDriver, companyId]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => { loadRequest.current += 1; };
    }, [load])
  );

  const toggle = async (type: NotificationType, next: boolean) => {
    if (!profileId || !prefs) return;
    const previous = prefs[type];

    // Optimistic + immediate save, per the PRD's "no save button" rule.
    setPrefs({ ...prefs, [type]: next });
    setSavingType(type);
    try {
      await setPreference(profileId, type, next);
    } catch {
      setPrefs((p) => (p ? { ...p, [type]: previous } : p));
      showToast('שמירת ההעדפה נכשלה, נסה שוב');
    } finally {
      setSavingType(null);
    }
  };

  const saveLeadDays = async () => {
    if (!companyId || leadDays == null || savingLead) return;
    const next = Number(leadDraft);
    if (!Number.isInteger(next) || next < MIN_VEHICLE_EXPIRY_LEAD_DAYS || next > MAX_VEHICLE_EXPIRY_LEAD_DAYS) {
      setLeadDraft(String(leadDays));
      showToast(`יש להזין מספר ימים בין ${MIN_VEHICLE_EXPIRY_LEAD_DAYS} ל-${MAX_VEHICLE_EXPIRY_LEAD_DAYS}`);
      return;
    }
    if (next === leadDays) return;
    setSavingLead(true);
    try {
      await setVehicleExpiryLeadDays(companyId, next);
      setLeadDays(next);
      showToast('זמן ההתראה נשמר');
    } catch {
      setLeadDraft(String(leadDays));
      showToast('שמירת זמן ההתראה נכשלה, נסה שוב');
    } finally {
      setSavingLead(false);
    }
  };

  const leadChanged = leadDays != null && leadDraft !== String(leadDays);
  const leadLabel = 'זמן התראה לפני פקיעת תוקף';
  const leadDescription = 'כמה ימים לפני שתוקף של תיקיית רכב פג תישלח התראה. חל על כל המנהלים והנהגים בחברה.';

  if (isDesktop) {
    return (
      <DesktopShell active="NotificationPreferences" breadcrumbs={['חשבון', 'ניהול התראות']}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <ScrollView style={ds.scroll} contentContainerStyle={ds.wrap}>
            {leadDays != null && (
              <View style={ds.card}>
                <View style={[ds.row, ds.rowLast]}>
                  <View style={{ flex: 1 }}>
                    <DText weight="semiBold" style={ds.label}>{leadLabel}</DText>
                    <DText style={ds.description}>{leadDescription}</DText>
                  </View>
                  <View style={ds.leadControl}>
                    <DesktopInput
                      value={leadDraft}
                      onChangeText={(v) => setLeadDraft(v.replace(/\D/g, '').slice(0, 2))}
                      onSubmitEditing={() => void saveLeadDays()}
                      editable={!savingLead}
                      keyboardType="number-pad"
                      ltr
                      style={ds.leadInput}
                    />
                    <DText style={ds.description}>ימים</DText>
                    <HoverPressable
                      style={[ds.confirmBtn, !leadChanged && !savingLead && ds.confirmBtnIdle]}
                      hoverStyle={ds.confirmBtnHover}
                      pressStyle={ds.pressDown}
                      onPress={() => void saveLeadDays()}
                      disabled={!leadChanged || savingLead}
                      accessibilityLabel="שמירת זמן ההתראה"
                    >
                      {savingLead ? <ActivityIndicator size={12} color="#FFFFFF" /> : <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                    </HoverPressable>
                  </View>
                </View>
              </View>
            )}
            <DText style={ds.hint}>בחר אילו עדכונים תרצה לקבל. כל שינוי נשמר מיד עבורך בלבד.</DText>
            <View style={ds.card}>
              {visibleTypes.map((item, index) => (
                <View key={item.type} style={[ds.row, index === visibleTypes.length - 1 && ds.rowLast]}>
                  <View style={{ flex: 1 }}>
                    <DText weight="semiBold" style={ds.label}>{item.label}</DText>
                    {!!item.description && <DText style={ds.description}>{item.description}</DText>}
                  </View>
                  <LiquidGlassSwitch
                    value={prefs?.[item.type] ?? true}
                    onValueChange={(value) => toggle(item.type, value)}
                    disabled={savingType === item.type}
                    accessibilityLabel={item.label}
                    tint={DESKTOP_TONES.ok.fg}
                  />
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </DesktopShell>
    );
  }

  return (
    <View style={styles.screen}>
      <AdminGradientBackground />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 76, paddingBottom: DC_SPACING.listBottomPadding + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <AppText style={[DC_TYPO.largeTitle, styles.title]}>ניהול התראות</AppText>
        {loading ? (
          <View style={styles.state}><LoadingState /></View>
        ) : error ? (
          <View style={styles.state}><ErrorState message={error} onRetry={load} /></View>
        ) : (
          <>
            {leadDays != null && (
              <>
                <AppText style={[DC_TYPO.groupTitle, styles.sectionTitle]}>הגדרות חברה</AppText>
                <View style={[styles.list, styles.leadList]}>
                  <View style={[styles.row, styles.rowLast]}>
                    <View style={styles.rowText}>
                      <AppText style={[DC_TYPO.rowLabel, styles.label]}>{leadLabel}</AppText>
                      <AppText style={styles.description}>{leadDescription}</AppText>
                    </View>
                    <View style={styles.leadControl}>
                      <Input
                        value={leadDraft}
                        onChangeText={(v) => setLeadDraft(v.replace(/\D/g, '').slice(0, 2))}
                        onSubmitEditing={() => void saveLeadDays()}
                        editable={!savingLead}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        textAlign="center"
                        style={styles.leadInput}
                      />
                      <AppText style={styles.description}>ימים</AppText>
                      <Pressable
                        style={({ pressed }) => [styles.confirmBtn, !leadChanged && !savingLead && styles.confirmBtnIdle, pressed && styles.pressDown]}
                        onPress={() => void saveLeadDays()}
                        disabled={!leadChanged || savingLead}
                        accessibilityRole="button"
                        accessibilityLabel="שמירת זמן ההתראה"
                      >
                        {savingLead ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="checkmark" size={17} color="#FFFFFF" />}
                      </Pressable>
                    </View>
                  </View>
                </View>
              </>
            )}
            <AppText style={styles.hint}>בחר אילו עדכונים תרצה לקבל. כל שינוי נשמר מיד עבורך בלבד.</AppText>
            <AppText style={[DC_TYPO.groupTitle, styles.sectionTitle]}>העדפות אישיות</AppText>
            <View style={styles.list}>
              {visibleTypes.map((item, index) => (
                <View key={item.type} style={[styles.row, index === visibleTypes.length - 1 && styles.rowLast]}>
                  <View style={styles.rowText}>
                    <AppText style={[DC_TYPO.rowLabel, styles.label]}>{item.label}</AppText>
                    {!!item.description && <AppText style={styles.description}>{item.description}</AppText>}
                  </View>
                  <LiquidGlassSwitch
                    value={prefs?.[item.type] ?? true}
                    onValueChange={(value) => toggle(item.type, value)}
                    disabled={savingType === item.type}
                    accessibilityLabel={item.label}
                  />
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <View style={[styles.backButton, { top: insets.top + 12 }]}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DC_COLORS.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: DC_SPACING.screenPaddingH },
  title: { color: DC_COLORS.label, textAlign: 'right', writingDirection: 'rtl', marginBottom: 26 },
  hint: { color: DC_COLORS.labelSecondary, fontSize: 14, textAlign: 'right', writingDirection: 'rtl', marginBottom: 26 },
  sectionTitle: { color: DC_COLORS.labelTertiary, textAlign: 'right', writingDirection: 'rtl', marginBottom: 8, marginRight: 2 },
  list: { backgroundColor: DC_COLORS.surface, borderRadius: DC_SPACING.groupRadius, overflow: 'hidden' },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: DC_SPACING.iconTextGap,
    minHeight: 62,
    paddingHorizontal: DC_SPACING.rowPaddingH,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: DC_COLORS.separator,
  },
  rowLast: { borderBottomWidth: 0 },
  rowText: { flex: 1, gap: 3 },
  label: { color: DC_COLORS.label, textAlign: 'right', writingDirection: 'rtl' },
  description: { color: DC_COLORS.labelSecondary, fontSize: 12.5, textAlign: 'right', writingDirection: 'rtl' },
  state: { paddingTop: 36 },
  leadList: { marginBottom: 26 },
  leadControl: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  leadInput: { width: 56, height: 38, paddingHorizontal: 6 },
  confirmBtn: { width: 34, height: 34, borderRadius: 9, backgroundColor: DC_COLORS.blue, alignItems: 'center', justifyContent: 'center' },
  confirmBtnIdle: { opacity: 0.35 },
  pressDown: { transform: [{ scale: 0.97 }] },
  backButton: { position: 'absolute', right: 16 },
});

const ds = StyleSheet.create({
  // The list outgrows the viewport, so the desktop body scrolls on its own inside the shell.
  scroll: { flex: 1 },
  wrap: { padding: 24, paddingBottom: 48, maxWidth: 520, alignSelf: 'center', width: '100%', gap: 12 },
  hint: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint },
  card: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 8, paddingHorizontal: 16 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  rowLast: { borderBottomWidth: 0 },
  label: { fontSize: 13 },
  description: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint, marginTop: 2 },
  leadControl: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  leadInput: { width: 52 },
  // Same chip as the vehicle card's inline ✓ (VehicleDetailDesktopView).
  confirmBtn: { width: 26, height: 26, borderRadius: 6, backgroundColor: DESKTOP_COLORS.brand, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'opacity 150ms ease, transform 120ms ease-out' }) },
  confirmBtnIdle: { opacity: 0.35 },
  confirmBtnHover: { opacity: 0.88 },
  pressDown: { transform: [{ scale: 0.97 }] },
});
