import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Notification } from '../../lib/adminApi';
import { DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS, webOnly } from './desktopTheme';

/**
 * Desktop body of the full notifications list: a dense bordered list of
 * rows (icon, message, time, action) instead of the phone's card stack,
 * plus a "read all" action in the toolbar. Purely presentational —
 * NotificationsScreen owns data, unread state and routing.
 */
export function NotificationsDesktopView({
  items,
  unreadIds,
  loading,
  error,
  onRetry,
  onOpen,
  onMarkAllRead,
  iconFor,
  timeAgo,
  actionLabel,
}: {
  items: Notification[];
  unreadIds: Set<string>;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (n: Notification) => void;
  onMarkAllRead: () => void;
  iconFor: (type: string | null) => keyof typeof Ionicons.glyphMap;
  timeAgo: (iso: string) => string;
  actionLabel: (n: Notification) => string | null;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <DText weight="bold" style={styles.title}>
          {items.length === 0 ? 'התראות' : `${items.length} התראות`}
        </DText>
        {unreadIds.size > 0 && (
          <HoverPressable style={styles.markAll} hoverStyle={styles.markAllHover} onPress={onMarkAllRead}>
            <Ionicons name="checkmark-done-outline" size={14} color={DESKTOP_COLORS.brand} />
            <DText weight="semiBold" style={styles.markAllText}>קרא הכל</DText>
          </HoverPressable>
        )}
      </View>

      {loading ? null : error ? (
        <View style={styles.state}>
          <DText weight="semiBold" style={styles.stateTitle}>לא ניתן לטעון את ההתראות</DText>
          <DText style={styles.stateHint}>{error}</DText>
          <HoverPressable style={styles.retryButton} hoverStyle={styles.retryButtonHover} onPress={onRetry}>
            <DText weight="semiBold" style={styles.retryButtonText}>נסה שוב</DText>
          </HoverPressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.state}>
          <Ionicons name="notifications-outline" size={26} color={DESKTOP_COLORS.inkFaint} />
          <DText weight="semiBold" style={styles.stateTitle}>אין עדיין התראות</DText>
          <DText style={styles.stateHint}>עדכונים הקשורים לחברה יופיעו כאן</DText>
        </View>
      ) : (
        <View style={styles.table}>
          {items.map((n, index) => {
            const unread = unreadIds.has(n.id);
            const action = actionLabel(n);
            return (
              <HoverPressable
                key={n.id}
                style={[styles.row, index < items.length - 1 && styles.rowBorder, unread && styles.rowUnread]}
                hoverStyle={styles.rowHover}
                onPress={() => onOpen(n)}
                accessibilityLabel={n.message}
              >
                <View style={styles.icon}>
                  <Ionicons name={iconFor(n.notification_type)} size={15} color={DESKTOP_COLORS.brand} />
                </View>
                <View style={styles.textWrap}>
                  <DText weight={unread ? 'semiBold' : 'regular'} style={styles.message} numberOfLines={2}>
                    {n.message}
                  </DText>
                  <View style={styles.metaRow}>
                    <DText style={styles.time}>{timeAgo(n.created_at)}</DText>
                    {!!action && <DText weight="semiBold" style={styles.action}>{action}</DText>}
                  </View>
                </View>
                {unread && <View style={styles.unreadDot} />}
              </HoverPressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24, gap: 16, maxWidth: 900 },
  toolbar: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14 },
  markAll: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
    backgroundColor: DESKTOP_COLORS.surface,
  },
  markAllHover: { backgroundColor: DESKTOP_COLORS.canvas },
  markAllText: { fontSize: 12, color: DESKTOP_COLORS.brand },

  state: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 6 },
  stateTitle: { fontSize: 14, color: DESKTOP_COLORS.inkMuted, textAlign: 'center' },
  stateHint: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint, textAlign: 'center', marginBottom: 6 },
  retryButton: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryButtonHover: { backgroundColor: DESKTOP_COLORS.canvas },
  retryButtonText: { color: DESKTOP_COLORS.ink, fontSize: 12, textAlign: 'center' },

  table: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  rowUnread: { backgroundColor: 'rgba(0,136,204,0.04)' },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 7,
    backgroundColor: DESKTOP_COLORS.brandFocusRing,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  textWrap: { flex: 1, gap: 4, minWidth: 0 },
  message: { fontSize: 13 },
  metaRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  time: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint },
  action: { fontSize: 11.5, color: DESKTOP_COLORS.brand },
  unreadDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: DESKTOP_COLORS.danger, marginTop: 6, ...webOnly({}) },
});
