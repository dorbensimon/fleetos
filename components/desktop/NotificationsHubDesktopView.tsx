import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BrandLoader } from '../ui/BrandLoader';
import type { Notification } from '../../lib/adminApi';
import {
  LEAD_RULES,
  leadPhrase,
  leadStepLabels,
  leadUnitWord,
  notificationGroups,
  type LeadRule,
  type NotificationGroup,
  type NotificationType,
  type NotificationTypeInfo,
} from '../../lib/notificationPreferencesApi';
import { isVehicleFolderNotification } from '../../lib/vehicleFolderAlerts';
import { notificationTone } from '../../lib/notificationLook';
import type { NotificationPreferencesState } from '../../lib/useNotificationPreferences';
import { LiquidGlassSwitch } from '../ui/LiquidGlassSwitch';
import { DText, HoverPressable, prefersReducedMotion } from './primitives';
import { DESKTOP_COLORS, DESKTOP_FONT, DESKTOP_TONES, webOnly } from './desktopTheme';

/**
 * Desktop "התראות" page, in two calm views behind one switch:
 *   עדכונים — the list, one readable column grouped by day, filters on top.
 *   הגדרות  — every notification type as a card with its on/off switch and,
 *             for the timed ones, its own lead time; above them a timeline
 *             that shows at a glance when each vehicle alert goes out.
 * A row's bell-off mutes that type on the spot (with "ביטול"); its clock
 * jumps to that type's card. Purely presentational: NotificationsScreen
 * owns the list, useNotificationPreferences owns the settings.
 */

type Section = 'feed' | 'settings';
type Filter = 'all' | 'unread' | 'vehicles' | 'drivers' | 'signing';
type IconName = keyof typeof Ionicons.glyphMap;

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

const DAY_MS = 86_400_000;

function dayGroupOf(iso: string, now: Date): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = new Date(iso).getTime();
  if (t >= startOfToday) return 'היום';
  if (t >= startOfToday - DAY_MS) return 'אתמול';
  if (t >= startOfToday - 6 * DAY_MS) return new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(iso));
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

const TYPE_ICON: Partial<Record<NotificationType, IconName>> = {
  driver_profile_update: 'person-outline',
  driver_document_upload: 'document-text-outline',
  vehicle_license_expiry: 'card-outline',
  vehicle_operating_license_expiry: 'briefcase-outline',
  vehicle_insurance_mandatory_expiry: 'shield-outline',
  vehicle_insurance_comprehensive_expiry: 'shield-checkmark-outline',
  vehicle_annual_test_expiry: 'construct-outline',
  vehicle_safety_officer_approval_expiry: 'ribbon-outline',
  vehicle_tachograph_calibration_expiry: 'speedometer-outline',
  vehicle_brakes_semiannual_expiry: 'disc-outline',
  vehicle_brakes_annual_expiry: 'disc-outline',
  vehicle_winter_inspection_expiry: 'snow-outline',
  vehicle_child_detection_expiry: 'happy-outline',
  vehicle_service_due: 'build-outline',
  driver_meeting_due: 'people-outline',
  signature_request_assigned: 'create-outline',
  vehicle_assignment: 'car-sport-outline',
  driver_profile_updated_by_manager: 'person-outline',
  license_update_requested: 'id-card-outline',
  license_update_reviewed: 'id-card-outline',
  signature_request_completed: 'checkmark-done-outline',
  driver_license_expiry: 'id-card-outline',
  company_carrier_license_expiry: 'business-outline',
  vehicle_odometer_stale: 'speedometer-outline',
};

type SettingsGroup = NotificationGroup;

const shortLabel = (label: string) => label.replace(/^תוקף /, '');

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
  initialSection = 'feed',
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
  initialSection?: Section;
}) {
  const [section, setSection] = useState<Section>(initialSection);
  const [filter, setFilter] = useState<Filter>('all');
  const [undo, setUndo] = useState<{ type: NotificationType; label: string } | null>(null);
  const [flash, setFlash] = useState<{ type: NotificationType; nonce: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRefs = useRef<Partial<Record<NotificationType, View | null>>>({});
  const reduceMotion = prefersReducedMotion();

  useEffect(() => setSection(initialSection), [initialSection]);
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const typeInfo = useMemo(() => new Map(prefs.visibleTypes.map((t) => [t.type, t])), [prefs.visibleTypes]);
  const canEditLeads = !prefs.isDriver && !!prefs.leads;
  const enabledCount = prefs.visibleTypes.filter((t) => prefs.prefs?.[t.type] ?? true).length;

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: items.length, unread: unreadIds.size, vehicles: 0, drivers: 0, signing: 0 };
    for (const n of items) {
      const category = categoryOf(n.notification_type);
      if (category) result[category] += 1;
    }
    return result;
  }, [items, unreadIds]);

  const urgency = useMemo(() => {
    let critical = 0;
    let warning = 0;
    for (const item of items) {
      if (!unreadIds.has(item.id)) continue;
      const tone = notificationTone(item);
      if (tone === 'bad') critical += 1;
      if (tone === 'warn') warning += 1;
    }
    return { critical, warning };
  }, [items, unreadIds]);

  const visible = useMemo(
    () => items.filter((n) => (filter === 'all' ? true : filter === 'unread' ? unreadIds.has(n.id) : categoryOf(n.notification_type) === filter)),
    [items, filter, unreadIds]
  );

  const groups = useMemo(() => {
    const now = new Date();
    const byDay = new Map<string, Notification[]>();
    for (const n of visible) {
      const key = dayGroupOf(n.created_at, now);
      byDay.set(key, [...(byDay.get(key) ?? []), n]);
    }
    return Array.from(byDay.entries()).map(([key, groupedItems]) => ({ key, items: groupedItems }));
  }, [visible]);

  /** Brings a type's card into view and lights it up briefly. */
  const revealCard = (type: NotificationType) => {
    setFlash((prev) => ({ type, nonce: (prev?.nonce ?? 0) + 1 }));
    // The settings view may be mounting right now; give it a frame to lay out.
    setTimeout(() => {
      const node = cardRefs.current[type] as unknown as { scrollIntoView?: (options: object) => void } | null;
      node?.scrollIntoView?.({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    }, 60);
  };

  const openSettingsFor = (type: NotificationType) => {
    setSection('settings');
    revealCard(type);
  };

  const mute = async (type: NotificationType) => {
    const info = typeInfo.get(type);
    if (!info) return;
    const saved = await prefs.toggle(type, false);
    if (!saved) return;
    setUndo({ type, label: shortLabel(info.label) });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  };

  const undoMute = async () => {
    if (!undo) return;
    const { type } = undo;
    setUndo(null);
    await prefs.toggle(type, true);
  };

  const chips: Filter[] = (['all', 'unread', 'vehicles', 'drivers', 'signing'] as Filter[]).filter(
    (key) => key === 'all' || key === 'unread' || counts[key] > 0
  );

  const subtitle =
    section === 'settings'
      ? prefs.isDriver
        ? 'בחר אילו עדכונים יגיעו אליך'
        : 'מה יגיע אליך, ומתי כל התראה יוצאת'
      : loading
        ? 'טוען עדכונים…'
        : unreadIds.size > 0
          ? `${unreadIds.size} ${unreadIds.size === 1 ? 'התראה חדשה' : 'התראות חדשות'}`
          : items.length > 0
            ? 'קראת את כל העדכונים'
            : 'כל העדכונים מהצי במקום אחד';

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Title on the right, the view switch on the left. */}
        <View style={styles.header}>
          <View style={styles.headingCopy}>
            <DText weight="bold" style={styles.title} accessibilityRole="header">התראות</DText>
            <DText style={styles.subtitle}>{subtitle}</DText>
          </View>
          <View style={styles.grow} />
          <SectionSwitch
            section={section}
            unread={unreadIds.size}
            settingsHint={prefs.loading || prefs.error ? null : `${enabledCount}/${prefs.visibleTypes.length}`}
            onChange={setSection}
          />
        </View>

        {section === 'feed' ? (
          <View key="feed" style={[styles.pane, !reduceMotion && styles.fadeIn]}>
            {items.length > 0 && !loading && !error && (
              <View style={styles.toolbar}>
                <View style={styles.segment} accessibilityRole="tablist">
                  {chips.map((key) => {
                    const active = filter === key;
                    const count = key === 'all' ? items.length : counts[key];
                    return (
                      <HoverPressable
                        key={key}
                        style={[styles.segmentItem, active && styles.segmentItemActive]}
                        hoverStyle={active ? undefined : styles.segmentItemHover}
                        onPress={() => setFilter(key)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${FILTER_LABEL[key]}, ${count}`}
                      >
                        <DText weight="semiBold" style={[styles.segmentText, active && styles.segmentTextActive]}>{FILTER_LABEL[key]}</DText>
                        <DText weight="semiBold" style={[styles.segmentCount, active && styles.segmentCountActive]}>{count}</DText>
                      </HoverPressable>
                    );
                  })}
                </View>
                <View style={styles.grow} />
                {(urgency.critical > 0 || urgency.warning > 0) && (
                  <View style={styles.urgency}>
                    {urgency.critical > 0 && (
                      <View style={styles.urgencyItem}>
                        <View style={[styles.urgencyDot, { backgroundColor: DESKTOP_TONES.bad.fg }]} />
                        <DText weight="semiBold" style={styles.urgencyText}>{`${urgency.critical} דחופות`}</DText>
                      </View>
                    )}
                    {urgency.warning > 0 && (
                      <View style={styles.urgencyItem}>
                        <View style={[styles.urgencyDot, { backgroundColor: DESKTOP_TONES.warn.fg }]} />
                        <DText weight="semiBold" style={styles.urgencyText}>{`${urgency.warning} לתשומת לב`}</DText>
                      </View>
                    )}
                  </View>
                )}
                {unreadIds.size > 0 && (
                  <HoverPressable
                    style={styles.ghostButton}
                    hoverStyle={styles.ghostButtonHover}
                    pressMotionStyle={styles.pressDown}
                    onPress={onMarkAllRead}
                    accessibilityLabel="סימון כל ההתראות כנקראו"
                  >
                    <Ionicons name="checkmark-done" size={18} color={DESKTOP_COLORS.brand} />
                    <DText weight="semiBold" style={styles.ghostButtonText}>סימון הכול כנקרא</DText>
                  </HoverPressable>
                )}
              </View>
            )}

            {loading ? (
              <View style={styles.state}><BrandLoader color={DESKTOP_COLORS.brand} /></View>
            ) : error ? (
              <StateCard icon="cloud-offline-outline" title="לא ניתן לטעון את ההתראות" hint={error} action={{ label: 'נסה שוב', onPress: onRetry }} />
            ) : items.length === 0 ? (
              <StateCard
                icon="notifications-outline"
                title="אין עדיין התראות"
                hint="עדכונים יופיעו כאן ברגע שיקרו. בינתיים אפשר לבחור מה יגיע אליך."
                action={{ label: 'להגדרות ההתראות', onPress: () => setSection('settings') }}
              />
            ) : visible.length === 0 ? (
              <StateCard icon="checkmark-done-outline" title={filter === 'unread' ? 'אין התראות שלא נקראו' : 'אין התראות בסינון הזה'} />
            ) : (
              <View key={filter} style={[styles.days, !reduceMotion && styles.fadeIn]}>
                {groups.map((group) => (
                  <View key={group.key} style={styles.day}>
                    <DText weight="bold" style={styles.dayTitle} accessibilityRole="header">{group.key}</DText>
                    <View style={styles.list}>
                      {group.items.map((n, index) => (
                        <FeedRow
                          key={n.id}
                          n={n}
                          first={index === 0}
                          unread={unreadIds.has(n.id)}
                          index={index}
                          reduceMotion={reduceMotion}
                          icon={iconFor(n.notification_type)}
                          timeAgo={timeAgo(n.created_at)}
                          action={actionLabel(n)}
                          typeInfo={typeInfo}
                          muted={!!n.notification_type && prefs.prefs?.[n.notification_type as NotificationType] === false}
                          muting={prefs.savingType === n.notification_type}
                          showLead={canEditLeads}
                          onOpen={onOpen}
                          onMute={(type) => void mute(type)}
                          onLead={openSettingsFor}
                        />
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View key="settings" style={[styles.pane, !reduceMotion && styles.fadeIn]}>
            {prefs.loading ? (
              <View style={styles.state}><BrandLoader color={DESKTOP_COLORS.brand} /></View>
            ) : prefs.error ? (
              <StateCard icon="cloud-offline-outline" title="לא ניתן לטעון את ההגדרות" hint={prefs.error} action={{ label: 'נסה שוב', onPress: prefs.load }} />
            ) : (
              <>
                {canEditLeads && <LeadTimeline prefs={prefs} onPick={revealCard} reduceMotion={reduceMotion} />}
                {notificationGroups(prefs.visibleTypes, prefs.isDriver, prefs.isOwner).map((group) => (
                  <SettingsSection
                    key={group.key}
                    group={group}
                    prefs={prefs}
                    canEditLeads={canEditLeads}
                    flash={flash}
                    reduceMotion={reduceMotion}
                    registerCard={(type, node) => { cardRefs.current[type] = node; }}
                  />
                ))}
                <View style={styles.note}>
                  <Ionicons name="checkmark-circle-outline" size={17} color={DESKTOP_COLORS.inkFaint} />
                  <DText style={styles.noteText}>
                    {prefs.isDriver
                      ? 'כל שינוי נשמר מיד ומשפיע רק עליך.'
                      : 'כל שינוי נשמר מיד. ההפעלה והכיבוי הם עבורך בלבד; מועדי ההתראה חלים על כל החברה.'}
                  </DText>
                </View>
              </>
            )}
          </View>
        )}
      </ScrollView>

      {undo && (
        <View style={styles.toastWrap} pointerEvents="box-none">
          <View style={[styles.toast, !reduceMotion && styles.toastIn]} accessibilityLiveRegion="polite">
            <Ionicons name="notifications-off" size={17} color="#FFFFFF" />
            <DText style={styles.toastText} numberOfLines={1}>{`השתקת את "${undo.label}"`}</DText>
            <HoverPressable style={styles.toastButton} hoverStyle={styles.toastButtonHover} onPress={() => void undoMute()}>
              <DText weight="bold" style={styles.toastButtonText}>ביטול</DText>
            </HoverPressable>
          </View>
        </View>
      )}
    </View>
  );
}

/** The two views, as one pill switch — the same shape as the dashboard's drivers/vehicles switch. */
function SectionSwitch({
  section,
  unread,
  settingsHint,
  onChange,
}: {
  section: Section;
  unread: number;
  settingsHint: string | null;
  onChange: (section: Section) => void;
}) {
  const options: { key: Section; label: string; icon: IconName; badge: string | null; hot: boolean }[] = [
    { key: 'feed', label: 'עדכונים', icon: 'notifications-outline', badge: unread > 0 ? String(unread) : null, hot: unread > 0 },
    { key: 'settings', label: 'הגדרות התראה', icon: 'options-outline', badge: settingsHint, hot: false },
  ];
  return (
    <View style={styles.switch} accessibilityRole="tablist">
      {options.map((option) => {
        const active = section === option.key;
        return (
          <HoverPressable
            key={option.key}
            style={[styles.switchItem, active && styles.switchItemActive]}
            hoverStyle={active ? undefined : styles.switchItemHover}
            onPress={() => onChange(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
          >
            <Ionicons name={option.icon} size={18} color={active ? '#FFFFFF' : DESKTOP_COLORS.inkMuted} />
            <DText weight="semiBold" style={[styles.switchText, active && styles.switchTextActive]}>{option.label}</DText>
            {!!option.badge && (
              <View style={[styles.switchBadge, active && styles.switchBadgeActive, option.hot && !active && styles.switchBadgeHot]}>
                <DText weight="bold" style={[styles.switchBadgeText, (active || option.hot) && styles.switchBadgeTextOn]}>{option.badge}</DText>
              </View>
            )}
          </HoverPressable>
        );
      })}
    </View>
  );
}

function FeedRow({
  n,
  first,
  unread,
  index,
  reduceMotion,
  icon,
  timeAgo,
  action,
  typeInfo,
  muted,
  muting,
  showLead,
  onOpen,
  onMute,
  onLead,
}: {
  n: Notification;
  first: boolean;
  unread: boolean;
  index: number;
  reduceMotion: boolean;
  icon: IconName;
  timeAgo: string;
  action: string | null;
  typeInfo: Map<NotificationType, NotificationTypeInfo>;
  muted: boolean;
  muting: boolean;
  showLead: boolean;
  onOpen: (n: Notification) => void;
  onMute: (type: NotificationType) => void;
  onLead: (type: NotificationType) => void;
}) {
  const tone = notificationTone(n);
  const colors = tone === 'brand' ? { bg: '#E6F2F9', fg: DESKTOP_COLORS.brand } : DESKTOP_TONES[tone];
  const type = n.notification_type as NotificationType | null;
  const info = type ? typeInfo.get(type) : undefined;
  const category = categoryOf(n.notification_type);
  const canMute = !!info && !muted;
  const hasLead = showLead && !!type && !!LEAD_RULES[type] && !!info;

  return (
    <View
      style={[
        styles.rowWrap,
        !first && styles.rowDivider,
        !reduceMotion && styles.rowEnter,
        !reduceMotion && webOnly({ animationDelay: `${Math.min(index, 6) * 35}ms` }),
      ]}
    >
      <HoverPressable
        style={[styles.row, unread && styles.rowUnread]}
        hoverStyle={styles.rowHover}
        onPress={() => onOpen(n)}
        accessibilityLabel={`${unread ? 'חדש. ' : ''}${n.message}. ${timeAgo}${action ? `. ${action}` : ''}`}
      >
        {unread && <View pointerEvents="none" style={styles.unreadEdge} />}
        <View style={[styles.rowIcon, { backgroundColor: colors.bg }]}>
          <Ionicons name={icon} size={20} color={colors.fg} />
        </View>
        <View style={styles.rowText}>
          <DText weight={unread ? 'semiBold' : 'regular'} style={[styles.message, !unread && styles.messageRead]} numberOfLines={2}>
            {n.message}
          </DText>
          <View style={styles.meta}>
            {!!category && <DText weight="semiBold" style={[styles.metaTag, { color: colors.fg }]}>{FILTER_LABEL[category]}</DText>}
            {!!category && <View style={styles.metaDot} />}
            <DText style={styles.metaText}>{timeAgo}</DText>
            {!!action && <View style={styles.metaDot} />}
            {!!action && <DText weight="semiBold" style={styles.metaAction}>{action}</DText>}
            {!!action && <Ionicons name="arrow-back" size={13} color={DESKTOP_COLORS.brand} />}
          </View>
        </View>
        {/* Room for the action buttons, which sit over the row as siblings (a button may not hold a button). */}
        <View style={styles.rowActionSpace} />
      </HoverPressable>
      <View style={styles.rowActions} pointerEvents="box-none">
        {hasLead && (
          <IconAction icon="time-outline" label={`מועד ההתראה של ${shortLabel(info!.label)}`} onPress={() => onLead(type!)} />
        )}
        {canMute && (
          <IconAction
            icon="notifications-off-outline"
            label={`השתקת ${shortLabel(info!.label)}`}
            disabled={muting}
            onPress={() => onMute(type!)}
          />
        )}
      </View>
    </View>
  );
}

/** A quiet square icon button that names itself on hover. */
function IconAction({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <View style={styles.iconActionWrap}>
      <HoverPressable
        style={styles.iconAction}
        hoverStyle={styles.iconActionHover}
        pressMotionStyle={styles.pressDown}
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        onPress={onPress}
        disabled={disabled}
        accessibilityLabel={label}
      >
        <Ionicons name={icon} size={18} color={hover ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkFaint} />
      </HoverPressable>
      {hover && (
        <View pointerEvents="none" style={styles.tip}>
          <DText weight="semiBold" style={styles.tipText} numberOfLines={1}>{label}</DText>
        </View>
      )}
    </View>
  );
}

function StateCard({ icon, title, hint, action }: { icon: IconName; title: string; hint?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.stateCard}>
      <View style={styles.stateIcon}><Ionicons name={icon} size={30} color={DESKTOP_COLORS.brand} /></View>
      <DText weight="bold" style={styles.stateTitle}>{title}</DText>
      {!!hint && <DText style={styles.stateHint}>{hint}</DText>}
      {!!action && (
        <HoverPressable style={styles.ghostButton} hoverStyle={styles.ghostButtonHover} pressMotionStyle={styles.pressDown} onPress={action.onPress}>
          <DText weight="semiBold" style={styles.ghostButtonText}>{action.label}</DText>
        </HoverPressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const AXIS_MAX = 90;
const AXIS_TICKS = [90, 60, 30, 14, 7, 0];
const LANE_HEIGHT = 34;

/**
 * When each vehicle alert goes out, on one line: the far right is 90 days
 * ahead, the far left is the day it expires. Close labels stack in lanes.
 * Clicking one brings its card into view.
 */
const TIMELINE_LABEL: Partial<Record<NotificationType, string>> = {
  driver_meeting_due: 'מפגש עם נהג',
  driver_license_expiry: 'רישיון נהיגה',
  company_carrier_license_expiry: 'רישיון מוביל',
};

function LeadTimeline({ prefs, onPick, reduceMotion }: { prefs: NotificationPreferencesState; onPick: (type: NotificationType) => void; reduceMotion: boolean }) {
  const [width, setWidth] = useState(0);
  const [openDays, setOpenDays] = useState<number | null>(null);
  const leads = prefs.leads!;

  // Types that share a lead time share one marker.
  const byDays = new Map<number, { type: NotificationType; label: string; on: boolean; meeting: boolean }[]>();
  for (const t of prefs.visibleTypes) {
    if (LEAD_RULES[t.type]?.unit !== 'days') continue;
    const days = leads.values[t.type] ?? 0;
    const entry = { type: t.type, label: TIMELINE_LABEL[t.type] ?? shortLabel(t.label), on: prefs.prefs?.[t.type] ?? true, meeting: t.type === 'driver_meeting_due' };
    byDays.set(days, [...(byDays.get(days) ?? []), entry]);
  }
  const clusters = Array.from(byDays.entries())
    .map(([days, members]) => ({
      days,
      members,
      label: members.length === 1 ? members[0].label : `${members.length} התראות`,
      on: members.some((m) => m.on),
      meeting: members.every((m) => m.meeting),
    }))
    .sort((a, b) => b.days - a.days);

  // Greedy lanes, placed from the right (furthest ahead) leftwards: a label goes in
  // the first lane whose leftmost label it doesn't touch.
  const LABEL_PX = 128;
  const laneEnds: number[] = [];
  const placed = clusters.map((c) => {
    const x = width > 0 ? (Math.min(c.days, AXIS_MAX) / AXIS_MAX) * width : 0; // from the left edge (the expiry day)
    let lane = laneEnds.findIndex((end) => end - x >= LABEL_PX);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(x);
    } else {
      laneEnds[lane] = x;
    }
    return { ...c, x, lane };
  });
  const lanes = Math.max(1, laneEnds.length);
  const trackHeight = lanes * LANE_HEIGHT + 18;
  const open = clusters.find((c) => c.days === openDays && c.members.length > 1) ?? null;
  const service = leads.values.vehicle_service_due;
  const serviceRule = LEAD_RULES.vehicle_service_due!;

  const pick = (c: (typeof clusters)[number]) => {
    if (c.members.length === 1) onPick(c.members[0].type);
    else setOpenDays((d) => (d === c.days ? null : c.days));
  };

  return (
    <View style={styles.timeline}>
      <View style={styles.timelineHead}>
        <View style={styles.headingCopy}>
          <DText weight="bold" style={styles.timelineTitle}>ציר ההתראות</DText>
          <DText style={styles.timelineSubtitle}>כמה ימים לפני שהתוקף פג יוצאת כל התראה. לחיצה על תווית פותחת את ההגדרה שלה.</DText>
        </View>
        <View style={styles.grow} />
        {!leads.perType && (
          <View style={styles.timelineBadge}>
            <DText weight="semiBold" style={styles.timelineBadgeText}>מועד משותף לכל התיקיות</DText>
          </View>
        )}
        {service != null && (
          <HoverPressable style={styles.timelineChip} hoverStyle={styles.timelineChipHover} onPress={() => onPick('vehicle_service_due')} accessibilityLabel="מועד התראת טיפול">
            <Ionicons name="build-outline" size={15} color="#BFE6FA" />
            <DText weight="semiBold" style={styles.timelineChipText}>{`טיפול: ${leadPhrase(service, serviceRule)}`}</DText>
          </HoverPressable>
        )}
      </View>

      <View style={styles.axisArea} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={{ height: trackHeight }}>
          {width > 0 &&
            placed.map((c, i) => {
              const top = (lanes - 1 - c.lane) * LANE_HEIGHT;
              const selected = open?.days === c.days;
              return (
                <View key={c.days} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
                  {/* The stem from the label down to the axis. */}
                  <View pointerEvents="none" style={[styles.stem, { left: c.x - 0.5, top: top + 28, height: trackHeight - top - 28 + 3 }, !c.on && styles.stemOff]} />
                  <HoverPressable
                    style={[
                      styles.marker,
                      c.meeting && styles.markerMeeting,
                      !c.on && styles.markerOff,
                      selected && styles.markerSelected,
                      { top, ...(c.x > width - LABEL_PX / 2 ? { right: 0 } : c.x < LABEL_PX / 2 ? { left: 0 } : { left: c.x - LABEL_PX / 2 }) },
                      !reduceMotion && styles.markerIn,
                      !reduceMotion && webOnly({ animationDelay: `${i * 30}ms` }),
                    ]}
                    hoverStyle={styles.markerHover}
                    onPress={() => pick(c)}
                    accessibilityLabel={`${c.members.map((m) => m.label).join(', ')}: ${c.days} ימים לפני`}
                    accessibilityState={c.members.length > 1 ? { expanded: selected } : undefined}
                  >
                    <DText weight="semiBold" style={[styles.markerText, !c.on && styles.markerTextOff]} numberOfLines={1}>{c.label}</DText>
                    <DText weight="bold" style={[styles.markerDays, !c.on && styles.markerTextOff]}>{c.days}</DText>
                  </HoverPressable>
                </View>
              );
            })}
        </View>
        <View style={styles.axis}>
          <View style={styles.axisFill} />
          {width > 0 &&
            placed.map((c) => (
              <View key={c.days} pointerEvents="none" style={[styles.axisDot, c.meeting && styles.axisDotMeeting, !c.on && styles.axisDotOff, { left: c.x - 5 }]} />
            ))}
        </View>
        <View style={styles.ticks}>
          {width > 0 &&
            AXIS_TICKS.map((tick) => (
              <DText
                key={tick}
                weight={tick === 0 ? 'bold' : 'semiBold'}
                style={[styles.tick, tick === 0 && styles.tickEnd, { left: Math.min(width - 72, Math.max(0, (tick / AXIS_MAX) * width - 36)) }]}
              >
                {tick === 0 ? 'יום התפוגה' : `${tick} יום`}
              </DText>
            ))}
        </View>
      </View>

      {open && (
        <View style={[styles.clusterRow, !reduceMotion && styles.fadeIn]}>
          <DText weight="semiBold" style={styles.clusterTitle}>{`${open.days} ימים לפני:`}</DText>
          {open.members.map((m) => (
            <HoverPressable key={m.type} style={[styles.clusterChip, !m.on && styles.markerOff]} hoverStyle={styles.timelineChipHover} onPress={() => onPick(m.type)}>
              <DText weight="semiBold" style={[styles.timelineChipText, !m.on && styles.markerTextOff]}>{m.label}</DText>
            </HoverPressable>
          ))}
        </View>
      )}
    </View>
  );
}

function SettingsSection({
  group,
  prefs,
  canEditLeads,
  flash,
  reduceMotion,
  registerCard,
}: {
  group: SettingsGroup;
  prefs: NotificationPreferencesState;
  canEditLeads: boolean;
  flash: { type: NotificationType; nonce: number } | null;
  reduceMotion: boolean;
  registerCard: (type: NotificationType, node: View | null) => void;
}) {
  const [width, setWidth] = useState(0);
  const on = group.items.filter((t) => prefs.prefs?.[t.type] ?? true).length;
  const minCard = group.compact ? 300 : 380;
  const gap = 14;
  const columns = width > 0 ? Math.max(1, Math.min(group.items.length, Math.floor((width + gap) / (minCard + gap)))) : 1;
  const cardWidth = width > 0 ? (width - gap * (columns - 1)) / columns : undefined;
  const folderLeads = group.key === 'folders' && canEditLeads;
  const allOn = on === group.items.length;

  const setAll = async (days: number) => {
    if (!prefs.leads) return;
    if (!prefs.leads.perType) {
      await prefs.setLead(group.items[0].type, days);
      return;
    }
    for (const item of group.items) {
      if (!(await prefs.setLead(item.type, days))) return;
    }
  };

  const toggleAll = async () => {
    const next = !allOn;
    for (const item of group.items) {
      if ((prefs.prefs?.[item.type] ?? true) !== next && !(await prefs.toggle(item.type, next))) return;
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.headingCopy}>
          <View style={styles.sectionTitleLine}>
            <DText weight="bold" style={styles.sectionTitle} accessibilityRole="header">{group.title}</DText>
            <View style={styles.sectionCount}>
              <DText weight="bold" style={styles.sectionCountText}>{`${on}/${group.items.length}`}</DText>
            </View>
          </View>
          {!!group.subtitle && <DText style={styles.sectionSubtitle}>{group.subtitle}</DText>}
        </View>
        <View style={styles.grow} />
        {folderLeads && (
          <View style={styles.bulk}>
            <DText weight="semiBold" style={styles.bulkLabel}>לכל התיקיות:</DText>
            {LEAD_RULES.vehicle_license_expiry!.presets.map((days) => (
              <HoverPressable
                key={days}
                style={styles.bulkChip}
                hoverStyle={styles.bulkChipHover}
                pressMotionStyle={styles.pressDown}
                onPress={() => void setAll(days)}
                disabled={prefs.savingLeadType != null}
                accessibilityLabel={`${days} ימים לפני, לכל התיקיות`}
              >
                <DText weight="semiBold" style={styles.bulkChipText}>{`${days} ימים`}</DText>
              </HoverPressable>
            ))}
          </View>
        )}
        {group.items.length > 2 && (
          <HoverPressable style={styles.linkButton} hoverStyle={styles.linkButtonHover} onPress={() => void toggleAll()} disabled={prefs.savingType != null}>
            <DText weight="semiBold" style={styles.linkButtonText}>{allOn ? 'כיבוי הכול' : 'הפעלת הכול'}</DText>
          </HoverPressable>
        )}
      </View>

      <View style={styles.cards} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {group.items.map((item) => (
          <TypeCard
            key={item.type}
            item={item}
            compact={!!group.compact}
            width={cardWidth}
            prefs={prefs}
            canEditLeads={canEditLeads}
            flashNonce={flash?.type === item.type ? flash.nonce : null}
            reduceMotion={reduceMotion}
            registerCard={registerCard}
          />
        ))}
      </View>
    </View>
  );
}

function TypeCard({
  item,
  compact,
  width,
  prefs,
  canEditLeads,
  flashNonce,
  reduceMotion,
  registerCard,
}: {
  item: NotificationTypeInfo;
  compact: boolean;
  width: number | undefined;
  prefs: NotificationPreferencesState;
  canEditLeads: boolean;
  flashNonce: number | null;
  reduceMotion: boolean;
  registerCard: (type: NotificationType, node: View | null) => void;
}) {
  const value = prefs.prefs?.[item.type] ?? true;
  const rule = LEAD_RULES[item.type];
  const leadValue = prefs.leads?.values[item.type];
  const leadEditable = canEditLeads && !!rule && leadValue != null && (prefs.leads!.perType || isVehicleFolderNotification(item.type));
  const label = compact ? shortLabel(item.label) : item.label;

  return (
    <View
      ref={(node) => registerCard(item.type, node)}
      style={[styles.card, width != null && { width }, !value && styles.cardOff]}
    >
      {flashNonce != null && <View key={flashNonce} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.cardFlash]} />}
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, !value && styles.cardIconOff]}>
          <Ionicons name={TYPE_ICON[item.type] ?? 'notifications-outline'} size={20} color={value ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkFaint} />
        </View>
        <View style={styles.cardCopy}>
          <DText weight="bold" style={[styles.cardTitle, !value && styles.cardTitleOff]} numberOfLines={1}>{label}</DText>
          {!compact && !!item.description && <DText style={styles.cardDescription} numberOfLines={3}>{item.description}</DText>}
          {compact && !leadEditable && leadValue != null && rule && (
            <DText style={styles.cardDescription}>{leadPhrase(leadValue, rule)}{rule.unit === 'days' ? ', ושוב ביום עצמו' : ''}</DText>
          )}
        </View>
        <LiquidGlassSwitch
          value={value}
          onValueChange={(next) => void prefs.toggle(item.type, next)}
          disabled={prefs.savingType === item.type}
          accessibilityLabel={item.label}
          tint={DESKTOP_COLORS.brand}
          reduceMotion={reduceMotion}
        />
      </View>
      {leadEditable && (
        <LeadControl
          type={item.type}
          label={label}
          rule={rule!}
          value={leadValue!}
          saving={prefs.savingLeadType === item.type}
          dimmed={!value}
          onCommit={(next) => prefs.setLead(item.type, next)}
        />
      )}
    </View>
  );
}

/**
 * One type's lead time: − value + with the unit in words, and a few presets.
 * Steps and typing settle for a moment before saving, so a run of clicks is one save.
 */
function LeadControl({
  type,
  label,
  rule,
  value,
  saving,
  dimmed,
  onCommit,
}: {
  type: NotificationType;
  label: string;
  rule: LeadRule;
  value: number;
  saving: boolean;
  dimmed: boolean;
  onCommit: (value: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (!focused && !timer.current) setDraft(String(value)); }, [value, focused]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const clamp = (n: number) => Math.max(rule.min, Math.min(rule.max, Math.round(n / rule.step) * rule.step));

  const commit = (raw: string) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const n = Number(raw);
    if (!raw || !Number.isFinite(n)) { setDraft(String(value)); return; }
    const next = clamp(n);
    setDraft(String(next));
    if (next !== value) void onCommit(next);
  };

  const schedule = (raw: string) => {
    setDraft(raw);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(raw), 700);
  };

  const current = Number(draft) || value;
  const step = (dir: 1 | -1) => schedule(String(clamp(current + dir * rule.step)));
  const unitWord = leadUnitWord(current, rule);
  const stepLabels = leadStepLabels(rule);

  return (
    <View style={[styles.lead, dimmed && styles.leadDimmed]}>
      <View style={styles.leadRow}>
        <Ionicons name="time-outline" size={16} color={DESKTOP_COLORS.inkMuted} />
        <DText weight="semiBold" style={styles.leadLabel}>התראה</DText>
        <View style={styles.stepper}>
          <HoverPressable
            style={styles.stepBtn}
            hoverStyle={styles.stepBtnHover}
            pressMotionStyle={styles.pressDown}
            onPress={() => step(1)}
            disabled={current >= rule.max}
            accessibilityLabel={`${label}: ${stepLabels.up}`}
          >
            <Ionicons name="add" size={17} color={current >= rule.max ? DESKTOP_COLORS.inkFaint : DESKTOP_COLORS.brand} />
          </HoverPressable>
          <TextInput
            value={draft}
            onChangeText={(v) => schedule(v.replace(/\D/g, '').slice(0, rule.unit === 'km' ? 4 : 2))}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); commit(draft); }}
            onSubmitEditing={() => commit(draft)}
            keyboardType="number-pad"
            accessibilityLabel={`${label}: ${unitWord}`}
            style={[styles.stepInput, rule.unit === 'km' && styles.stepInputWide]}
            selectTextOnFocus
          />
          <HoverPressable
            style={styles.stepBtn}
            hoverStyle={styles.stepBtnHover}
            pressMotionStyle={styles.pressDown}
            onPress={() => step(-1)}
            disabled={current <= rule.min}
            accessibilityLabel={`${label}: ${stepLabels.down}`}
          >
            <Ionicons name="remove" size={17} color={current <= rule.min ? DESKTOP_COLORS.inkFaint : DESKTOP_COLORS.brand} />
          </HoverPressable>
        </View>
        <DText style={styles.leadUnit} numberOfLines={1}>{unitWord}</DText>
        <View style={styles.grow} />
        {saving && <BrandLoader size={14} color={DESKTOP_COLORS.brand} />}
      </View>
      <View style={styles.presets}>
        {rule.presets.map((preset) => {
          const active = current === preset;
          return (
            <HoverPressable
              key={`${type}-${preset}`}
              style={[styles.preset, active && styles.presetActive]}
              hoverStyle={active ? undefined : styles.presetHover}
              pressMotionStyle={styles.pressDown}
              onPress={() => commit(String(preset))}
              accessibilityLabel={`${label}: ${leadPhrase(preset, rule)}`}
              accessibilityState={{ selected: active }}
            >
              <DText weight="semiBold" style={[styles.presetText, active && styles.presetTextActive]}>
                {rule.unit === 'km' ? preset.toLocaleString('he-IL') : preset}
              </DText>
            </HoverPressable>
          );
        })}
      </View>
    </View>
  );
}

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const BRAND_SOFT = '#E6F2F9';
const NAVY = '#102536';

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 32, paddingTop: 26, paddingBottom: 96, maxWidth: 1280, width: '100%', alignSelf: 'center', gap: 22 },
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  headingCopy: { gap: 3, flexShrink: 1 },
  pressDown: { transform: [{ scale: 0.97 }] },
  fadeIn: webOnly({
    animationKeyframes: { from: { opacity: 0, transform: [{ translateY: 6 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } },
    animationDuration: '220ms',
    animationTimingFunction: EASE_OUT,
  }),

  // Header
  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: 16 },
  title: { fontSize: 32, lineHeight: 40, letterSpacing: -0.8, color: DESKTOP_COLORS.ink },
  subtitle: { fontSize: 15, color: DESKTOP_COLORS.inkMuted },
  switch: {
    flexDirection: 'row-reverse',
    padding: 4,
    gap: 4,
    borderRadius: 16,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    ...webOnly({ boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }),
  },
  switchItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 12,
    ...webOnly({ transition: `background-color 180ms ${EASE_OUT}` }),
  },
  switchItemHover: { backgroundColor: DESKTOP_COLORS.surfaceMuted },
  switchItemActive: { backgroundColor: DESKTOP_COLORS.brand, ...webOnly({ boxShadow: '0 6px 16px rgba(0,117,179,0.28)' }) },
  switchText: { fontSize: 15, color: DESKTOP_COLORS.inkMuted },
  switchTextActive: { color: '#FFFFFF' },
  switchBadge: { minWidth: 24, height: 22, paddingHorizontal: 7, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF0F2' },
  switchBadgeActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  switchBadgeHot: { backgroundColor: DESKTOP_COLORS.danger },
  switchBadgeText: { fontSize: 12, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  switchBadgeTextOn: { color: '#FFFFFF' },

  pane: { gap: 22 },

  // Feed toolbar
  toolbar: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  segment: { flexDirection: 'row-reverse', gap: 6, flexWrap: 'wrap' },
  segmentItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    backgroundColor: DESKTOP_COLORS.surface,
    ...webOnly({ transition: `background-color 160ms ${EASE_OUT}, border-color 160ms ${EASE_OUT}` }),
  },
  segmentItemHover: { backgroundColor: DESKTOP_COLORS.surfaceMuted, borderColor: '#CFD7DE' },
  segmentItemActive: { backgroundColor: NAVY, borderColor: NAVY },
  segmentText: { fontSize: 14.5, color: DESKTOP_COLORS.ink },
  segmentTextActive: { color: '#FFFFFF' },
  segmentCount: { fontSize: 13, color: DESKTOP_COLORS.inkFaint, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  segmentCountActive: { color: 'rgba(255,255,255,0.7)' },
  urgency: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14 },
  urgencyItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  urgencyDot: { width: 8, height: 8, borderRadius: 4 },
  urgencyText: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },
  ghostButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    backgroundColor: DESKTOP_COLORS.surface,
    ...webOnly({ transition: `background-color 160ms ${EASE_OUT}, border-color 160ms ${EASE_OUT}, transform 160ms ${EASE_OUT}` }),
  },
  ghostButtonHover: { backgroundColor: BRAND_SOFT, borderColor: 'rgba(0,117,179,0.3)' },
  ghostButtonText: { fontSize: 14.5, color: DESKTOP_COLORS.brand },

  // Feed list
  days: { gap: 26 },
  day: { gap: 10 },
  dayTitle: { fontSize: 14, color: DESKTOP_COLORS.inkMuted, paddingHorizontal: 6 },
  list: {
    borderRadius: 18,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    overflow: 'hidden',
    ...webOnly({ boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 10px 30px rgba(16,34,50,0.04)' }),
  },
  rowWrap: { position: 'relative' },
  rowDivider: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  rowEnter: webOnly({
    animationKeyframes: { from: { opacity: 0, transform: [{ translateY: 6 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } },
    animationDuration: '240ms',
    animationTimingFunction: EASE_OUT,
    animationFillMode: 'both',
  }),
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 16,
    minHeight: 84,
    paddingVertical: 16,
    paddingHorizontal: 22,
    ...webOnly({ transition: 'background-color 150ms ease' }),
  },
  rowUnread: { backgroundColor: '#F5F9FD' },
  rowHover: { backgroundColor: '#EEF5FA' },
  unreadEdge: { position: 'absolute', right: 0, top: 12, bottom: 12, width: 4, borderTopLeftRadius: 4, borderBottomLeftRadius: 4, backgroundColor: DESKTOP_COLORS.brand },
  rowIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowText: { flex: 1, minWidth: 0, gap: 6 },
  message: { fontSize: 16, lineHeight: 23, color: DESKTOP_COLORS.ink, maxWidth: 860 },
  messageRead: { color: '#394755' },
  meta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaTag: { fontSize: 13 },
  metaText: { fontSize: 13.5, color: DESKTOP_COLORS.inkFaint },
  metaAction: { fontSize: 13.5, color: DESKTOP_COLORS.brand },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#B8C1C9' },
  rowActionSpace: { width: 84, flexShrink: 0 },
  rowActions: { position: 'absolute', left: 18, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconActionWrap: { position: 'relative', alignItems: 'center' },
  iconAction: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ transition: `background-color 150ms ease, transform 160ms ${EASE_OUT}` }),
  },
  iconActionHover: { backgroundColor: BRAND_SOFT },
  tip: {
    position: 'absolute',
    bottom: 44,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    backgroundColor: NAVY,
    zIndex: 5,
    ...webOnly({ whiteSpace: 'nowrap', boxShadow: '0 8px 20px rgba(16,34,50,0.2)' }),
  },
  tipText: { fontSize: 12.5, color: '#FFFFFF' },

  // States
  state: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  stateCard: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 56,
    paddingHorizontal: 32,
    borderRadius: 20,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
  },
  stateIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: BRAND_SOFT, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stateTitle: { fontSize: 18, color: DESKTOP_COLORS.ink, textAlign: 'center' },
  stateHint: { fontSize: 15, color: DESKTOP_COLORS.inkMuted, textAlign: 'center', maxWidth: 460, marginBottom: 6 },

  // Timeline
  timeline: {
    borderRadius: 22,
    backgroundColor: NAVY,
    paddingHorizontal: 30,
    paddingTop: 24,
    paddingBottom: 22,
    gap: 22,
    overflow: 'hidden',
    ...webOnly({
      backgroundImage: 'radial-gradient(120% 140% at 100% 0%, rgba(0,136,204,0.35) 0%, rgba(16,37,54,0) 55%)',
      boxShadow: '0 18px 44px rgba(16,37,54,0.22)',
    }),
  },
  timelineHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  timelineTitle: { fontSize: 20, color: '#FFFFFF', letterSpacing: -0.3 },
  timelineSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.68)' },
  timelineBadge: { height: 30, paddingHorizontal: 12, borderRadius: 15, justifyContent: 'center', backgroundColor: 'rgba(255,178,62,0.18)' },
  timelineBadgeText: { fontSize: 13, color: '#FFD08A' },
  timelineChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    ...webOnly({ transition: 'background-color 150ms ease' }),
  },
  timelineChipHover: { backgroundColor: 'rgba(255,255,255,0.16)' },
  timelineChipText: { fontSize: 13.5, color: '#E6F4FB' },
  axisArea: { position: 'relative' },
  stem: { position: 'absolute', width: 1, backgroundColor: 'rgba(191,230,250,0.4)' },
  stemOff: { backgroundColor: 'rgba(255,255,255,0.14)' },
  marker: {
    position: 'absolute',
    width: 128,
    height: 28,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: 'rgba(0,136,204,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(95,193,240,0.45)',
    ...webOnly({ transition: `background-color 150ms ease, transform 180ms ${EASE_OUT}` }),
  },
  markerMeeting: { backgroundColor: 'rgba(255,178,62,0.22)', borderColor: 'rgba(255,178,62,0.5)' },
  markerOff: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)', borderStyle: 'dashed' },
  markerSelected: { backgroundColor: 'rgba(0,136,204,0.6)', borderColor: '#5FC1F0' },
  markerHover: { backgroundColor: 'rgba(0,136,204,0.55)', transform: [{ translateY: -1 }] },
  markerIn: webOnly({
    animationKeyframes: { from: { opacity: 0, transform: [{ translateY: 6 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } },
    animationDuration: '320ms',
    animationTimingFunction: EASE_OUT,
    animationFillMode: 'both',
  }),
  markerText: { flexShrink: 1, fontSize: 12.5, color: '#FFFFFF' },
  markerDays: { fontSize: 13, color: '#BFE6FA', ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  markerTextOff: { color: 'rgba(255,255,255,0.4)' },
  axis: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center' },
  axisFill: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    borderRadius: 3,
    ...webOnly({ backgroundImage: 'linear-gradient(to left, rgba(95,193,240,0.15), rgba(255,101,92,0.85))' }),
  },
  axisDot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#5FC1F0', borderWidth: 2, borderColor: NAVY },
  axisDotMeeting: { backgroundColor: '#FFB23E' },
  axisDotOff: { backgroundColor: 'rgba(255,255,255,0.25)' },
  ticks: { height: 20, marginTop: 8 },
  clusterRow: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  clusterTitle: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginLeft: 4 },
  clusterChip: { height: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center', backgroundColor: 'rgba(0,136,204,0.3)', borderWidth: 1, borderColor: 'rgba(95,193,240,0.4)', ...webOnly({ transition: 'background-color 150ms ease' }) },
  tick: { position: 'absolute', width: 72, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  tickEnd: { color: '#FF8A82' },

  // Settings sections
  section: { gap: 14 },
  sectionHead: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', paddingHorizontal: 4 },
  sectionTitleLine: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  sectionTitle: { fontSize: 19, color: DESKTOP_COLORS.ink, letterSpacing: -0.2 },
  sectionCount: { height: 24, paddingHorizontal: 9, borderRadius: 12, justifyContent: 'center', backgroundColor: '#EEF0F2' },
  sectionCountText: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  sectionSubtitle: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },
  bulk: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  bulkLabel: { fontSize: 13.5, color: DESKTOP_COLORS.inkMuted, marginLeft: 2 },
  bulkChip: {
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 10,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    backgroundColor: DESKTOP_COLORS.surface,
    ...webOnly({ transition: 'background-color 150ms ease, border-color 150ms ease' }),
  },
  bulkChipHover: { backgroundColor: BRAND_SOFT, borderColor: 'rgba(0,117,179,0.3)' },
  bulkChipText: { fontSize: 13, color: DESKTOP_COLORS.ink },
  linkButton: { height: 32, paddingHorizontal: 10, borderRadius: 9, justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease' }) },
  linkButtonHover: { backgroundColor: BRAND_SOFT },
  linkButtonText: { fontSize: 14, color: DESKTOP_COLORS.brand },
  cards: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14 },
  card: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    padding: 18,
    gap: 14,
    ...webOnly({
      boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
      transition: `opacity 200ms ease, border-color 200ms ease, box-shadow 200ms ${EASE_OUT}`,
    }),
  },
  cardOff: { backgroundColor: '#FAFBFC' },
  cardFlash: {
    borderRadius: 18,
    borderWidth: 2,
    borderColor: DESKTOP_COLORS.brand,
    backgroundColor: 'rgba(0,136,204,0.08)',
    opacity: 0,
    ...webOnly({ animationKeyframes: { '0%': { opacity: 1 }, '70%': { opacity: 1 }, '100%': { opacity: 0 } }, animationDuration: '1800ms', animationTimingFunction: 'ease-out' }),
  },
  cardHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  cardIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: BRAND_SOFT, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardIconOff: { backgroundColor: '#EEF0F2' },
  cardCopy: { flex: 1, minWidth: 0, gap: 3 },
  cardTitle: { fontSize: 16, color: DESKTOP_COLORS.ink },
  cardTitleOff: { color: DESKTOP_COLORS.inkMuted },
  cardDescription: { fontSize: 13.5, lineHeight: 19, color: DESKTOP_COLORS.inkMuted },

  // Lead control
  lead: { gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft, ...webOnly({ transition: 'opacity 200ms ease' }) },
  leadDimmed: { opacity: 0.5 },
  leadRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  leadLabel: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },
  leadUnit: { fontSize: 14, color: DESKTOP_COLORS.ink, flexShrink: 1 },
  stepper: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    backgroundColor: DESKTOP_COLORS.surfaceMuted,
    overflow: 'hidden',
  },
  stepBtn: { width: 32, height: 34, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease' }) },
  stepBtnHover: { backgroundColor: BRAND_SOFT },
  stepInput: {
    width: 42,
    height: 34,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: DESKTOP_FONT.bold,
    color: DESKTOP_COLORS.ink,
    backgroundColor: DESKTOP_COLORS.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    ...webOnly({ outlineStyle: 'none', fontVariantNumeric: 'tabular-nums' }),
  },
  stepInputWide: { width: 60 },
  presets: { flexDirection: 'row-reverse', gap: 6 },
  preset: {
    minWidth: 44,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DESKTOP_COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: 'transparent',
    ...webOnly({ transition: 'background-color 150ms ease, border-color 150ms ease' }),
  },
  presetHover: { backgroundColor: BRAND_SOFT },
  presetActive: { backgroundColor: BRAND_SOFT, borderColor: DESKTOP_COLORS.brand },
  presetText: { fontSize: 13, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  presetTextActive: { color: DESKTOP_COLORS.brand },

  note: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 6 },
  noteText: { fontSize: 14, color: DESKTOP_COLORS.inkFaint, flexShrink: 1 },

  // Undo toast
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 28, alignItems: 'center' },
  toast: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    height: 52,
    paddingRight: 18,
    paddingLeft: 8,
    borderRadius: 16,
    backgroundColor: NAVY,
    maxWidth: 560,
    ...webOnly({ boxShadow: '0 18px 40px rgba(16,37,54,0.32)' }),
  },
  toastIn: webOnly({
    animationKeyframes: { from: { opacity: 0, transform: [{ translateY: 14 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } },
    animationDuration: '260ms',
    animationTimingFunction: EASE_OUT,
  }),
  toastText: { fontSize: 15, color: '#FFFFFF', flexShrink: 1 },
  toastButton: { height: 38, paddingHorizontal: 14, borderRadius: 11, justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease' }) },
  toastButtonHover: { backgroundColor: 'rgba(255,255,255,0.12)' },
  toastButtonText: { fontSize: 15, color: '#7FD0F5' },
});
