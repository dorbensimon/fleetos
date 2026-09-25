import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DK_SPACE, DKText, DriverPage, HeroTitle, ListRow, Pressy, Reveal, STATUS, Surface } from '../../components/driverKit';
import { ErrorState, LoadingState } from '../../components/ui';
import type { Notification } from '../../lib/adminApi';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = {
  insetTop: number;
  insetBottom: number;
  items: Notification[];
  unreadIds: Set<string>;
  loading: boolean;
  error: string | null;
  timeAgo: (iso: string) => string;
  actionLabel: (n: Notification) => string | null;
  onOpen: (n: Notification) => void;
  onMarkAllRead: () => void;
  onSettings: () => void;
  onBack: () => void;
  onRetry: () => void;
};

/** What each kind of update looks like: the icon and the colour of its meaning. */
function look(type: string | null): { icon: IconName; tint: string } {
  if (type === 'signature_request_assigned') return { icon: 'create', tint: STATUS.soon.fg };
  if (type === 'vehicle_assignment') return { icon: 'car-sport', tint: DK.accent };
  if (type?.startsWith('vehicle_')) return { icon: 'warning', tint: STATUS.expired.fg };
  if (type === 'license_update_reviewed') return { icon: 'id-card', tint: STATUS.ok.fg };
  if (type?.startsWith('driver_document_')) return { icon: 'document-text', tint: DK.accent };
  return { icon: 'person', tint: DK.accent };
}

function dayGroup(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86400000);
  if (diff <= 0) return 'היום';
  if (diff === 1) return 'אתמול';
  if (diff < 7) return 'השבוע';
  return 'מוקדם יותר';
}

/**
 * Updates from the fleet manager, newest first and grouped by day. Unread
 * ones carry a blue edge and a dot, and say in words what tapping does.
 */
export function DriverNotificationsMobile(p: Props) {
  const unread = p.items.filter((n) => p.unreadIds.has(n.id)).length;
  const groups: { title: string; rows: Notification[] }[] = [];
  for (const n of p.items) {
    const title = dayGroup(n.created_at);
    const last = groups[groups.length - 1];
    if (last?.title === title) last.rows.push(n);
    else groups.push({ title, rows: [n] });
  }

  return (
    <DriverPage
      insetTop={p.insetTop}
      insetBottom={p.insetBottom}
      hero={
        <HeroTitle
          title="התראות"
          subtitle={p.loading ? 'טוען עדכונים…' : unread ? `${unread} ${unread === 1 ? 'התראה חדשה' : 'התראות חדשות'}` : 'קראת את כל העדכונים'}
          onBack={p.onBack}
        />
      }
    >
      {p.loading ? (
        <Surface>
          <LoadingState />
        </Surface>
      ) : p.error ? (
        <Surface>
          <ErrorState message={p.error} onRetry={p.onRetry} />
        </Surface>
      ) : p.items.length === 0 ? (
        <Reveal>
          <Surface style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="notifications-outline" size={30} color={DK.accent} />
            </View>
            <DKText variant="heading" style={styles.center}>
              אין עדיין התראות
            </DKText>
            <DKText variant="body" color={DK.muted} style={styles.center}>
              כשמנהל הצי ישלח מסמך, ישייך רכב או כשתוקף יתקרב — העדכון יופיע כאן.
            </DKText>
          </Surface>
          <Surface style={styles.gapTop}>
            <ListRow first icon="options" title="ניהול התראות" subtitle="בחירת העדכונים שיישלחו אליך" onPress={p.onSettings} />
          </Surface>
        </Reveal>
      ) : (
        <>
          {groups.map((group, gi) => (
            <Reveal key={group.title} index={gi + 1}>
              <Surface style={styles.list}>
                <View style={styles.groupHead}>
                  <DKText variant="micro" color={DK.muted} accessibilityRole="header">
                    {group.title}
                  </DKText>
                  {gi === 0 && unread > 0 && (
                    <Pressy onPress={p.onMarkAllRead} accessibilityLabel="סימון כל ההתראות כנקראו" style={styles.markAll} pressScale={0.96}>
                      <Ionicons name="checkmark-done" size={16} color={DK.accent} />
                      <DKText variant="micro" color={DK.accent}>
                        סימון הכול כנקרא
                      </DKText>
                    </Pressy>
                  )}
                </View>
                {group.rows.map((n, i) => {
                  const isUnread = p.unreadIds.has(n.id);
                  const { icon, tint } = look(n.notification_type);
                  const action = p.actionLabel(n);
                  return (
                    <Pressy
                      key={n.id}
                      onPress={() => p.onOpen(n)}
                      accessibilityLabel={`${isUnread ? 'חדש. ' : ''}${n.message}. ${p.timeAgo(n.created_at)}${action ? `. ${action}` : ''}`}
                      pressScale={0.985}
                    >
                      <View style={[styles.row, styles.divider, isUnread && styles.rowUnread]}>
                        <View style={[styles.icon, { backgroundColor: `${tint}14` }]}>
                          <Ionicons name={icon} size={20} color={tint} />
                        </View>
                        <View style={styles.text}>
                          <DKText variant={isUnread ? 'label' : 'body'} color={isUnread ? DK.ink : DK.inkSoft} numberOfLines={3} style={styles.message}>
                            {n.message}
                          </DKText>
                          <View style={styles.meta}>
                            <DKText variant="caption" color={DK.muted}>
                              {p.timeAgo(n.created_at)}
                            </DKText>
                            {!!action && (
                              <>
                                <View style={styles.metaDot} />
                                <DKText variant="caption" color={DK.accent}>
                                  {action}
                                </DKText>
                              </>
                            )}
                          </View>
                        </View>
                        {isUnread ? <View style={styles.unreadDot} /> : <Ionicons name="chevron-back" size={18} color={DK.faint} />}
                      </View>
                    </Pressy>
                  );
                })}
              </Surface>
            </Reveal>
          ))}
          <Surface>
            <ListRow first icon="options" title="ניהול התראות" subtitle="בחירת העדכונים שיישלחו אליך" onPress={p.onSettings} />
          </Surface>
        </>
      )}
    </DriverPage>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  markAll: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, minHeight: 36, paddingHorizontal: 12, borderRadius: 999, backgroundColor: DK.accentSoft },
  groupHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: DK_SPACE.md, paddingTop: 6 },
  gapTop: { marginTop: 18 },
  list: { overflow: 'hidden' },
  row: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12, paddingHorizontal: DK_SPACE.md, paddingVertical: 14, minHeight: 72 },
  rowUnread: { backgroundColor: '#F5F8FF', borderRightWidth: 3, borderRightColor: DK.accent },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 4 },
  message: {},
  meta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: DK.faint },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: DK.accent, marginTop: 6 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 34, paddingHorizontal: 26 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
