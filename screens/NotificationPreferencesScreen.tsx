import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Screen,
  ScreenHeader,
  Card,
  ToggleRow,
  LoadingState,
  ErrorState,
  AppText,
  useToast,
} from '../components/ui';
import { AdminGradientBackground } from '../components/admin/AdminGradientBackground';
import { COLORS, SPACING } from '../lib/theme';
import { useCompany } from '../lib/CompanyContext';
import { RootStackParamList } from '../navigation/types';
import {
  ADMIN_NOTIFICATION_TYPES,
  DRIVER_NOTIFICATION_TYPES,
  NotificationType,
  NotificationPreferencesMap,
  getPreferences,
  setPreference,
} from '../lib/notificationPreferencesApi';

/**
 * Notification preferences, reached from Settings — shared by admin and
 * driver. Each role sees only notification types that are relevant to it.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'NotificationPreferences'>;

export default function NotificationPreferencesScreen({ navigation }: Props) {
  const { profile } = useCompany();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferencesMap | null>(null);
  const [savingType, setSavingType] = useState<NotificationType | null>(null);
  const loadRequest = useRef(0);

  const isDriver = profile?.role === 'driver';
  const isAdmin = profile?.role === 'admin';
  const visibleTypes = isDriver ? DRIVER_NOTIFICATION_TYPES : ADMIN_NOTIFICATION_TYPES;

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setError(null);
    if (!profile?.id) {
      if (requestId === loadRequest.current) {
        setError('פרופיל המשתמש אינו זמין');
        setLoading(false);
      }
      return;
    }
    try {
      const data = await getPreferences(profile.id);
      if (requestId !== loadRequest.current) return;
      setPrefs(data);
    } catch (err: any) {
      if (requestId === loadRequest.current) setError(err?.message ?? 'טעינת ההעדפות נכשלה');
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => { loadRequest.current += 1; };
    }, [load])
  );

  const toggle = async (type: NotificationType, next: boolean) => {
    if (!profile?.id || !prefs) return;
    const previous = prefs[type];

    // Optimistic + immediate save, per the PRD's "no save button" rule.
    setPrefs({ ...prefs, [type]: next });
    setSavingType(type);
    try {
      await setPreference(profile.id, type, next);
    } catch (err: any) {
      setPrefs((p) => (p ? { ...p, [type]: previous } : p));
      showToast('שמירת ההעדפה נכשלה, נסה שוב');
    } finally {
      setSavingType(null);
    }
  };

  return (
    <Screen>
      {isAdmin && <AdminGradientBackground />}
      <ScreenHeader title="ניהול התראות" subtitle="ניהול העדפות התראה" onBack={() => navigation.goBack()} />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <View style={styles.content}>
          <ErrorState message={error} onRetry={load} />
        </View>
      ) : (
        <View style={styles.content}>
          <AppText style={styles.hint}>
            שליטה על ההתראות שאתה מקבל באפליקציה. השינוי נשמר באופן מיידי.
          </AppText>
          <Card style={styles.card}>
            {visibleTypes.map((item, index) => (
              <View key={item.type} style={index > 0 ? styles.divider : undefined}>
                <ToggleRow
                  label={item.label}
                  description={item.description}
                  value={prefs?.[item.type] ?? true}
                  onValueChange={(v) => toggle(item.type, v)}
                  disabled={savingType === item.type}
                />
              </View>
            ))}
          </Card>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.lg, gap: SPACING.md },
  card: { gap: 0 },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.divider },
  hint: { fontSize: 12.5, color: COLORS.textMuted, paddingHorizontal: 2 },
});
