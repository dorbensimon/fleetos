import React, { useCallback, useRef, useState } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, AppText, Card, LoadingState, EmptyState, ErrorState, SecondaryButton, BackButton } from '../../components/ui';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { COLORS, SPACING, CARD_SHADOW, BRAND } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { listNotifications, markNotificationRead, markAllNotificationsRead, Notification, resolveNotificationVehicleId } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';
import { type DriverCardTint } from '../../components/driverCard/driverCardTheme';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { isVehicleFolderNotification } from '../../lib/vehicleFolderAlerts';
import { navigateToNotificationTarget, notificationTarget } from '../../lib/notificationTargets';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { NotificationsHubDesktopView } from '../../components/desktop/NotificationsHubDesktopView';
import { useNotificationPreferences } from '../../lib/useNotificationPreferences';
import { DriverNotificationsMobile } from '../driver/DriverNotificationsMobile';

/**
 * Logs every driver self-edit (name/phone/ID/license/department) so
 * admins keep visibility even though drivers can now change those
 * fields themselves. The unread count only drops when the admin opens
 * a specific notification, or taps "קרא הכל" — just viewing this list
 * does NOT mark anything read on its own.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  const days = Math.floor(hours / 24);
  return `לפני ${days} ימים`;
}

function driverNotificationAppearance(type: string | null): {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tint: DriverCardTint;
} {
  if (type === 'signature_request_assigned') return { icon: 'create-outline', tint: 'orange' };
  if (type === 'vehicle_assignment') return { icon: 'car-outline', tint: 'indigo' };
  if (type?.startsWith('vehicle_')) return { icon: 'warning-outline', tint: 'orange' };
  if (type === 'license_update_reviewed') return { icon: 'card-outline', tint: 'green' };
  return { icon: 'person-outline', tint: 'blue' };
}

export default function NotificationsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const { companyId, profile } = useCompany();
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);
  // Desktop shows the notification settings beside the list (one "התראות" page).
  const preferences = useNotificationPreferences({ enabled: isDesktop });

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setError(null);
    if (!companyId) {
      if (requestId === loadRequest.current) {
        setItems([]);
        setUnreadIds(new Set());
        setLoading(false);
      }
      return;
    }
    try {
      const rows = await listNotifications(companyId);
      if (requestId !== loadRequest.current) return;
      setItems(rows);
      setUnreadIds(new Set(rows.filter((r) => !r.read_at).map((r) => r.id)));
    } catch (err: any) {
      if (requestId === loadRequest.current) {
        setError(err?.message ?? 'טעינת ההתראות נכשלה');
      }
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [companyId]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        loadRequest.current += 1;
      };
    }, [load])
  );

  const openNotification = async (n: Notification) => {
    if (unreadIds.has(n.id)) {
      setUnreadIds((prev) => {
        const next = new Set(prev);
        next.delete(n.id);
        return next;
      });
      try {
        await markNotificationRead(n.id);
      } catch {
        setUnreadIds((prev) => new Set(prev).add(n.id));
      }
    }

    const target = await notificationTarget(profile?.role, n, resolveNotificationVehicleId);
    if (target) navigateToNotificationTarget(navigation, target);
  };

  const markAllRead = async () => {
    if (!companyId || unreadIds.size === 0) return;
    const previousUnreadIds = unreadIds;
    setUnreadIds(new Set());
    try {
      await markAllNotificationsRead(companyId);
    } catch {
      setUnreadIds(previousUnreadIds);
    }
  };

  const actionLabel = (n: Notification) => {
    if (n.notification_type === 'signature_request_assigned') return 'פתח מסמך לחתימה';
    if (n.notification_type === 'vehicle_assignment') return 'הצג רכב';
    if (n.notification_type === 'driver_profile_updated_by_manager') return 'הצג את הפרטים שלי';
    if (n.notification_type?.startsWith('driver_document_')) return 'פתח את המסמך';
    if (n.notification_type === 'driver_profile_update') return 'פתח תיק נהג';
    if (n.notification_type === 'driver_odometer_update') return profile?.role === 'driver' ? 'הצג רכב' : 'פתח תיק נהג';
    if (n.notification_type === 'license_update_requested') return 'לאישור הבקשה';
    if (n.notification_type === 'license_update_reviewed') return 'הצג פרטים';
    if (isVehicleFolderNotification(n.notification_type)) return profile?.role === 'driver' ? 'הצג רכב' : n.vehicle_id ? 'פתח תיקייה' : 'פתח צי רכבים';
    if (n.notification_type?.startsWith('vehicle_')) return profile?.role === 'driver' ? 'בדוק מה נדרש' : 'פתח צי רכבים';
    return null;
  };

  if (isDesktop) {
    return (
      <DesktopShell active="Notifications" breadcrumbs={['התראות']}>
        <NotificationsHubDesktopView
          items={items}
          unreadIds={unreadIds}
          loading={loading}
          error={error}
          onRetry={load}
          onOpen={(n) => void openNotification(n)}
          onMarkAllRead={() => void markAllRead()}
          iconFor={(type) => driverNotificationAppearance(type).icon}
          timeAgo={timeAgo}
          actionLabel={actionLabel}
          prefs={preferences}
        />
      </DesktopShell>
    );
  }

  if (profile?.role === 'driver') {
    return (
      <DriverNotificationsMobile
        insetTop={insets.top}
        insetBottom={insets.bottom}
        items={items}
        unreadIds={unreadIds}
        loading={loading}
        error={error}
        timeAgo={timeAgo}
        actionLabel={actionLabel}
        onOpen={(n) => void openNotification(n)}
        onMarkAllRead={() => void markAllRead()}
        onSettings={() => navigation.navigate('NotificationPreferences')}
        onBack={() => navigation.goBack()}
        onRetry={load}
      />
    );
  }

  return (
    <Screen style={styles.screen}>
      <AdminGradientBackground />
      <View style={[styles.topBar, { paddingTop: insets.top + 20 }]}>
        <View style={styles.topBarInner}>
          <View style={styles.topTitleOverlay} pointerEvents="none">
            <AppText weight="bold" style={styles.topTitle} numberOfLines={1}>
              התראות
            </AppText>
          </View>
          {unreadIds.size > 0 ? (
            <SecondaryButton label="קרא הכל" icon="checkmark-done-outline" onPress={markAllRead} />
          ) : (
            <View />
          )}
          <BackButton onPress={() => navigation.goBack()} />
        </View>
      </View>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.content}
          ListEmptyComponent={
            <EmptyState
              icon="notifications-outline"
              title="אין עדיין התראות"
              hint="עדכונים הקשורים לחברה יופיעו כאן"
            />
          }
          renderItem={({ item: n }) => (
            <TouchableOpacity activeOpacity={0.7} onPress={() => openNotification(n)}>
              <Card style={[styles.row, unreadIds.has(n.id) && styles.rowUnread]}>
                <View style={styles.icon}>
                  <Ionicons
                    name={
                      n.notification_type === 'signature_request_assigned'
                        ? 'create-outline'
                        : n.notification_type === 'vehicle_assignment'
                        ? 'car-outline'
                        : n.notification_type === 'vehicle_inspection_last_date_expiry' || isVehicleFolderNotification(n.notification_type)
                        ? 'warning-outline'
                        : 'person-circle-outline'
                    }
                    size={20}
                    color={COLORS.accent}
                  />
                </View>
                <View style={styles.textWrap}>
                  <AppText weight="bold" style={styles.message}>
                    {n.message}
                  </AppText>
                  <AppText style={styles.time}>{timeAgo(n.created_at)}</AppText>
                  {!!actionLabel(n) && <AppText weight="bold" style={styles.actionLabel}>{actionLabel(n)}</AppText>}
                </View>
                {unreadIds.has(n.id) && <View style={styles.unreadDot} />}
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: BRAND.screenBg },
  topBar: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  topBarInner: {
    position: 'relative',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topTitleOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { fontSize: 18, color: COLORS.text },
  content: { padding: SPACING.lg, gap: SPACING.sm },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
  },
  rowUnread: { backgroundColor: COLORS.accentSoft },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...CARD_SHADOW,
  },
  textWrap: { flex: 1, gap: 2 },
  message: { fontSize: 13.5, textAlign: 'right' },
  time: { fontSize: 11.5, color: COLORS.textFaint },
  actionLabel: { marginTop: 4, fontSize: 12, color: COLORS.accent, textAlign: 'right' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.dangerText },
});
