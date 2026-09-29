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
import { OwnerNotificationsDesktop, OwnerNotificationsMobile } from '../../components/owner/OwnerNotifications';
import {
  listOwnerNotifications,
  markAllOwnerNotificationsRead,
  markOwnerNotificationRead,
  type OwnerNotification,
} from '../../lib/ownerNotifications';
import { t } from '../../lib/i18n';
import { errorMessage } from '../../lib/requestError';

/**
 * Logs every driver self-edit (name/phone/ID/license/department) so
 * admins keep visibility even though drivers can now change those
 * fields themselves. The unread count only drops when the admin opens
 * a specific notification, or taps "קרא הכל" — just viewing this list
 * does NOT mark anything read on its own.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

export default function NotificationsScreen(props: Props) {
  const { profile } = useCompany();
  // The owner's feed is about companies, not drivers: its own table and view.
  if (profile?.role === 'owner') return <OwnerNotificationsScreen {...props} />;
  return <CompanyNotificationsScreen {...props} />;
}

function CompanyNotificationsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const { companyId, profile } = useCompany();
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);
  // The company whose notifications are on screen: a return refreshes quietly.
  const shownFor = useRef<string | null>(null);
  // Desktop shows the notification settings beside the list (one "התראות" page).
  const preferences = useNotificationPreferences({ enabled: isDesktop });

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    const quiet = !!companyId && shownFor.current === companyId;
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
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
      shownFor.current = companyId;
    } catch (err: any) {
      if (requestId === loadRequest.current && !quiet) {
        setError(errorMessage(err, t('notifications.loadFailedShort')));
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
    if (n.notification_type === 'signature_request_assigned') return profile?.role === 'driver' ? t('notifications.action.signDocument') : t('notifications.action.openDocument');
    if (n.notification_type === 'vehicle_assignment') return t('notifications.action.showVehicle');
    if (n.notification_type === 'driver_profile_updated_by_manager') return t('notifications.action.showChanges');
    if (n.notification_type?.startsWith('driver_document_')) return t('notifications.action.openDocument');
    if (n.notification_type === 'driver_profile_update') return t('notifications.action.showChanges');
    if (n.notification_type === 'driver_odometer_update') return t('notifications.action.showOdometer');
    if (n.notification_type === 'vehicle_service_due') return t('notifications.action.showServices');
    if (n.notification_type === 'license_update_requested') return t('notifications.action.approveRequest');
    if (n.notification_type === 'license_update_reviewed') return t('notifications.action.showLicense');
    if (isVehicleFolderNotification(n.notification_type)) return profile?.role === 'driver' ? t('notifications.action.showVehicle') : n.vehicle_id ? t('notifications.action.openFolder') : t('notifications.action.openFleet');
    if (n.notification_type?.startsWith('vehicle_')) return profile?.role === 'driver' ? t('notifications.action.checkNeeded') : t('notifications.action.openFleet');
    return null;
  };

  if (isDesktop) {
    return (
      <DesktopShell active="Notifications" breadcrumbs={[t('notifications.title')]}>
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
          initialSection={route.params?.section === 'settings' ? 'settings' : 'feed'}
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
          ? t('notifications.emptyDriver')
          : t('notifications.emptyAdmin')
      }
    />
  );
}

function OwnerNotificationsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const [items, setItems] = useState<OwnerNotification[]>([]);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);
  const preferences = useNotificationPreferences({ enabled: isDesktop });

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setError(null);
    try {
      const rows = await listOwnerNotifications();
      if (requestId !== loadRequest.current) return;
      setItems(rows);
      setUnreadIds(new Set(rows.filter((r) => !r.read_at).map((r) => r.id)));
    } catch (err: any) {
      if (requestId === loadRequest.current) setError(errorMessage(err, t('notifications.loadFailedShort')));
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        loadRequest.current += 1;
      };
    }, [load])
  );

  const open = async (n: OwnerNotification) => {
    if (unreadIds.has(n.id)) {
      setUnreadIds((prev) => {
        const next = new Set(prev);
        next.delete(n.id);
        return next;
      });
      markOwnerNotificationRead(n.id).catch(() => setUnreadIds((prev) => new Set(prev).add(n.id)));
    }
    if (n.company_id) navigation.navigate('CompanyDetail', { companyId: n.company_id });
  };

  const markAllRead = async () => {
    if (unreadIds.size === 0) return;
    const previous = unreadIds;
    setUnreadIds(new Set());
    try {
      await markAllOwnerNotificationsRead();
    } catch {
      setUnreadIds(previous);
    }
  };

  if (isDesktop) {
    return (
      <DesktopShell active="Notifications" breadcrumbs={[t('notifications.title')]}>
        <OwnerNotificationsDesktop
          items={items}
          unreadIds={unreadIds}
          loading={loading}
          error={error}
          timeAgo={timeAgo}
          onOpen={(n) => void open(n)}
          onMarkAllRead={() => void markAllRead()}
          onRetry={load}
          prefs={preferences}
        />
      </DesktopShell>
    );
  }

  return (
    <OwnerNotificationsMobile
      insetTop={insets.top}
      insetBottom={insets.bottom}
      items={items}
      unreadIds={unreadIds}
      loading={loading}
      error={error}
      timeAgo={timeAgo}
      onOpen={(n) => void open(n)}
      onMarkAllRead={() => void markAllRead()}
      onSettings={() => navigation.navigate('NotificationPreferences')}
      onBack={() => navigation.goBack()}
      onRetry={load}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    />
  );
}
