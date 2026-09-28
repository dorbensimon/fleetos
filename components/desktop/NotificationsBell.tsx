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
import {
  countUnreadOwnerNotifications,
  listOwnerNotifications,
  markAllOwnerNotificationsRead,
  markOwnerNotificationRead,
  type OwnerNotification,
} from '../../lib/ownerNotifications';
import { BrandLoader } from '../ui/BrandLoader';
import { DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from './desktopTheme';
import { HeaderMenuBackdrop, headerMenuEnter, headerMenuStyles, useHeaderMenu } from './headerMenu';

const PREVIEW_COUNT = 6;
const TABULAR = webOnly({ fontVariantNumeric: 'tabular-nums' });

type IconName = keyof typeof Ionicons.glyphMap;

/** One row of the dropdown, whatever feed it came from. */
type BellRow = { id: string; unread: boolean; icon: IconName; colors: { bg: string; fg: string }; title?: string; text: string; createdAt: string };

type Feed<T> = {
  count: () => Promise<number>;
  list: () => Promise<T[]>;
  markAll: () => Promise<void>;
  markOne: (id: string) => Promise<void>;
  toRow: (item: T) => BellRow;
  open: (item: T) => Promise<void> | void;
  isUnread: (item: T) => boolean;
  withRead: (item: T, at: string) => T;
};

/**
 * The top bar's bell: the unread count on the badge, and a dropdown of the
 * latest notifications. A row opens the record it talks about (same rule as
 * the notifications page, lib/notificationTargets.ts) and marks it read.
 * The count refreshes on focus and whenever the browser tab comes back.
 * Company users read their company's feed; the owner reads their own
 * (lib/ownerNotifications.ts), about companies only.
 */
export function NotificationsBell({ companyId, role }: { companyId: string; role: UserRole | null | undefined }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const feed: Feed<Notification> = {
    count: () => countUnreadNotifications(companyId),
    list: () => listNotifications(companyId),
    markAll: () => markAllNotificationsRead(companyId),
    markOne: markNotificationRead,
    isUnread: (n) => !n.read_at,
    withRead: (n, at) => ({ ...n, read_at: at }),
    toRow: (n) => {
      const tone = notificationTone(n);
      return {
        id: n.id,
        unread: !n.read_at,
        icon: notificationIcon(n.notification_type) as IconName,
        colors: tone === 'brand' ? { bg: DESKTOP_COLORS.brandFocusRing, fg: DESKTOP_COLORS.brand } : DESKTOP_TONES[tone],
        text: n.message,
        createdAt: n.created_at,
      };
    },
    open: async (n) => {
      const target = await notificationTarget(role, n, resolveNotificationVehicleId);
      if (target) navigateToNotificationTarget(navigation, target);
      else navigation.navigate('Notifications');
    },
  };
  return <Bell feed={feed} refreshKey={companyId} />;
}

const OWNER_ICON: Record<OwnerNotification['notification_type'], IconName> = {
  owner_company_activated: 'rocket-outline',
  owner_admin_added: 'person-add-outline',
  owner_company_not_activated: 'hourglass-outline',
  owner_company_inactive: 'moon-outline',
  owner_carrier_license_expiry: 'document-text-outline',
  owner_trial_ending: 'timer-outline',
  owner_renewal_due: 'card-outline',
  owner_vehicle_limit: 'trending-up-outline',
};

export function OwnerNotificationsBell() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const feed: Feed<OwnerNotification> = {
    count: countUnreadOwnerNotifications,
    list: listOwnerNotifications,
    markAll: markAllOwnerNotificationsRead,
    markOne: markOwnerNotificationRead,
    isUnread: (n) => !n.read_at,
    withRead: (n, at) => ({ ...n, read_at: at }),
    toRow: (n) => ({
      id: n.id,
      unread: !n.read_at,
      icon: OWNER_ICON[n.notification_type] ?? 'business-outline',
      colors:
        n.tone === 'info'
          ? { bg: DESKTOP_COLORS.brandFocusRing, fg: DESKTOP_COLORS.brand }
          : DESKTOP_TONES[n.tone === 'good' ? 'ok' : n.tone],
      title: n.title,
      text: n.message,
      createdAt: n.created_at,
    }),
    open: (n) => {
      if (n.company_id) navigation.navigate('CompanyDetail', { companyId: n.company_id });
      else navigation.navigate('Notifications');
    },
  };
  return <Bell feed={feed} refreshKey="owner" />;
}

function Bell<T extends { id: string }>({ feed, refreshKey }: { feed: Feed<T>; refreshKey: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const menu = useHeaderMenu('notifications');
  const [unread, setUnread] = useState(0);
  const [rows, setRows] = useState<T[] | null>(null);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);
  // The feed object is rebuilt every render; the callbacks below read it
  // through a ref so they only change when the feed's identity does.
  const feedRef = useRef(feed);
  feedRef.current = feed;

  // Badge counts are decoration — a failure must never break the page.
  const refreshCount = useCallback(() => {
    feedRef.current.count().then(setUnread).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

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
      const all = await feedRef.current.list();
      if (id !== request.current) return;
      setRows(all.slice(0, PREVIEW_COUNT));
      setUnread(all.filter((n) => feedRef.current.isUnread(n)).length);
    } catch {
      if (id === request.current) setFailed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Every opening shows fresh rows: stale ones stay visible while they reload.
  useEffect(() => {
    if (menu.open) void load();
  }, [menu.open, load]);

  const markRead = (ids: Set<string>) => {
    const now = new Date().toISOString();
    setRows((current) => current?.map((n) => (ids.has(n.id) && feed.isUnread(n) ? feed.withRead(n, now) : n)) ?? null);
  };

  const readAll = async () => {
    const before = rows;
    const beforeUnread = unread;
    markRead(new Set(rows?.map((n) => n.id)));
    setUnread(0);
    try {
      await feed.markAll();
    } catch {
      setRows(before);
      setUnread(beforeUnread);
      showAlert('הפעולה נכשלה', 'לא הצלחנו לסמן את ההתראות כנקראו.');
    }
  };

  // The page opens right away; marking read happens behind it.
  const openRow = async (n: T) => {
    menu.close();
    if (feed.isUnread(n)) {
      markRead(new Set([n.id]));
      setUnread((c) => Math.max(0, c - 1));
      feed.markOne(n.id).catch(refreshCount);
    }
    await feed.open(n);
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
              {rows.map((item, index) => {
                const n = feed.toRow(item);
                const colors = n.colors;
                const isUnread = n.unread;
                return (
                  <HoverPressable
                    key={n.id}
                    style={[styles.row, index > 0 && styles.rowDivider, isUnread && styles.rowUnread]}
                    hoverStyle={headerMenuStyles.rowHover}
                    onPress={() => void openRow(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`${isUnread ? 'לא נקראה. ' : ''}${n.title ? `${n.title}. ` : ''}${n.text}, ${timeAgo(n.createdAt)}`}
                  >
                    <View style={[styles.icon, { backgroundColor: colors.bg }]}>
                      <Ionicons name={n.icon} size={15} color={colors.fg} />
                    </View>
                    <View style={styles.copy}>
                      {!!n.title && (
                        <DText weight="bold" style={styles.message} numberOfLines={1}>
                          {n.title}
                        </DText>
                      )}
                      <DText weight={isUnread && !n.title ? 'semiBold' : 'regular'} style={[styles.message, !!n.title && styles.messageSoft]} numberOfLines={2}>
                        {n.text}
                      </DText>
                      <DText style={[styles.time, TABULAR]} numberOfLines={1}>
                        {timeAgo(n.createdAt)} · {formatDateTime(n.createdAt)}
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
  messageSoft: { color: DESKTOP_COLORS.inkMuted },
  time: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: DESKTOP_COLORS.brand },
});
