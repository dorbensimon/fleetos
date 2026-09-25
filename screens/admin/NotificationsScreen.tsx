import React, { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCompany } from '../../lib/CompanyContext';
import { listNotifications, markNotificationRead, markAllNotificationsRead, Notification, resolveNotificationVehicleId } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { isVehicleFolderNotification } from '../../lib/vehicleFolderAlerts';
import { navigateToNotificationTarget, notificationTarget } from '../../lib/notificationTargets';
import { notificationIcon, timeAgo } from '../../lib/notificationLook';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { NotificationsHubDesktopView } from '../../components/desktop/NotificationsHubDesktopView';
import { useNotificationPreferences } from '../../lib/useNotificationPreferences';
import { NotificationsMobile } from '../NotificationsMobile';

/**
 * Logs every driver self-edit (name/phone/ID/license/department) so
 * admins keep visibility even though drivers can now change those
 * fields themselves. The unread count only drops when the admin opens
 * a specific notification, or taps "קרא הכל" — just viewing this list
 * does NOT mark anything read on its own.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

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
          iconFor={notificationIcon}
          timeAgo={timeAgo}
          actionLabel={actionLabel}
          prefs={preferences}
        />
      </DesktopShell>
    );
  }

  return (
    <NotificationsMobile
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
      emptyHint={
        profile?.role === 'driver'
          ? 'כשמנהל הצי ישלח מסמך, ישייך רכב או כשתוקף יתקרב — העדכון יופיע כאן.'
          : 'כשנהג יעדכן פרטים, יעלה מסמך או כשתוקף ברכב יתקרב — העדכון יופיע כאן.'
      }
    />
  );
}
