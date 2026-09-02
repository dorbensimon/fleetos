import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, ScreenHeader, AppText, Card, LoadingState, EmptyState, ErrorState, SecondaryButton } from '../../components/ui';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { COLORS, SPACING, CARD_SHADOW } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { listNotifications, markNotificationRead, markAllNotificationsRead, Notification } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';

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

export default function NotificationsScreen({ navigation }: Props) {
  const { companyId, profile } = useCompany();
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);

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

  const targetRouteForNotification = (
    n: Notification
  ): 'DriverSigningDocuments' | 'DriverVehicle' | 'DriverProfile' | null => {
    if (profile?.role !== 'driver') return null;
    if (n.notification_type === 'signature_request_assigned') return 'DriverSigningDocuments';
    if (n.notification_type === 'vehicle_assignment') return 'DriverVehicle';
    if (n.notification_type === 'driver_profile_updated_by_manager') return 'DriverProfile';
    if (n.notification_type === 'vehicle_inspection_last_date_expiry') return 'DriverVehicle';
    return null;
  };

  /**
   * Admin-side routing (this screen is shared between roles; the driver
   * branch above never covered admins, so tapping any notification as an
   * admin previously did nothing).
   *
   * IMPORTANT — verified against the actual schema (supabase/sql 25, 35,
   * 40, 42 + supabase/functions/assign-signing-template), not guessed:
   * the `notifications` table stores no dedicated entity-id column
   * (no driver_id / vehicle_id / document_id / request_id) — only a
   * human-readable `message` string. Two consequences that shape this
   * function, both flagged to Rafael for backend follow-up rather than
   * papered over here:
   *
   * 1. `actor_id` happens to already be a usable id, but only for the
   *    two "driver edited their own record" triggers (`driver_profile_update`,
   *    `driver_document_upload`) — there the actor IS the driver. We use it.
   * 2. For `vehicle_assignment` and the `vehicle_*` expiry types, the
   *    admin-visible row (`recipient_id is null`) has no vehicle id at
   *    all — the vehicle name is baked into `message` as text only. We
   *    can't deep-link to a specific `VehicleDetail` (mandatory `vehicleId`
   *    param) without a schema change, so these route to the fleet list
   *    instead of doing nothing. `signature_request_assigned` is written
   *    with a specific driver as `recipient_id`, which per the migration 40
   *    RLS policy an admin can never actually see (recipient_id must be
   *    null or the viewer's own id) — that branch is forward-compatible,
   *    not a currently-reachable path. There is no notification_type at
   *    all yet for "notification preferences changed", so that one isn't
   *    wired here — it would be dead code matching nothing in the DB.
   */
  const targetForAdminNotification = (
    n: Notification
  ):
    | { screen: 'AdminDocumentSigning' }
    | { screen: 'AdminHome' }
    | { screen: 'DriverPersonalDetails'; driverId: string }
    | null => {
    if (n.notification_type === 'signature_request_assigned') return { screen: 'AdminDocumentSigning' };
    if (n.notification_type === 'driver_profile_update' && n.actor_id) {
      return { screen: 'DriverPersonalDetails', driverId: n.actor_id };
    }
    if (
      n.notification_type === 'vehicle_assignment' ||
      n.notification_type === 'vehicle_inspection_last_date_expiry' ||
      n.notification_type === 'vehicle_insurance_mandatory_expiry' ||
      n.notification_type === 'vehicle_insurance_comprehensive_expiry' ||
      n.notification_type === 'vehicle_annual_test_expiry' ||
      n.notification_type === 'vehicle_service_due'
    ) {
      return { screen: 'AdminHome' };
    }
    return null;
  };

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

    if (profile?.role === 'driver') {
      const targetRoute = targetRouteForNotification(n);
      if (targetRoute) navigation.navigate(targetRoute);
      return;
    }

    const target = targetForAdminNotification(n);
    if (!target) return;
    if (target.screen === 'DriverPersonalDetails') {
      navigation.navigate('DriverPersonalDetails', { driverId: target.driverId });
    } else {
      navigation.navigate(target.screen);
    }
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

  return (
    <Screen>
      <AdminGradientBackground />
      <ScreenHeader
        title="התראות"
        onBack={() => navigation.goBack()}
        right={
          unreadIds.size > 0 ? <SecondaryButton label="קרא הכל" icon="checkmark-done-outline" onPress={markAllRead} /> : undefined
        }
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="אין עדיין התראות"
          hint={profile?.role === 'driver' ? 'עדכונים מהמנהל שלך יופיעו כאן' : 'עדכונים הקשורים לחברה יופיעו כאן'}
        />
      ) : (
        <View style={styles.content}>
          {items.map((n) => (
            <TouchableOpacity key={n.id} activeOpacity={0.7} onPress={() => openNotification(n)}>
              <Card style={[styles.row, unreadIds.has(n.id) && styles.rowUnread]}>
                <View style={styles.icon}>
                  <Ionicons
                    name={
                      n.notification_type === 'signature_request_assigned'
                        ? 'create-outline'
                        : n.notification_type === 'vehicle_assignment'
                        ? 'car-outline'
                        : n.notification_type === 'vehicle_inspection_last_date_expiry'
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
                </View>
                {unreadIds.has(n.id) && <View style={styles.unreadDot} />}
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.dangerText },
});
