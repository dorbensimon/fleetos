import React, { useCallback, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, AppText, Card, LoadingState, EmptyState, ErrorState, SecondaryButton, BackButton } from '../../components/ui';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { COLORS, SPACING, CARD_SHADOW, BRAND } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { listNotifications, markNotificationRead, markAllNotificationsRead, Notification } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';
import { DC_COLORS, DC_SPACING, DC_TYPO, type DriverCardTint } from '../../components/driverCard/driverCardTheme';

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
    if (n.notification_type === 'driver_odometer_update') return 'DriverVehicle';
    if (n.notification_type === 'license_update_reviewed') return 'DriverProfile';
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
    | { screen: 'DriverDetail'; driverId: string }
    | null => {
    if (n.notification_type === 'signature_request_assigned') return { screen: 'AdminDocumentSigning' };
    if (
      (n.notification_type === 'driver_profile_update'
        || n.notification_type?.startsWith('driver_document_')
        || n.notification_type === 'driver_odometer_update')
      && n.actor_id
    ) {
      return { screen: 'DriverPersonalDetails', driverId: n.actor_id };
    }
    if (n.notification_type === 'license_update_requested' && n.actor_id) {
      return { screen: 'DriverDetail', driverId: n.actor_id };
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
    if (target.screen === 'DriverPersonalDetails' || target.screen === 'DriverDetail') {
      navigation.navigate(target.screen, { driverId: target.driverId });
    } else {
      navigation.navigate(target.screen, undefined);
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

  const actionLabel = (n: Notification) => {
    if (n.notification_type === 'signature_request_assigned') return 'פתח מסמך לחתימה';
    if (n.notification_type === 'vehicle_assignment') return 'הצג רכב';
    if (n.notification_type === 'driver_profile_updated_by_manager') return 'הצג את הפרטים שלי';
    if (n.notification_type === 'driver_profile_update' || n.notification_type?.startsWith('driver_document_')) return 'פתח תיק נהג';
    if (n.notification_type === 'driver_odometer_update') return profile?.role === 'driver' ? 'הצג רכב' : 'פתח תיק נהג';
    if (n.notification_type === 'license_update_requested') return 'לאישור הבקשה';
    if (n.notification_type === 'license_update_reviewed') return 'הצג פרטים';
    if (n.notification_type?.startsWith('vehicle_')) return profile?.role === 'driver' ? 'בדוק מה נדרש' : 'פתח צי רכבים';
    return null;
  };

  const driverContent = loading ? (
    <LoadingState />
  ) : error ? (
    <View style={styles.driverState}>
      <ErrorState message={error} onRetry={load} />
    </View>
  ) : items.length === 0 ? (
    <View style={styles.driverState}>
      <EmptyState icon="notifications-outline" title="אין עדיין התראות" hint="עדכונים מהמנהל שלך יופיעו כאן" />
    </View>
  ) : (
    <>
      <AppText style={[DC_TYPO.groupTitle, styles.driverSectionTitle]}>עדכונים אחרונים</AppText>
      <View style={styles.driverList}>
        {items.map((n, index) => {
          const appearance = driverNotificationAppearance(n.notification_type);
          const action = actionLabel(n);
          const isUnread = unreadIds.has(n.id);
          return (
            <TouchableOpacity
              key={n.id}
              activeOpacity={0.65}
              onPress={() => openNotification(n)}
              accessibilityRole="button"
              accessibilityLabel={n.message}
              style={[styles.driverRow, index === items.length - 1 && styles.driverRowLast]}
            >
              <View style={[styles.driverIcon, { backgroundColor: DC_COLORS[appearance.tint] }]}>
                <Ionicons name={appearance.icon} size={18} color={DC_COLORS.surface} />
              </View>
              <View style={styles.driverTextWrap}>
                <AppText style={[DC_TYPO.rowLabel, styles.driverMessage]} numberOfLines={2}>
                  {n.message}
                </AppText>
                <View style={styles.driverMeta}>
                  <AppText style={styles.driverTime}>{timeAgo(n.created_at)}</AppText>
                  {!!action && <AppText style={styles.driverAction}>{action}</AppText>}
                </View>
              </View>
              {isUnread && <View style={styles.driverUnreadDot} />}
              <Ionicons name="chevron-back" size={19} color={DC_COLORS.chevron} />
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );

  if (profile?.role === 'driver') {
    return (
      <View style={styles.driverScreen}>
        <AdminGradientBackground />
        <ScrollView
          style={styles.driverScroll}
          contentContainerStyle={[
            styles.driverContent,
            { paddingTop: insets.top + 76, paddingBottom: DC_SPACING.listBottomPadding + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.driverTitleRow}>
            <AppText style={[DC_TYPO.largeTitle, styles.driverTitle]}>התראות</AppText>
            {unreadIds.size > 0 && (
              <TouchableOpacity onPress={markAllRead} activeOpacity={0.65} accessibilityRole="button">
                <AppText style={styles.markAllText}>קרא הכל</AppText>
              </TouchableOpacity>
            )}
          </View>
          {driverContent}
        </ScrollView>
        <View style={[styles.driverBackButton, { top: insets.top + 12 }]}>
          <BackButton onPress={() => navigation.goBack()} />
        </View>
      </View>
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
      ) : items.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="אין עדיין התראות"
          hint="עדכונים הקשורים לחברה יופיעו כאן"
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
                  {!!actionLabel(n) && <AppText weight="bold" style={styles.actionLabel}>{actionLabel(n)}</AppText>}
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
  driverScreen: { flex: 1, backgroundColor: DC_COLORS.bg },
  driverScroll: { flex: 1 },
  driverContent: { paddingHorizontal: DC_SPACING.screenPaddingH },
  driverTitleRow: {
    minHeight: 39,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 26,
  },
  driverTitle: { color: DC_COLORS.label, textAlign: 'right', writingDirection: 'rtl' },
  markAllText: {
    ...DC_TYPO.navTitle,
    color: DC_COLORS.blue,
    textAlign: 'left',
    writingDirection: 'rtl',
  },
  driverSectionTitle: {
    color: DC_COLORS.labelTertiary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 8,
    marginRight: 2,
  },
  driverList: { backgroundColor: DC_COLORS.surface, borderRadius: DC_SPACING.groupRadius, overflow: 'hidden' },
  driverRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: DC_SPACING.iconTextGap,
    minHeight: 68,
    paddingHorizontal: DC_SPACING.rowPaddingH,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: DC_COLORS.separator,
  },
  driverRowLast: { borderBottomWidth: 0 },
  driverIcon: {
    width: DC_SPACING.iconSquare,
    height: DC_SPACING.iconSquare,
    borderRadius: DC_SPACING.iconRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverTextWrap: { flex: 1, gap: 4 },
  driverMessage: { color: DC_COLORS.label, textAlign: 'right', writingDirection: 'rtl' },
  driverMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  driverTime: { color: DC_COLORS.labelSecondary, fontSize: 12, writingDirection: 'rtl' },
  driverAction: { color: DC_COLORS.blue, fontSize: 12, writingDirection: 'rtl' },
  driverUnreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: DC_COLORS.red },
  driverState: { paddingTop: 36 },
  driverBackButton: { position: 'absolute', right: 16 },
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
