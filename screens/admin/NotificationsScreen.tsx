import React, { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, ScreenHeader, AppText, Card, LoadingState, EmptyState, SecondaryButton } from '../../components/ui';
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

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!companyId) return;
        setLoading(true);
        const rows = await listNotifications(companyId);
        if (!active) return;
        setItems(rows);
        setUnreadIds(new Set(rows.filter((r) => !r.read_at).map((r) => r.id)));
        setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [companyId])
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

  const openNotification = async (n: Notification) => {
    const targetRoute = targetRouteForNotification(n);
    if (unreadIds.has(n.id)) {
      setUnreadIds((prev) => {
        const next = new Set(prev);
        next.delete(n.id);
        return next;
      });
      try {
        await markNotificationRead(n.id);
      } catch {
        // Best-effort — already reflected locally.
      }
    }
    if (targetRoute) navigation.navigate(targetRoute);
  };

  const markAllRead = async () => {
    if (!companyId || unreadIds.size === 0) return;
    setUnreadIds(new Set());
    try {
      await markAllNotificationsRead(companyId);
    } catch {
      // Best-effort — the screen already shows everything as read locally.
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="התראות"
        onBack={() => navigation.goBack()}
        right={
          unreadIds.size > 0 ? <SecondaryButton label="קרא הכל" icon="checkmark-done-outline" onPress={markAllRead} /> : undefined
        }
      />

      {loading ? (
        <LoadingState />
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
