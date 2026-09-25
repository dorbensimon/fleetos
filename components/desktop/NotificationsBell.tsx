import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  Notification,
  resolveNotificationVehicleId,
} from '../../lib/adminApi';
import { notificationIcon, notificationTone, timeAgo } from '../../lib/notificationLook';
import { navigateToNotificationTarget, notificationTarget } from '../../lib/notificationTargets';
import { showAlert } from '../../lib/platformAlert';
import type { UserRole } from '../../lib/supabase';
import { formatDateTime } from '../../lib/theme';
import { RootStackParamList } from '../../navigation/types';
import { BrandLoader } from '../ui/BrandLoader';
import { DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from './desktopTheme';
import { HeaderMenuBackdrop, headerMenuEnter, headerMenuStyles, useHeaderMenu } from './headerMenu';

const PREVIEW_COUNT = 6;
const TABULAR = webOnly({ fontVariantNumeric: 'tabular-nums' });

/**
 * The top bar's bell: the unread count on the badge, and a dropdown of the
 * latest notifications. A row opens the record it talks about (same rule as
 * the notifications page, lib/notificationTargets.ts) and marks it read.
 * The count refreshes on focus and whenever the browser tab comes back.
 */
export function NotificationsBell({ companyId, role }: { companyId: string; role: UserRole | null | undefined }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const menu = useHeaderMenu('notifications');
  const [unread, setUnread] = useState(0);
  const [rows, setRows] = useState<Notification[] | null>(null);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);

  // Badge counts are decoration — a failure must never break the page.
  const refreshCount = useCallback(() => {
    countUnreadNotifications(companyId).then(setUnread).catch(() => undefined);
  }, [companyId]);

  useFocusEffect(refreshCount);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisible = () => document.visibilityState === 'visible' && refreshCount();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshCount]);

  const load = useCallback(async () => {
    const id = ++request.current;
    setFailed(false);
    try {
      const all = await listNotifications(companyId);
      if (id !== request.current) return;
      setRows(all.slice(0, PREVIEW_COUNT));
      setUnread(all.filter((n) => !n.read_at).length);
    } catch {
      if (id === request.current) setFailed(true);
    }
  }, [companyId]);

  // Every opening shows fresh rows: stale ones stay visible while they reload.
  useEffect(() => {
    if (menu.open) void load();
  }, [menu.open, load]);

  const markRead = (ids: Set<string>) => {
    const now = new Date().toISOString();
    setRows((current) => current?.map((n) => (ids.has(n.id) && !n.read_at ? { ...n, read_at: now } : n)) ?? null);
  };

  const readAll = async () => {
    const before = rows;
    const beforeUnread = unread;
    markRead(new Set(rows?.map((n) => n.id)));
    setUnread(0);
    try {
      await markAllNotificationsRead(companyId);
    } catch {
      setRows(before);
      setUnread(beforeUnread);
      showAlert('הפעולה נכשלה', 'לא הצלחנו לסמן את ההתראות כנקראו.');
    }
  };

  // The page opens right away; marking read happens behind it.
  const openRow = async (n: Notification) => {
    menu.close();
    if (!n.read_at) {
      markRead(new Set([n.id]));
      setUnread((c) => Math.max(0, c - 1));
      markNotificationRead(n.id).catch(refreshCount);
    }
    const target = await notificationTarget(role, n, resolveNotificationVehicleId);
    if (target) navigateToNotificationTarget(navigation, target);
    else navigation.navigate('Notifications');
  };

  const openAll = () => {
    menu.close();
    navigation.navigate('Notifications');
  };

  const badge = unread > 99 ? '99+' : String(unread);

  return (
    <View style={[headerMenuStyles.wrap, menu.open && headerMenuStyles.wrapOpen]}>
      {menu.open && <HeaderMenuBackdrop onClose={menu.close} />}
      <HoverPressable
        style={[styles.bell, menu.open && styles.bellOpen]}
        hoverStyle={styles.bellHover}
        onPress={menu.toggle}
        accessibilityLabel={unread > 0 ? `התראות, ${unread} שלא נקראו` : 'התראות'}
        accessibilityState={{ expanded: menu.open }}
        aria-expanded={menu.open}
        aria-haspopup="dialog"
      >
        <Ionicons name={menu.open ? 'notifications' : 'notifications-outline'} size={16} color={DESKTOP_COLORS.ink} />
        {unread > 0 && (
          <View style={styles.badge}>
            <DText weight="bold" style={[styles.badgeText, TABULAR]}>
              {badge}
            </DText>
          </View>
        )}
      </HoverPressable>

      {menu.open && (
        <View style={[headerMenuStyles.menu, headerMenuEnter()]} role="dialog" aria-label="התראות">
          <View style={headerMenuStyles.head}>
            <View style={headerMenuStyles.headText}>
              <DText weight="bold" style={headerMenuStyles.title}>
                התראות
              </DText>
              <DText style={[headerMenuStyles.hint, TABULAR]}>
                {unread === 0 ? 'אין התראות שלא נקראו' : unread === 1 ? 'התראה אחת שלא נקראה' : `${unread} התראות שלא נקראו`}
              </DText>
            </View>
            {unread > 0 && (
              <HoverPressable style={styles.readAll} hoverStyle={headerMenuStyles.rowHover} onPress={() => void readAll()} accessibilityLabel="סימון כל ההתראות כנקראו">
                <Ionicons name="checkmark-done" size={14} color={DESKTOP_COLORS.brand} />
                <DText weight="semiBold" style={styles.readAllText}>
                  סימון הכל כנקרא
                </DText>
              </HoverPressable>
            )}
          </View>

          {rows === null && failed ? (
            <View style={styles.state}>
              <DText style={styles.stateText}>לא הצלחנו לטעון את ההתראות</DText>
              <HoverPressable style={styles.retry} hoverStyle={headerMenuStyles.rowHover} onPress={() => void load()}>
                <DText weight="semiBold" style={styles.readAllText}>
                  לנסות שוב
                </DText>
              </HoverPressable>
            </View>
          ) : rows === null ? (
            <View style={styles.state} accessibilityLabel="טוען התראות">
              <BrandLoader size={28} />
            </View>
          ) : rows.length === 0 ? (
            <View style={styles.state}>
              <Ionicons name="notifications-off-outline" size={24} color={DESKTOP_COLORS.inkFaint} />
              <DText style={styles.stateText}>אין עדיין התראות</DText>
            </View>
          ) : (
            <ScrollView style={headerMenuStyles.scroll}>
              {rows.map((n, index) => {
                const tone = notificationTone(n);
                const colors = tone === 'brand' ? { bg: DESKTOP_COLORS.brandFocusRing, fg: DESKTOP_COLORS.brand } : DESKTOP_TONES[tone];
                const isUnread = !n.read_at;
                return (
                  <HoverPressable
                    key={n.id}
                    style={[styles.row, index > 0 && styles.rowDivider, isUnread && styles.rowUnread]}
                    hoverStyle={headerMenuStyles.rowHover}
                    onPress={() => void openRow(n)}
                    accessibilityRole="button"
                    accessibilityLabel={`${isUnread ? 'לא נקראה. ' : ''}${n.message}, ${timeAgo(n.created_at)}`}
                  >
                    <View style={[styles.icon, { backgroundColor: colors.bg }]}>
                      <Ionicons name={notificationIcon(n.notification_type)} size={15} color={colors.fg} />
                    </View>
                    <View style={styles.copy}>
                      <DText weight={isUnread ? 'semiBold' : 'regular'} style={styles.message} numberOfLines={2}>
                        {n.message}
                      </DText>
                      <DText style={[styles.time, TABULAR]} numberOfLines={1}>
                        {timeAgo(n.created_at)} · {formatDateTime(n.created_at)}
                      </DText>
                    </View>
                    {isUnread ? <View style={styles.unreadDot} /> : <Ionicons name="chevron-back" size={13} color={DESKTOP_COLORS.inkFaint} />}
                  </HoverPressable>
                );
              })}
            </ScrollView>
          )}

          <HoverPressable style={headerMenuStyles.footer} hoverStyle={headerMenuStyles.rowHover} onPress={openAll} accessibilityRole="link">
            <DText weight="semiBold" style={headerMenuStyles.footerText}>
              לכל ההתראות וההגדרות
            </DText>
          </HoverPressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    backgroundColor: DESKTOP_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ transition: 'background-color 150ms ease-out' }),
  },
  bellHover: { backgroundColor: DESKTOP_COLORS.canvas },
  bellOpen: { backgroundColor: DESKTOP_COLORS.canvas },
  badge: {
    position: 'absolute',
    top: -6,
    right: -7,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DESKTOP_COLORS.danger,
    borderWidth: 2,
    borderColor: DESKTOP_COLORS.surface,
  },
  badgeText: { color: '#fff', fontSize: 10, lineHeight: 12, textAlign: 'center' },
  readAll: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  readAllText: { fontSize: 12.5, color: DESKTOP_COLORS.brand },
  state: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 18 },
  stateText: { fontSize: 13, color: DESKTOP_COLORS.inkMuted, textAlign: 'center' },
  retry: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
    ...webOnly({ transition: 'background-color 150ms ease-out' }),
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DESKTOP_COLORS.borderSoft },
  rowUnread: { backgroundColor: 'rgba(0,136,204,0.04)' },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  message: { fontSize: 13, lineHeight: 18, color: DESKTOP_COLORS.ink },
  time: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: DESKTOP_COLORS.brand },
});
