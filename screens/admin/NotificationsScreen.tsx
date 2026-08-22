import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, ScreenHeader, AppText, Card, LoadingState, EmptyState } from '../../components/ui';
import { COLORS, SPACING, CARD_SHADOW } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { listNotifications, markAllNotificationsRead, Notification } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';

/**
 * Logs every driver self-edit (name/phone/ID/license/department) so
 * admins keep visibility even though drivers can now change those
 * fields themselves. Opening this screen is what marks everything
 * read — the unread count in the hamburger menu only drops once the
 * admin has actually looked, not just because the bell was tapped.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

function timeAgo(iso: string): string {
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
  const { companyId } = useCompany();
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
        await markAllNotificationsRead(companyId);
      })();
      return () => {
        active = false;
      };
    }, [companyId])
  );

  return (
    <Screen>
      <ScreenHeader title="התראות" onBack={() => navigation.goBack()} />

      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState icon="notifications-outline" title="אין עדיין התראות" hint="עדכונים עצמיים של נהגים יופיעו כאן" />
      ) : (
        <View style={styles.content}>
          {items.map((n) => (
            <Card key={n.id} style={[styles.row, unreadIds.has(n.id) && styles.rowUnread]}>
              <View style={styles.icon}>
                <Ionicons name="person-circle-outline" size={20} color={COLORS.accent} />
              </View>
              <View style={styles.textWrap}>
                <AppText weight="bold" style={styles.message}>
                  {n.message}
                </AppText>
                <AppText style={styles.time}>{timeAgo(n.created_at)}</AppText>
              </View>
              {unreadIds.has(n.id) && <View style={styles.unreadDot} />}
            </Card>
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
