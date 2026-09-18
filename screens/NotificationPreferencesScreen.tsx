import React, { useCallback, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LoadingState,
  ErrorState,
  AppText,
  BackButton,
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
} from '../lib/notificationPreferencesApi';
import { useIsDesktop } from '../lib/useDesktopLayout';
import { DesktopShell } from '../components/desktop/DesktopShell';
import { DText } from '../components/desktop/primitives';
import { DESKTOP_COLORS, DESKTOP_TONES } from '../components/desktop/desktopTheme';

/**
 * Notification preferences, reached from Settings — shared by admin and
 * driver. Each role sees only notification types that are relevant to it.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'NotificationPreferences'>;

export default function NotificationPreferencesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { profile } = useCompany();
  const { showToast } = useToast();
  const isDesktop = useIsDesktop();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferencesMap | null>(null);
  const [savingType, setSavingType] = useState<NotificationType | null>(null);
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
    } catch (err: any) {
      if (requestId === loadRequest.current) setError(err?.message ?? 'טעינת ההעדפות נכשלה');
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [profileId]);

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

  if (isDesktop) {
    return (
      <DesktopShell active="NotificationPreferences" breadcrumbs={['חשבון', 'ניהול התראות']}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <View style={ds.wrap}>
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
          </View>
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
  backButton: { position: 'absolute', right: 16 },
});

const ds = StyleSheet.create({
  wrap: { padding: 24, maxWidth: 520, alignSelf: 'center', width: '100%', gap: 12 },
  hint: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint },
  card: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 8, paddingHorizontal: 16 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 52, borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  rowLast: { borderBottomWidth: 0 },
  label: { fontSize: 13 },
  description: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint, marginTop: 2 },
});
