import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DK_SPACE, DKText, DriverPage, HeroTitle, ListRow, Pressy, Reveal, STATUS, Surface } from '../driverKit';
import { ErrorState, LoadingState } from '../ui';
import { BrandLoader } from '../ui/BrandLoader';
import { LiquidGlassSwitch } from '../ui/LiquidGlassSwitch';
import { DText, HoverPressable } from '../desktop/primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from '../desktop/desktopTheme';
import { notificationGroups } from '../../lib/notificationPreferencesApi';
import type { NotificationPreferencesState } from '../../lib/useNotificationPreferences';
import { ownerActionLabel, type OwnerNotification, type OwnerNotificationType } from '../../lib/ownerNotifications';
import { t, dirIcon } from '../../lib/i18n';

/**
 * The owner's notifications: what happened across the customers (a company
 * started working, went quiet, a trial or renewal is due), never a driver's
 * day-to-day. Phone: one list by day on the night. Desktop: the feed beside
 * its switches.
 */

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TYPE_ICON: Record<OwnerNotificationType, IconName> = {
  owner_company_activated: 'rocket',
  owner_admin_added: 'person-add',
  owner_company_not_activated: 'hourglass',
  owner_company_inactive: 'moon',
  owner_carrier_license_expiry: 'document-text',
  owner_trial_ending: 'timer',
  owner_renewal_due: 'card',
  owner_vehicle_limit: 'trending-up',
};

const TONE_COLOR: Record<OwnerNotification['tone'], string> = {
  info: DK.accent,
  good: STATUS.ok.fg,
  warn: STATUS.soon.fg,
  bad: STATUS.expired.fg,
};

const BILLING: OwnerNotificationType[] = ['owner_trial_ending', 'owner_renewal_due', 'owner_vehicle_limit'];

function dayGroup(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86400000);
  if (diff <= 0) return t('common.today');
  if (diff === 1) return t('time.yesterday');
  if (diff < 7) return t('time.thisWeek');
  return t('time.earlier');
}

function grouped(items: OwnerNotification[]) {
  const groups: { title: string; rows: OwnerNotification[] }[] = [];
  for (const n of items) {
    const title = dayGroup(n.created_at);
    const last = groups[groups.length - 1];
    if (last?.title === title) last.rows.push(n);
    else groups.push({ title, rows: [n] });
  }
  return groups;
}

type FeedProps = {
  items: OwnerNotification[];
  unreadIds: Set<string>;
  loading: boolean;
  error: string | null;
  timeAgo: (iso: string) => string;
  onOpen: (n: OwnerNotification) => void;
  onMarkAllRead: () => void;
  onRetry: () => void;
};

// ── Phone ─────────────────────────────────────────────────────────────────

export function OwnerNotificationsMobile(
  p: FeedProps & { insetTop: number; insetBottom: number; onSettings: () => void; onBack: () => void; refreshing?: boolean; onRefresh?: () => void },
) {
  const unread = p.items.filter((n) => p.unreadIds.has(n.id)).length;
  const groups = grouped(p.items);
  return (
    <DriverPage
      insetTop={p.insetTop}
      insetBottom={p.insetBottom}
      refreshing={p.refreshing}
      onRefresh={p.onRefresh}
      hero={
        <HeroTitle
          title={t('notifications.title')}
          subtitle={p.loading ? t('notifications.loadingUpdates') : unread ? t('owner.notif.unreadFromCompanies', { unread, v1: unread === 1 ? t('owner.notif.newUpdate') : t('owner.notif.newUpdates') }) : t('notifications.allRead')}
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
              {t('owner.notif.noNew')}
            </DKText>
            <DKText variant="body" color={DK.muted} style={styles.center}>
              {t('owner.notif.emptyHint')}
            </DKText>
          </Surface>
          <Surface style={styles.gapTop}>
            <ListRow first icon="options" title={t('owner.notif.manage')} subtitle={t('owner.notif.manageHint')} onPress={p.onSettings} />
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
                    <Pressy onPress={p.onMarkAllRead} accessibilityLabel={t('notifications.markAllReadLabel')} style={styles.markAll} pressScale={0.96}>
                      <Ionicons name="checkmark-done" size={16} color={DK.accent} />
                      <DKText variant="micro" color={DK.accent}>
                        {t('notifications.markAllReadShort')}
                      </DKText>
                    </Pressy>
                  )}
                </View>
                {group.rows.map((n) => {
                  const isUnread = p.unreadIds.has(n.id);
                  const tint = TONE_COLOR[n.tone];
                  const action = ownerActionLabel(n);
                  return (
                    <Pressy
                      key={n.id}
                      onPress={() => p.onOpen(n)}
                      accessibilityLabel={`${isUnread ? t('notifications.newPrefix') : ''}${n.title}. ${n.message}. ${p.timeAgo(n.created_at)}${action ? `. ${action}` : ''}`}
                      pressScale={0.985}
                    >
                      <View style={[styles.row, styles.divider, isUnread && styles.rowUnread]}>
                        <View style={[styles.icon, { backgroundColor: `${tint}14` }]}>
                          <Ionicons name={TYPE_ICON[n.notification_type] ?? 'business'} size={20} color={tint} />
                        </View>
                        <View style={styles.text}>
                          <DKText variant="label" color={DK.ink} numberOfLines={2}>
                            {n.title}
                          </DKText>
                          <DKText variant="caption" color={isUnread ? DK.inkSoft : DK.muted} numberOfLines={3}>
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
                        {isUnread ? <View style={styles.unreadDot} /> : <Ionicons name={dirIcon('chevron-back')} size={18} color={DK.faint} />}
                      </View>
                    </Pressy>
                  );
                })}
              </Surface>
            </Reveal>
          ))}
          <Surface>
            <ListRow first icon="options" title={t('owner.notif.manage')} subtitle={t('owner.notif.manageHint')} onPress={p.onSettings} />
          </Surface>
        </>
      )}
    </DriverPage>
  );
}

// ── Desktop ───────────────────────────────────────────────────────────────

type Filter = 'all' | 'unread' | 'customers' | 'billing';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', get label() { return t('common.all'); } },
  { value: 'unread', get label() { return t('notifications.unread'); } },
  { value: 'customers', get label() { return t('owner.notif.companies'); } },
  { value: 'billing', get label() { return t('owner.notif.subscriptions'); } },
];

function matches(n: OwnerNotification, filter: Filter, unreadIds: Set<string>): boolean {
  if (filter === 'unread') return unreadIds.has(n.id);
  if (filter === 'billing') return BILLING.includes(n.notification_type);
  if (filter === 'customers') return !BILLING.includes(n.notification_type);
  return true;
}

const DESK_TONE: Record<OwnerNotification['tone'], { bg: string; fg: string }> = {
  info: { bg: '#E6F2F9', fg: DESKTOP_COLORS.brand },
  good: DESKTOP_TONES.ok,
  warn: DESKTOP_TONES.warn,
  bad: DESKTOP_TONES.bad,
};

export function OwnerNotificationsDesktop(p: FeedProps & { prefs: NotificationPreferencesState }) {
  const [filter, setFilter] = useState<Filter>('all');
  const rows = useMemo(() => p.items.filter((n) => matches(n, filter, p.unreadIds)), [p.items, filter, p.unreadIds]);
  const groups = grouped(rows);
  const unread = p.items.filter((n) => p.unreadIds.has(n.id)).length;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={d.page}>
      <View style={d.header}>
        <View style={d.headerText}>
          <DText weight="extraBold" style={d.title} accessibilityRole="header">
            {t('notifications.title')}
          </DText>
          <DText style={d.subtitle}>{t('owner.notif.aboutCompanies')}</DText>
        </View>
        {unread > 0 && (
          <HoverPressable style={d.secondary} hoverStyle={d.secondaryHover} onPress={p.onMarkAllRead}>
            <Ionicons name="checkmark-done" size={16} color={DESKTOP_COLORS.ink} />
            <DText weight="semiBold" style={d.secondaryText}>
              {t('notifications.markAllReadOpen')}{unread})
            </DText>
          </HoverPressable>
        )}
      </View>

      <View style={d.columns}>
        <View style={[d.panel, d.feed]}>
          <View style={d.toolbar} accessibilityRole="tablist">
            {FILTERS.map((f) => {
              const on = f.value === filter;
              const count = p.items.filter((n) => matches(n, f.value, p.unreadIds)).length;
              return (
                <HoverPressable
                  key={f.value}
                  onPress={() => setFilter(f.value)}
                  style={[d.filter, on && d.filterOn]}
                  hoverStyle={on ? undefined : d.filterHover}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  aria-selected={on}
                >
                  <DText weight={on ? 'bold' : 'semiBold'} style={[d.filterText, on && d.onDark]}>
                    {f.label}
                  </DText>
                  <DText weight="bold" style={[d.filterCount, on && d.onDarkSoft]}>
                    {count}
                  </DText>
                </HoverPressable>
              );
            })}
          </View>

          {p.loading && !p.items.length ? (
            <View style={d.center}>
              <BrandLoader color={DESKTOP_COLORS.brand} />
            </View>
          ) : p.error ? (
            <ErrorState message={p.error} onRetry={p.onRetry} />
          ) : rows.length === 0 ? (
            <View style={d.emptyBox}>
              <View style={d.emptyIcon}>
                <Ionicons name="notifications-outline" size={26} color={DESKTOP_COLORS.brand} />
              </View>
              <DText weight="bold" style={d.emptyTitle}>
                {p.items.length ? t('notifications.noneInFilterUpdates') : t('owner.notif.noNew')}
              </DText>
              <DText style={d.emptyBody}>{t('owner.notif.emptyHint')}</DText>
            </View>
          ) : (
            groups.map((g) => (
              <View key={g.title}>
                <DText weight="bold" style={d.groupTitle}>
                  {g.title}
                </DText>
                {g.rows.map((n) => {
                  const isUnread = p.unreadIds.has(n.id);
                  const tone = DESK_TONE[n.tone];
                  const action = ownerActionLabel(n);
                  return (
                    <HoverPressable
                      key={n.id}
                      style={[d.item, isUnread && d.itemUnread]}
                      hoverStyle={d.itemHover}
                      onPress={() => p.onOpen(n)}
                      accessibilityRole="link"
                      accessibilityLabel={`${isUnread ? t('notifications.newPrefix') : ''}${n.title}. ${n.message}`}
                    >
                      <View style={[d.itemIcon, { backgroundColor: tone.bg }]}>
                        <Ionicons name={TYPE_ICON[n.notification_type] ?? 'business'} size={18} color={tone.fg} />
                      </View>
                      <View style={d.itemText}>
                        <DText weight="bold" style={d.itemTitle}>
                          {n.title}
                        </DText>
                        <DText style={d.itemBody}>{n.message}</DText>
                        <DText style={d.itemMeta}>
                          {p.timeAgo(n.created_at)}
                          {action ? (
                            <DText weight="semiBold" style={d.itemAction}>
                              {'  ·  '}
                              {action}
                            </DText>
                          ) : null}
                        </DText>
                      </View>
                      {isUnread && <View style={d.unreadDot} />}
                    </HoverPressable>
                  );
                })}
              </View>
            ))
          )}
        </View>

        <View style={[d.panel, d.settings]}>
          <DText weight="bold" style={d.panelTitle} accessibilityRole="header">
            {t('notifications.whatReachesYou')}
          </DText>
          <DText style={d.panelSub}>{t('owner.notif.toggleHint')}</DText>
          {p.prefs.loading ? (
            <View style={d.center}>
              <BrandLoader color={DESKTOP_COLORS.brand} />
            </View>
          ) : p.prefs.error ? (
            <ErrorState message={p.prefs.error} onRetry={p.prefs.load} />
          ) : (
            notificationGroups(p.prefs.visibleTypes, false, true).map((group) => (
              <View key={group.key} style={d.prefGroup}>
                <DText weight="bold" style={d.prefGroupTitle}>
                  {group.title}
                </DText>
                {group.items.map((entry) => {
                  const on = p.prefs.prefs?.[entry.type] ?? true;
                  return (
                    <View key={entry.type} style={d.prefRow}>
                      <View style={d.itemText}>
                        <DText weight="semiBold" style={d.prefLabel}>
                          {entry.label}
                        </DText>
                        <DText style={d.prefDesc}>{entry.description}</DText>
                      </View>
                      <LiquidGlassSwitch
                        value={on}
                        onValueChange={(v) => void p.prefs.toggle(entry.type, v)}
                        disabled={p.prefs.savingType === entry.type}
                        accessibilityLabel={entry.label}
                      />
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  markAll: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, minHeight: 36, paddingHorizontal: 12, borderRadius: 999, backgroundColor: DK.accentSoft },
  groupHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: DK_SPACE.md, paddingTop: 6 },
  gapTop: { marginTop: 18 },
  list: { overflow: 'hidden' },
  row: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12, paddingHorizontal: DK_SPACE.md, paddingVertical: 14, minHeight: 72 },
  rowUnread: { backgroundColor: '#F5F8FF', borderEndWidth: 3, borderEndColor: DK.accent },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 3 },
  meta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: DK.faint },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: DK.accent, marginTop: 6 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 34, paddingHorizontal: 26 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});

const d = StyleSheet.create({
  page: { padding: 28, paddingBottom: 48, gap: 20, width: '100%', maxWidth: 1240, alignSelf: 'center' },
  center: { paddingVertical: 48, alignItems: 'center' },
  header: { flexDirection: 'row-reverse', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  headerText: { gap: 4 },
  title: { fontSize: 30, lineHeight: 36, color: DESKTOP_COLORS.ink, letterSpacing: -0.7 },
  subtitle: { fontSize: 15, color: DESKTOP_COLORS.inkMuted },
  secondary: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
  },
  secondaryHover: { backgroundColor: DESKTOP_COLORS.rowHover, borderColor: DESKTOP_COLORS.borderInput },
  secondaryText: { fontSize: 14, color: DESKTOP_COLORS.ink },

  columns: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' },
  panel: { backgroundColor: DESKTOP_COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: DESKTOP_COLORS.border, overflow: 'hidden' },
  feed: { flex: 1, minWidth: 420 },
  settings: { width: 380, flexGrow: 1, maxWidth: 520, paddingBottom: 8 },

  toolbar: { flexDirection: 'row-reverse', gap: 6, padding: 14, borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft, flexWrap: 'wrap' },
  filter: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: DESKTOP_COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderSoft,
    ...webOnly({ transition: 'background-color 160ms ease-out, border-color 160ms ease-out' }),
  },
  filterHover: { backgroundColor: '#EEF2F5', borderColor: DESKTOP_COLORS.border },
  filterOn: { backgroundColor: DESKTOP_COLORS.ink, borderColor: DESKTOP_COLORS.ink },
  filterText: { fontSize: 13.5, color: DESKTOP_COLORS.ink },
  filterCount: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  onDark: { color: '#FFFFFF' },
  onDarkSoft: { color: 'rgba(255,255,255,0.75)' },

  groupTitle: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 },
  item: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12, paddingHorizontal: 18, paddingVertical: 12, marginHorizontal: 6, borderRadius: 10 },
  itemUnread: { backgroundColor: '#F3F8FC' },
  itemHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  itemIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, minWidth: 0, gap: 2 },
  itemTitle: { fontSize: 14.5, color: DESKTOP_COLORS.ink },
  itemBody: { fontSize: 13.5, lineHeight: 20, color: DESKTOP_COLORS.inkMuted },
  itemMeta: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint, marginTop: 2 },
  itemAction: { fontSize: 12.5, color: DESKTOP_COLORS.brand },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: DESKTOP_COLORS.brand, marginTop: 6 },

  emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 56, paddingHorizontal: 32 },
  emptyIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#E6F2F9', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontSize: 18, color: DESKTOP_COLORS.ink },
  emptyBody: { fontSize: 14, lineHeight: 21, color: DESKTOP_COLORS.inkMuted, textAlign: 'center', maxWidth: 420 },

  panelTitle: { fontSize: 16, color: DESKTOP_COLORS.ink, paddingHorizontal: 18, paddingTop: 16 },
  panelSub: { fontSize: 13, lineHeight: 19, color: DESKTOP_COLORS.inkFaint, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 8 },
  prefGroup: { paddingTop: 8 },
  prefGroupTitle: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted, paddingHorizontal: 18, paddingVertical: 6 },
  prefRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 10, borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  prefLabel: { fontSize: 14, color: DESKTOP_COLORS.ink },
  prefDesc: { fontSize: 12.5, lineHeight: 18, color: DESKTOP_COLORS.inkFaint },
});
