import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Notification } from '../../lib/adminApi';
import type { NotificationType, NotificationTypeInfo } from '../../lib/notificationPreferencesApi';
import { isVehicleFolderNotification } from '../../lib/vehicleFolderAlerts';
import { LEAD_DAYS_DESCRIPTION, LEAD_DAYS_LABEL, type NotificationPreferencesState } from '../../lib/useNotificationPreferences';
import { LiquidGlassSwitch } from '../ui/LiquidGlassSwitch';
import { DesktopInput, DText, HoverPressable, prefersReducedMotion } from './primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, DesktopTone, webOnly } from './desktopTheme';

/**
 * Desktop "התראות" page: the notification list and the notification
 * settings side by side — settings in a sticky column on the right, the
 * list (filters, day groups) on the left. A row's "השתק סוג זה" turns that
 * type's toggle off on the spot, flashes the toggle and offers "ביטול".
 * Purely presentational: NotificationsScreen owns the list data and routing,
 * useNotificationPreferences owns the toggles.
 */

type Filter = 'all' | 'unread' | 'vehicles' | 'drivers' | 'signing';

const FILTER_LABEL: Record<Filter, string> = {
  all: 'הכול',
  unread: 'לא נקראו',
  vehicles: 'רכבים',
  drivers: 'נהגים',
  signing: 'חתימות',
};

function categoryOf(type: string | null): Filter | null {
  if (!type) return null;
  if (type.startsWith('vehicle_')) return 'vehicles';
  if (type.startsWith('driver_') || type.startsWith('license_update')) return 'drivers';
  if (type.startsWith('signature_')) return 'signing';
  return null;
}

/**
 * Row urgency. Folder expiry messages are written by the daily scan
 * (supabase/sql/90_vehicle_folder_expiry_notifications.sql): an expired
 * folder's message reads "... פג ב-<date>", an upcoming one "... יפוג בעוד".
 */
function toneOf(n: Notification): DesktopTone | 'brand' {
  const type = n.notification_type;
  if (isVehicleFolderNotification(type)) return n.message.includes(' פג ב-') ? 'bad' : 'warn';
  if (type === 'vehicle_service_due' || type === 'license_update_requested') return 'warn';
  return 'brand';
}

const DAY_MS = 86_400_000;

function dayGroupOf(iso: string, now: Date): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = new Date(iso).getTime();
  if (t >= startOfToday) return 'היום';
  if (t >= startOfToday - DAY_MS) return 'אתמול';
  if (t >= startOfToday - 6 * DAY_MS) return 'השבוע';
  return 'קודם';
}

type SettingsGroup = { key: string; title: string; footnote?: string; items: NotificationTypeInfo[]; stripPrefix?: boolean };

function settingsGroups(types: NotificationTypeInfo[], isDriver: boolean): SettingsGroup[] {
  const folders = types.filter((t) => isVehicleFolderNotification(t.type));
  const signing = types.filter((t) => t.type.startsWith('signature_'));
  const drivers = types.filter((t) => !isDriver && t.type.startsWith('driver_'));
  const rest = types.filter((t) => !folders.includes(t) && !signing.includes(t) && !drivers.includes(t));
  const folderGroup: SettingsGroup = {
    key: 'folders',
    title: 'תוקף תיקיות רכב',
    footnote: folders[0]?.description,
    items: folders,
    stripPrefix: true,
  };
  const groups: SettingsGroup[] = isDriver
    ? [
        { key: 'signing', title: 'חתימות', items: signing },
        { key: 'general', title: 'כללי', items: rest },
        folderGroup,
      ]
    : [
        { key: 'drivers', title: 'נהגים', items: drivers },
        folderGroup,
        { key: 'general', title: 'טיפולים', items: rest },
      ];
  return groups.filter((group) => group.items.length > 0);
}

export function NotificationsHubDesktopView({
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
  prefs,
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
  prefs: NotificationPreferencesState;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [muteHoverId, setMuteHoverId] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ type: NotificationType; label: string } | null>(null);
  const [flash, setFlash] = useState<{ type: NotificationType; nonce: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleRefs = useRef<Partial<Record<NotificationType, View | null>>>({});
  const reduceMotion = prefersReducedMotion();

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const typeInfo = useMemo(() => new Map(prefs.visibleTypes.map((t) => [t.type, t])), [prefs.visibleTypes]);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: items.length, unread: unreadIds.size, vehicles: 0, drivers: 0, signing: 0 };
    for (const n of items) {
      const category = categoryOf(n.notification_type);
      if (category) result[category] += 1;
    }
    return result;
  }, [items, unreadIds]);

  const visible = items.filter((n) =>
    filter === 'all' ? true : filter === 'unread' ? unreadIds.has(n.id) : categoryOf(n.notification_type) === filter
  );

  const groups = useMemo(() => {
    const now = new Date();
    const order = ['היום', 'אתמול', 'השבוע', 'קודם'];
    const byDay = new Map<string, Notification[]>();
    for (const n of visible) {
      const key = dayGroupOf(n.created_at, now);
      byDay.set(key, [...(byDay.get(key) ?? []), n]);
    }
    return order.filter((key) => byDay.has(key)).map((key) => ({ key, items: byDay.get(key)! }));
  }, [visible]);

  const flashToggle = (type: NotificationType) => {
    setFlash((prev) => ({ type, nonce: (prev?.nonce ?? 0) + 1 }));
    const node = toggleRefs.current[type] as unknown as { scrollIntoView?: (options: object) => void } | null;
    node?.scrollIntoView?.({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const mute = async (type: NotificationType) => {
    const info = typeInfo.get(type);
    if (!info) return;
    const saved = await prefs.toggle(type, false);
    if (!saved) return;
    flashToggle(type);
    setUndo({ type, label: info.label });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  };

  const undoMute = async () => {
    if (!undo) return;
    const { type } = undo;
    setUndo(null);
    if (await prefs.toggle(type, true)) flashToggle(type);
  };

  const chips: Filter[] = (['all', 'unread', 'vehicles', 'drivers', 'signing'] as Filter[]).filter(
    (key) => key === 'all' || key === 'unread' || counts[key] > 0
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.columns}>
        {/* Settings — right */}
        <View style={styles.settingsColumn}>
          <DText weight="bold" style={styles.columnTitle}>הגדרות התראות</DText>
          {prefs.loading ? (
            <View style={styles.panel}><ActivityIndicator color={DESKTOP_COLORS.brand} /></View>
          ) : prefs.error ? (
            <View style={styles.panel}>
              <DText style={styles.stateHint}>{prefs.error}</DText>
              <HoverPressable style={styles.textButton} hoverStyle={styles.rowHover} onPress={prefs.load}>
                <DText weight="semiBold" style={styles.textButtonLabel}>נסה שוב</DText>
              </HoverPressable>
            </View>
          ) : (
            <>
              {prefs.leadDays != null && (
                <View style={styles.panel}>
                  <DText weight="semiBold" style={styles.settingLabel}>{LEAD_DAYS_LABEL}</DText>
                  <DText style={styles.settingDescription}>{LEAD_DAYS_DESCRIPTION}</DText>
                  <View style={styles.leadControl}>
                    <DesktopInput
                      value={prefs.leadDraft}
                      onChangeText={(v) => prefs.setLeadDraft(v.replace(/\D/g, '').slice(0, 2))}
                      onSubmitEditing={() => void prefs.saveLeadDays()}
                      editable={!prefs.savingLead}
                      keyboardType="number-pad"
                      ltr
                      style={styles.leadInput}
                    />
                    <DText style={styles.settingDescription}>ימים</DText>
                    <HoverPressable
                      style={[styles.confirmBtn, !prefs.leadChanged && !prefs.savingLead && styles.confirmBtnIdle]}
                      hoverStyle={styles.confirmBtnHover}
                      pressStyle={styles.pressDown}
                      onPress={() => void prefs.saveLeadDays()}
                      disabled={!prefs.leadChanged || prefs.savingLead}
                      accessibilityLabel="שמירת זמן ההתראה"
                    >
                      {prefs.savingLead ? <ActivityIndicator size={12} color="#FFFFFF" /> : <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                    </HoverPressable>
                  </View>
                </View>
              )}

              {settingsGroups(prefs.visibleTypes, prefs.isDriver).map((group) => (
                <View key={group.key} style={styles.settingsGroup}>
                  <DText weight="semiBold" style={styles.groupTitle}>{group.title}</DText>
                  <View style={styles.panelList}>
                    {group.items.map((item, index) => (
                      <View
                        key={item.type}
                        ref={(node) => { toggleRefs.current[item.type] = node; }}
                        style={[styles.toggleRow, index < group.items.length - 1 && styles.rowBorder]}
                      >
                        {flash?.type === item.type && (
                          <View key={flash.nonce} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash]} />
                        )}
                        <View style={styles.toggleText}>
                          <DText weight="semiBold" style={styles.settingLabel}>
                            {group.stripPrefix ? item.label.replace(/^תוקף /, '') : item.label}
                          </DText>
                          {!group.footnote && !!item.description && <DText style={styles.settingDescription}>{item.description}</DText>}
                        </View>
                        <LiquidGlassSwitch
                          value={prefs.prefs?.[item.type] ?? true}
                          onValueChange={(value) => void prefs.toggle(item.type, value)}
                          disabled={prefs.savingType === item.type}
                          accessibilityLabel={item.label}
                          tint={DESKTOP_TONES.ok.fg}
                        />
                      </View>
                    ))}
                  </View>
                  {!!group.footnote && <DText style={styles.footnote}>{group.footnote}</DText>}
                </View>
              ))}
              <DText style={styles.footnote}>כל שינוי נשמר מיד ועבורך בלבד.</DText>
            </>
          )}
        </View>

        {/* List — left */}
        <View style={styles.listColumn}>
          <View style={styles.toolbar}>
            <DText weight="bold" style={styles.columnTitle}>
              {items.length === 0 ? 'התראות' : `${items.length} התראות`}
            </DText>
            {unreadIds.size > 0 && (
              <HoverPressable style={styles.markAll} hoverStyle={styles.rowHover} pressStyle={styles.pressDown} onPress={onMarkAllRead}>
                <Ionicons name="checkmark-done-outline" size={14} color={DESKTOP_COLORS.brand} />
                <DText weight="semiBold" style={styles.markAllText}>קרא הכל</DText>
              </HoverPressable>
            )}
          </View>

          {items.length > 0 && (
            <View style={styles.chips}>
              {chips.map((key) => {
                const active = filter === key;
                const count = key === 'all' ? null : counts[key];
                return (
                  <HoverPressable
                    key={key}
                    style={[styles.chip, active && styles.chipActive]}
                    hoverStyle={active ? undefined : styles.rowHover}
                    pressStyle={styles.pressDown}
                    onPress={() => setFilter(key)}
                    accessibilityLabel={FILTER_LABEL[key]}
                  >
                    <DText weight="semiBold" style={[styles.chipText, active && styles.chipTextActive]}>{FILTER_LABEL[key]}</DText>
                    {count != null && count > 0 && <DText style={[styles.chipCount, active && styles.chipTextActive]}>{count}</DText>}
                  </HoverPressable>
                );
              })}
            </View>
          )}

          {undo && (
            <View style={[styles.undoBar, !reduceMotion && styles.fadeIn]}>
              <Ionicons name="notifications-off-outline" size={15} color={DESKTOP_COLORS.inkMuted} />
              <DText style={styles.undoText} numberOfLines={1}>{`כיבית את ההתראות מסוג "${undo.label}"`}</DText>
              <HoverPressable style={styles.textButton} hoverStyle={styles.rowHover} onPress={() => void undoMute()}>
                <DText weight="semiBold" style={styles.textButtonLabel}>ביטול</DText>
              </HoverPressable>
            </View>
          )}

          {loading ? (
            <View style={styles.state}><ActivityIndicator color={DESKTOP_COLORS.brand} /></View>
          ) : error ? (
            <View style={styles.state}>
              <DText weight="semiBold" style={styles.stateTitle}>לא ניתן לטעון את ההתראות</DText>
              <DText style={styles.stateHint}>{error}</DText>
              <HoverPressable style={styles.markAll} hoverStyle={styles.rowHover} onPress={onRetry}>
                <DText weight="semiBold" style={styles.markAllText}>נסה שוב</DText>
              </HoverPressable>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.state}>
              <Ionicons name="notifications-outline" size={26} color={DESKTOP_COLORS.inkFaint} />
              <DText weight="semiBold" style={styles.stateTitle}>אין עדיין התראות</DText>
              <DText style={styles.stateHint}>עדכונים יופיעו כאן. את סוגי ההתראות אפשר לבחור בצד ימין.</DText>
            </View>
          ) : visible.length === 0 ? (
            <View style={styles.state}>
              <DText weight="semiBold" style={styles.stateTitle}>{filter === 'unread' ? 'אין התראות שלא נקראו' : 'אין התראות בסינון הזה'}</DText>
            </View>
          ) : (
            // Keyed by filter so a filter change replays the short fade instead of snapping.
            <View key={filter} style={[styles.groups, !reduceMotion && styles.fadeIn]}>
              {groups.map((group) => (
                <View key={group.key} style={styles.dayGroup}>
                  <DText weight="semiBold" style={styles.groupTitle}>{group.key}</DText>
                  <View style={styles.table}>
                    {group.items.map((n, index) => {
                      const unread = unreadIds.has(n.id);
                      const action = actionLabel(n);
                      const tone = toneOf(n);
                      const toneColors = tone === 'brand' ? { bg: DESKTOP_COLORS.brandFocusRing, fg: DESKTOP_COLORS.brand } : DESKTOP_TONES[tone];
                      const type = n.notification_type as NotificationType | null;
                      const canMute = !!type && typeInfo.has(type) && (prefs.prefs?.[type] ?? true);
                      const hovered = hoveredId === n.id || muteHoverId === n.id;
                      // The mute link is a sibling laid over the row, not nested in it — a button may not contain a button.
                      return (
                        <View key={n.id} style={[styles.rowWrap, index < group.items.length - 1 && styles.rowBorder, hovered && styles.rowHover]}>
                          <HoverPressable
                            style={styles.row}
                            onHoverIn={() => setHoveredId(n.id)}
                            onHoverOut={() => setHoveredId((current) => (current === n.id ? null : current))}
                            onPress={() => onOpen(n)}
                            accessibilityLabel={n.message}
                          >
                            <View style={[styles.icon, { backgroundColor: toneColors.bg }]}>
                              <Ionicons name={iconFor(n.notification_type)} size={15} color={toneColors.fg} />
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
                            <View style={[styles.unreadDot, !unread && styles.unreadDotRead]} />
                          </HoverPressable>
                          {canMute && (
                            <HoverPressable
                              style={[styles.muteLink, hovered && styles.muteLinkVisible]}
                              hoverStyle={styles.muteLinkHover}
                              onHoverIn={() => setMuteHoverId(n.id)}
                              onHoverOut={() => setMuteHoverId((current) => (current === n.id ? null : current))}
                              onPress={() => void mute(type!)}
                              disabled={prefs.savingType === type}
                              accessibilityLabel={`השתקת התראות מסוג ${typeInfo.get(type!)?.label ?? ''}`}
                            >
                              <Ionicons name="notifications-off-outline" size={12} color={DESKTOP_COLORS.inkMuted} />
                              <DText style={styles.muteText}>השתק סוג זה</DText>
                            </HoverPressable>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const SHADOW = webOnly({ boxShadow: '0 12px 30px -22px rgba(22, 34, 46, 0.32)' });

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 22, paddingBottom: 48, maxWidth: 1440, width: '100%', alignSelf: 'center' },
  columns: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 16 },
  settingsColumn: { width: 340, flexShrink: 0, gap: 12, ...webOnly({ position: 'sticky', top: 0 }) },
  listColumn: { flex: 1, minWidth: 0, gap: 12 },
  columnTitle: { fontSize: 14 },

  panel: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 10, padding: 14, gap: 4, ...SHADOW },
  panelList: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 10, paddingHorizontal: 14, overflow: 'hidden', ...SHADOW },
  settingsGroup: { gap: 6 },
  groupTitle: { fontSize: 12, color: DESKTOP_COLORS.inkMuted },
  toggleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 8, marginHorizontal: -14, paddingHorizontal: 14 },
  toggleText: { flex: 1, minWidth: 0 },
  settingLabel: { fontSize: 13 },
  settingDescription: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint, marginTop: 2 },
  footnote: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint, paddingHorizontal: 2 },
  leadControl: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 8 },
  leadInput: { width: 52 },
  // Same chip as the record pages' inline ✓ (components/desktop/record/RecordKit.tsx).
  confirmBtn: { width: 26, height: 26, borderRadius: 6, backgroundColor: DESKTOP_COLORS.brand, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'opacity 150ms ease, transform 120ms ease-out' }) },
  confirmBtnIdle: { opacity: 0.35 },
  confirmBtnHover: { opacity: 0.88 },
  pressDown: { transform: [{ scale: 0.97 }] },
  // Confirms which toggle just changed: a brand tint that fades out (opacity only, so it also runs under reduced motion).
  flash: {
    backgroundColor: DESKTOP_COLORS.brandFocusRing,
    opacity: 0,
    ...webOnly({ animationKeyframes: { from: { opacity: 1 }, to: { opacity: 0 } }, animationDuration: '1100ms', animationTimingFunction: 'ease-out' }),
  },

  toolbar: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', minHeight: 20 },
  markAll: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
    backgroundColor: DESKTOP_COLORS.surface,
    ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }),
  },
  markAllText: { fontSize: 12, color: DESKTOP_COLORS.brand },

  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
    backgroundColor: DESKTOP_COLORS.surface,
    ...webOnly({ transition: 'background-color 150ms ease, border-color 150ms ease, transform 120ms ease-out' }),
  },
  chipActive: { backgroundColor: DESKTOP_COLORS.brandFocusRing, borderColor: DESKTOP_COLORS.brand },
  chipText: { fontSize: 12, color: DESKTOP_COLORS.inkMuted },
  chipTextActive: { color: DESKTOP_COLORS.brand },
  chipCount: { fontSize: 11, color: DESKTOP_COLORS.inkFaint, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },

  undoBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 8,
    backgroundColor: DESKTOP_TONES.neutral.bg,
  },
  undoText: { flex: 1, fontSize: 12.5, color: DESKTOP_COLORS.ink },
  textButton: { height: 26, paddingHorizontal: 8, borderRadius: 6, justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease' }) },
  textButtonLabel: { fontSize: 12.5, color: DESKTOP_COLORS.brand },

  fadeIn: webOnly({
    animationKeyframes: { from: { opacity: 0 }, to: { opacity: 1 } },
    animationDuration: '150ms',
    animationTimingFunction: EASE_OUT,
  }),

  state: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 6 },
  stateTitle: { fontSize: 14, color: DESKTOP_COLORS.inkMuted, textAlign: 'center' },
  stateHint: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint, textAlign: 'center', marginBottom: 6 },

  groups: { gap: 14 },
  dayGroup: { gap: 6 },
  table: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 10, overflow: 'hidden', ...SHADOW },
  rowWrap: { position: 'relative', ...webOnly({ transition: 'background-color 150ms ease' }) },
  row: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  icon: { width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  textWrap: { flex: 1, gap: 4, minWidth: 0 },
  message: { fontSize: 13 },
  metaRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, minHeight: 22 },
  time: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint },
  action: { fontSize: 11.5, color: DESKTOP_COLORS.brand },
  // Revealed on row hover so the list stays calm; the whole row stays the primary target.
  muteLink: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 5,
    position: 'absolute',
    left: 12,
    bottom: 10,
    opacity: 0,
    ...webOnly({ transition: 'opacity 150ms ease, background-color 150ms ease' }),
  },
  muteLinkVisible: { opacity: 1 },
  muteLinkHover: { backgroundColor: DESKTOP_COLORS.borderSoft },
  muteText: { fontSize: 11.5, color: DESKTOP_COLORS.inkMuted },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: DESKTOP_COLORS.danger,
    marginTop: 6,
    ...webOnly({ transition: 'opacity 200ms ease-out' }),
  },
  unreadDotRead: { opacity: 0 },
});
