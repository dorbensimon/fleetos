// דף ההתראות - תצוגת מחשב: רשימה והגדרות
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
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
  withoutValidity,
} from '../../lib/notificationPreferencesApi';
import { isVehicleFolderNotification } from '../../lib/vehicleFolderAlerts';
import { notificationTone } from '../../lib/notificationLook';
import type { NotificationPreferencesState } from '../../lib/useNotificationPreferences';
import { LiquidGlassSwitch } from '../ui/LiquidGlassSwitch';
import { DesktopSelect, DText, HoverPressable, prefersReducedMotion } from './primitives';
import { DESKTOP_COLORS, DESKTOP_FONT, DESKTOP_TONES, webOnly, DESKTOP_BRAND_SHADOW } from './desktopTheme';
import { t, dirIcon, getLocale } from '../../lib/i18n';
import { pageStyles } from './record/RecordPage';
import { useCompany } from '../../lib/CompanyContext';
import { ValidityPanel } from './ValidityPanel';
import { HeadingHelp, HelpTip } from './HelpTip';
import type { ValidityRow } from '../../lib/validityList';
import { SIGNING_LEAD_RULE, VALIDITY_MONTHS, useSigningRules, validityLabel } from '../../lib/signingRules';

/**
 * Desktop "התראות" page, in two calm views behind one switch:
 *   עדכונים — the list, one readable column grouped by day, filters on top.
 *   הגדרות  — every notification type as a card with its on/off switch and,
 *             for the timed ones, its own lead time on the same row.
 * A row's bell-off mutes that type on the spot (with "ביטול"); its clock
 * jumps to that type's card. Purely presentational: NotificationsScreen
 * owns the list, useNotificationPreferences owns the settings.
 */

type Section = 'feed' | 'validity' | 'settings';
type Filter = 'all' | 'unread' | 'vehicles' | 'drivers' | 'signing';
type IconName = keyof typeof Ionicons.glyphMap;

// שם לכל סינון
const FILTER_LABEL: Record<Filter, string> = {
  get all() { return t('common.all'); },
  get unread() { return t('notifications.unread'); },
  get vehicles() { return t('common.vehicles'); },
  get drivers() { return t('common.drivers'); },
  get signing() { return t('notifications.cat.signing'); },
};

// הקטגוריה של סוג התראה
function categoryOf(type: string | null): Filter | null {
  if (!type) return null;
  if (type.startsWith('vehicle_')) return 'vehicles';
  if (type.startsWith('driver_') || type.startsWith('license_update')) return 'drivers';
  if (type.startsWith('signature_')) return 'signing';
  return null;
}

// יום במילישניות
const DAY_MS = 86_400_000;

// קבוצת יום (היום, אתמול...)
function dayGroupOf(iso: string, now: Date): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ratio = new Date(iso).getTime();
  if (ratio >= startOfToday) return t('common.today');
  if (ratio >= startOfToday - DAY_MS) return t('time.yesterday');
  if (ratio >= startOfToday - 6 * DAY_MS) return new Intl.DateTimeFormat(getLocale(), { weekday: 'long' }).format(new Date(iso));
  return new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

// אייקון לכל סוג התראה
const TYPE_ICON: Partial<Record<NotificationType, IconName>> = {
  signature_expiry: 'hourglass-outline',
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
  vehicle_engineer_report_expiry: 'construct-outline',
  vehicle_license_annex_expiry: 'document-attach-outline',
  vehicle_custom_folder_expiry: 'folder-open-outline',
  driver_custom_folder_expiry: 'folder-open-outline',
  driver_extra_expiry: 'id-card-outline',
  traffic_report_due: 'warning-outline',
  vehicle_service_due: 'build-outline',
  driver_meeting_due: 'people-outline',
  vehicle_safety_check_due: 'shield-checkmark-outline',
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

// שם קצר בלי 'תוקף'
const shortLabel = withoutValidity;

// הדף: כותרת כחולה, רשימת ההתראות והגדרות
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
  onOpenValidity,
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
  /** Opens the vehicle or driver folder of a "תוקפים" row; absent for drivers. */
  onOpenValidity?: (row: ValidityRow) => void;
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

  const typeInfo = useMemo(() => new Map(prefs.visibleTypes.map((entry) => [entry.type, entry])), [prefs.visibleTypes]);
  const canEditLeads = !prefs.isDriver && !!prefs.leads;
  const enabledCount = prefs.visibleTypes.filter((entry) => prefs.prefs?.[entry.type] ?? true).length;

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
    section === 'validity'
      ? t('validity.subtitle')
      : section === 'settings'
      ? prefs.isDriver
        ? t('notifications.chooseUpdates')
        : t('notifications.whatAndWhen')
      : loading
        ? t('notifications.loadingUpdates')
        : unreadIds.size > 0
          ? `${unreadIds.size} ${unreadIds.size === 1 ? t('notifications.newOne') : t('notifications.newMany')}`
          : items.length > 0
            ? t('notifications.allRead')
            : t('notifications.allInOnePlace');

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* The night header shared with the other desktop pages: title on the right, the view switch on the left. */}
        <View style={[pageStyles.hero, pageStyles.heroNight, pageStyles.enter]}>
          <View style={[pageStyles.heroGlow, pageStyles.heroGlowBlue, { pointerEvents: 'none' }]} />
          <View style={[pageStyles.heroGlow, pageStyles.heroGlowCyan, { pointerEvents: 'none' }]} />
          <View style={styles.heroIcon}>
            <Ionicons name="notifications" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.headingCopy}>
            <DText weight="bold" style={[pageStyles.heroName, pageStyles.heroNameOnDark]} accessibilityRole="header">{t('notifications.title')}</DText>
            <DText style={[pageStyles.heroSubText, pageStyles.heroSubTextOnDark]}>{subtitle}</DText>
          </View>
          <View style={styles.grow} />
          <SectionSwitch
            section={section}
            unread={unreadIds.size}
            settingsHint={prefs.loading || prefs.error ? null : `${enabledCount}/${prefs.visibleTypes.length}`}
            showValidity={!!onOpenValidity}
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
                        <DText weight="semiBold" style={styles.urgencyText}>{t('notifications.urgentCount', { critical: urgency.critical })}</DText>
                      </View>
                    )}
                    {urgency.warning > 0 && (
                      <View style={styles.urgencyItem}>
                        <View style={[styles.urgencyDot, { backgroundColor: DESKTOP_TONES.warn.fg }]} />
                        <DText weight="semiBold" style={styles.urgencyText}>{t('notifications.attentionCount', { warning: urgency.warning })}</DText>
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
                    accessibilityLabel={t('notifications.markAllReadLabel')}
                  >
                    <Ionicons name="checkmark-done" size={18} color={DESKTOP_COLORS.brand} />
                    <DText weight="semiBold" style={styles.ghostButtonText}>{t('notifications.markAllReadShort')}</DText>
                  </HoverPressable>
                )}
              </View>
            )}

            {loading ? (
              <View style={styles.state}><BrandLoader color={DESKTOP_COLORS.brand} /></View>
            ) : error ? (
              <StateCard icon="cloud-offline-outline" title={t('notifications.cannotLoad')} hint={error} action={{ label: t('common.tryAgain'), onPress: onRetry }} />
            ) : items.length === 0 ? (
              <StateCard
                icon="notifications-outline"
                title={t('notifications.noneYet')}
                hint={t('notifications.emptyHint')}
                action={{ label: t('notifications.toSettings'), onPress: () => setSection('settings') }}
              />
            ) : visible.length === 0 ? (
              <StateCard icon="checkmark-done-outline" title={filter === 'unread' ? t('notifications.noUnread') : t('notifications.noneInFilter')} />
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
        ) : section === 'validity' && onOpenValidity ? (
          <View key="validity" style={[styles.pane, !reduceMotion && styles.fadeIn]}>
            <ValidityPanel onOpen={onOpenValidity} />
          </View>
        ) : (
          <View key="settings" style={[styles.pane, !reduceMotion && styles.fadeIn]}>
            {prefs.loading ? (
              <View style={styles.state}><BrandLoader color={DESKTOP_COLORS.brand} /></View>
            ) : prefs.error ? (
              <StateCard icon="cloud-offline-outline" title={t('notifications.cannotLoadSettings')} hint={prefs.error} action={{ label: t('common.tryAgain'), onPress: prefs.load }} />
            ) : (
              <>
                {notificationGroups(prefs.visibleTypes, prefs.isDriver, prefs.isOwner).map((group, index, all) => (
                  <SettingsSection
                    key={group.key}
                    layer={all.length - index}
                    group={group}
                    prefs={prefs}
                    canEditLeads={canEditLeads}
                    flash={flash}
                    reduceMotion={reduceMotion}
                    registerCard={(type, node) => { cardRefs.current[type] = node; }}
                  />
                ))}
                {canEditLeads && <SigningRulesSection />}
                <View style={styles.note}>
                  <Ionicons name="checkmark-circle-outline" size={17} color={DESKTOP_COLORS.inkFaint} />
                  <DText style={styles.noteText}>
                    {prefs.isDriver
                      ? t('notifications.savedForYou')
                      : t('notifications.savedCompanyTiming')}
                  </DText>
                </View>
              </>
            )}
          </View>
        )}
      </ScrollView>

      {undo && (
        <View style={[styles.toastWrap, { pointerEvents: 'box-none' }]}>
          <View style={[styles.toast, !reduceMotion && styles.toastIn]} accessibilityLiveRegion="polite">
            <Ionicons name="notifications-off" size={17} color="#FFFFFF" />
            <DText style={styles.toastText} numberOfLines={1}>{t('notifications.muted', { label: undo.label })}</DText>
            <HoverPressable style={styles.toastButton} hoverStyle={styles.toastButtonHover} onPress={() => void undoMute()}>
              <DText weight="bold" style={styles.toastButtonText}>{t('common.cancel')}</DText>
            </HoverPressable>
          </View>
        </View>
      )}
    </View>
  );
}

// מתג התראות/הגדרות
/** The two views, as one pill switch — the same shape as the dashboard's drivers/vehicles switch. */
function SectionSwitch({
  section,
  unread,
  settingsHint,
  showValidity,
  onChange,
}: {
  section: Section;
  unread: number;
  settingsHint: string | null;
  showValidity: boolean;
  onChange: (section: Section) => void;
}) {
  const options: { key: Section; label: string; icon: IconName; badge: string | null; hot: boolean }[] = [
    { key: 'feed', label: t('notifications.updates'), icon: 'notifications-outline', badge: unread > 0 ? String(unread) : null, hot: unread > 0 },
    ...(showValidity ? [{ key: 'validity' as const, label: t('validity.title'), icon: 'hourglass-outline' as IconName, badge: null, hot: false }] : []),
    { key: 'settings', label: t('notifications.settings'), icon: 'options-outline', badge: settingsHint, hot: false },
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

// שורת התראה
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
        accessibilityLabel={`${unread ? t('notifications.newPrefix') : ''}${n.message}. ${timeAgo}${action ? `. ${action}` : ''}`}
      >
        {unread && <View style={[styles.unreadEdge, { pointerEvents: 'none' }]} />}
        <View style={[styles.rowIcon, { backgroundColor: colors.bg }]}>
          <Ionicons name={icon} size={18} color={colors.fg} />
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
            {!!action && <Ionicons name={dirIcon('arrow-back')} size={13} color={DESKTOP_COLORS.brand} />}
          </View>
        </View>
        {/* Room for the action buttons, which sit over the row as siblings (a button may not hold a button). */}
        <View style={styles.rowActionSpace} />
      </HoverPressable>
      <View style={[styles.rowActions, { pointerEvents: 'box-none' }]}>
        {hasLead && (
          <IconAction icon="time-outline" label={t('notifications.timingOf', { v1: shortLabel(info!.label) })} onPress={() => onLead(type!)} />
        )}
        {canMute && (
          <IconAction
            icon="notifications-off-outline"
            label={t('notifications.muteV1', { v1: shortLabel(info!.label) })}
            disabled={muting}
            onPress={() => onMute(type!)}
          />
        )}
      </View>
    </View>
  );
}

// כפתור אייקון קטן
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
        <View style={[styles.tip, { pointerEvents: 'none' }]}>
          <DText weight="semiBold" style={styles.tipText} numberOfLines={1}>{label}</DText>
        </View>
      )}
    </View>
  );
}

// כרטיס מצב (טעינה, ריק, שגיאה)
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

// הרוחב הקטן ביותר של שורה
const ROW_MIN = 340;

// כמה עמודות נכנסות בפאנל
/**
 * How many columns of rows every section's panel holds. All sections share it,
 * so they line up the same; a section with fewer alerts leaves the rest empty.
 */
function panelColumns(width: number): number {
  if (width <= 0) return 1;
  return Math.max(1, Math.floor(width / ROW_MIN));
}

// קווי ההפרדה של תא ברשת
/** Hairlines between the cells of a panel: above every row but the first, and between columns. */
function cellStyle(index: number, columns: number, width: number): StyleProp<ViewStyle>[] {
  const column = index % columns;
  return [
    { width: width > 0 ? width / columns : '100%' },
    index >= columns && styles.cellTop,
    column < columns - 1 && styles.cellSide,
  ];
}

// חלק בהגדרות
function SettingsSection({
  layer,
  group,
  prefs,
  canEditLeads,
  flash,
  reduceMotion,
  registerCard,
}: {
  /** Earlier sections sit above later ones, so a card's "?" bubble can hang over the next section. */
  layer: number;
  group: SettingsGroup;
  prefs: NotificationPreferencesState;
  canEditLeads: boolean;
  flash: { type: NotificationType; nonce: number } | null;
  reduceMotion: boolean;
  registerCard: (type: NotificationType, node: View | null) => void;
}) {
  const [width, setWidth] = useState(0);
  const on = group.items.filter((entry) => prefs.prefs?.[entry.type] ?? true).length;
  const columns = panelColumns(width);
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
    await prefs.toggleMany(group.items.map((item) => item.type), !allOn);
  };

  return (
    <View style={[styles.panel, { zIndex: layer }]}>
      {/* The heading lives inside the panel: name, count, its "?" and the switch for the whole group. */}
      <View style={styles.panelHead}>
        <DText weight="bold" style={styles.panelTitle} accessibilityRole="header">{group.title}</DText>
        <View style={styles.sectionCount}>
          <DText weight="bold" style={styles.sectionCountText}>{`${on}/${group.items.length}`}</DText>
        </View>
        {!!group.subtitle && <HeadingHelp text={group.subtitle} label={group.title} reduceMotion={reduceMotion} />}
        <View style={styles.grow} />
        {folderLeads && (
          <View style={styles.bulk}>
            <DText weight="semiBold" style={styles.bulkLabel}>{t('notifications.allFolders')}</DText>
            {LEAD_RULES.vehicle_license_expiry!.presets.map((days) => (
              <HoverPressable
                key={days}
                style={styles.bulkChip}
                hoverStyle={styles.bulkChipHover}
                pressMotionStyle={styles.pressDown}
                onPress={() => void setAll(days)}
                disabled={prefs.savingLeadType != null}
                accessibilityLabel={t('notifications.daysBeforeAllFolders', { days })}
              >
                <DText weight="semiBold" style={styles.bulkChipText}>{days}</DText>
              </HoverPressable>
            ))}
          </View>
        )}
        {group.items.length > 2 && (
          <View style={styles.allSwitch}>
            <DText weight="semiBold" style={styles.allSwitchLabel}>{t('common.all')}</DText>
            <LiquidGlassSwitch
              value={allOn}
              onValueChange={() => void toggleAll()}
              disabled={prefs.savingType != null}
              accessibilityLabel={`${group.title}: ${allOn ? t('notifications.turnAllOff') : t('notifications.turnAllOn')}`}
              tint={DESKTOP_COLORS.brand}
              reduceMotion={reduceMotion}
            />
          </View>
        )}
      </View>

      <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {group.items.map((item, index) => (
          <TypeCard
            key={item.type}
            item={item}
            compact={!!group.compact}
            cell={cellStyle(index, columns, width)}
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

// כרטיס של סוג התראה עם מתג
function TypeCard({
  item,
  compact,
  cell,
  prefs,
  canEditLeads,
  flashNonce,
  reduceMotion,
  registerCard,
}: {
  item: NotificationTypeInfo;
  compact: boolean;
  /** Its width and hairlines as a cell of the section's panel. */
  cell: StyleProp<ViewStyle>[];
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
  const [helpOpen, setHelpOpen] = useState(false);
  // What the alert does, behind the "?": its description, or when it goes out if it has none.
  const help =
    item.description ||
    (leadValue != null && rule ? `${leadPhrase(leadValue, rule)}${rule.unit === 'days' ? t('notifications.andOnDay') : ''}` : '');

  return (
    <View
      ref={(node) => registerCard(item.type, node)}
      style={[styles.card, ...cell, helpOpen && styles.cardRaised]}
    >
      {flashNonce != null && <View key={flashNonce} style={[StyleSheet.absoluteFill, styles.cardFlash, { pointerEvents: 'none' }]} />}
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, !value && styles.cardIconOff]}>
          <Ionicons name={TYPE_ICON[item.type] ?? 'notifications-outline'} size={18} color={value ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkFaint} />
        </View>
        <View style={styles.cardCopy}>
          <DText weight="bold" style={[styles.cardTitle, !value && styles.cardTitleOff]} numberOfLines={1}>{label}</DText>
          {!!help && <HelpTip text={help} title={item.label} label={label} open={helpOpen} onOpenChange={setHelpOpen} reduceMotion={reduceMotion} />}
        </View>
        {/* The lead time sits on the title row, and only while the alert is on. */}
        {leadEditable && value && (
          <LeadControl
            type={item.type}
            label={label}
            rule={rule!}
            value={leadValue!}
            saving={prefs.savingLeadType === item.type}
            dimmed={false}
            inline
            onCommit={(next) => prefs.setLead(item.type, next)}
          />
        )}
        <LiquidGlassSwitch
          value={value}
          onValueChange={(next) => void prefs.toggle(item.type, next)}
          disabled={prefs.savingType === item.type}
          accessibilityLabel={item.label}
          tint={DESKTOP_COLORS.brand}
          reduceMotion={reduceMotion}
        />
      </View>
    </View>
  );
}

// הגדרות תוקף והתראה למסמכי חתימה
/**
 * Every signing document of the company, on its own: how long a signature
 * stays good and when its alert goes out (lib/signingRules.ts, migration 105).
 */
function SigningRulesSection() {
  const { companyId } = useCompany();
  const rules = useSigningRules(companyId, true);
  const [width, setWidth] = useState(0);
  const columns = panelColumns(width);
  const reduceMotion = prefersReducedMotion();

  return (
    // Measured on the panel, which is there from the start (the grid only appears once the rows load).
    <View style={styles.panel} onLayout={(e) => setWidth(e.nativeEvent.layout.width - 2)}>
      <View style={styles.panelHead}>
        <DText weight="bold" style={styles.panelTitle} accessibilityRole="header">{t('signingRules.title')}</DText>
        <HeadingHelp text={t('signingRules.subtitle')} label={t('signingRules.title')} reduceMotion={reduceMotion} />
      </View>
      {!!rules.error && <DText style={[styles.panelNote, styles.ruleError]}>{rules.error}</DText>}
      {!rules.rows ? (
        !rules.error && <View style={styles.panelNote}><BrandLoader color={DESKTOP_COLORS.brand} /></View>
      ) : rules.rows.length === 0 ? (
        <DText style={styles.panelNote}>{t('signingRules.empty')}</DText>
      ) : (
        <View style={styles.grid}>
          {rules.rows.map((row, index) => (
            // Each document in two short lines: its full name, then how long a signature holds and (when it expires) the lead time.
            <View key={row.templateId} style={[styles.card, styles.ruleCell, ...cellStyle(index, columns, width), { zIndex: rules.rows!.length - index }]}>
              <View style={[styles.cardHead, styles.ruleHead]}>
                <View style={styles.cardIcon}>
                  <Ionicons name="document-text-outline" size={18} color={DESKTOP_COLORS.brand} />
                </View>
                <View style={styles.cardCopy}>
                  <DText weight="bold" style={styles.cardTitle} numberOfLines={2}>{row.title}</DText>
                  <HeadingHelp
                    title={row.title}
                    text={row.validMonths ? t('signingRules.detailExpiring', { validity: validityLabel(row.validMonths), days: row.leadDays }) : t('signingRules.detailNoExpiry')}
                    label={row.title}
                    reduceMotion={reduceMotion}
                  />
                </View>
                {rules.saving === row.templateId && <BrandLoader size={14} color={DESKTOP_COLORS.brand} />}
              </View>
              <View style={styles.ruleControls}>
                {!!row.validMonths && (
                  <LeadControl
                    type="signature_expiry"
                    label={row.title}
                    rule={SIGNING_LEAD_RULE}
                    value={row.leadDays}
                    saving={false}
                    dimmed={false}
                    inline
                    onCommit={(days) => rules.save(row.templateId, row.validMonths, days)}
                  />
                )}
                <View style={styles.validity}>
                  <DesktopSelect
                    value={String(row.validMonths ?? 0)}
                    options={VALIDITY_MONTHS.map((months) => ({ value: String(months), label: validityLabel(months) }))}
                    onChange={(next) => {
                      const months = Number(next ?? 0);
                      if (months !== (row.validMonths ?? 0)) void rules.save(row.templateId, months || null, row.leadDays);
                    }}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// בחירת 'כמה זמן מראש' עם + ו-
/**
 * One type's lead time: − value + with the unit in words, and a few presets.
 * Steps and typing settle for a moment before saving, so a run of clicks is one save.
 */
export function LeadControl({
  type,
  label,
  rule,
  value,
  saving,
  dimmed,
  inline = false,
  onCommit,
}: {
  type: NotificationType;
  label: string;
  rule: LeadRule;
  value: number;
  saving: boolean;
  dimmed: boolean;
  /** Just the − value + row, for a card's title line: no divider, no presets. */
  inline?: boolean;
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

  const row = (
      <View style={[styles.leadRow, inline && styles.leadRowInline]}>
        {/* On a card's title row the card itself says what this is; just the number and its unit. */}
        {!inline && <Ionicons name="time-outline" size={16} color={DESKTOP_COLORS.inkMuted} />}
        {!inline && <DText weight="semiBold" style={styles.leadLabel}>{t('notifications.alert')}</DText>}
        <View style={[styles.stepper, inline && styles.stepperInline]}>
          <HoverPressable
            style={[styles.stepBtn, inline && styles.stepBtnInline]}
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
            style={[styles.stepInput, inline && styles.stepInputInline, rule.unit === 'km' && styles.stepInputWide]}
            selectTextOnFocus
          />
          <HoverPressable
            style={[styles.stepBtn, inline && styles.stepBtnInline]}
            hoverStyle={styles.stepBtnHover}
            pressMotionStyle={styles.pressDown}
            onPress={() => step(-1)}
            disabled={current <= rule.min}
            accessibilityLabel={`${label}: ${stepLabels.down}`}
          >
            <Ionicons name="remove" size={17} color={current <= rule.min ? DESKTOP_COLORS.inkFaint : DESKTOP_COLORS.brand} />
          </HoverPressable>
        </View>
        {/* On a row days need no words; kilometres keep a short "ק״מ" so 1000 isn't read as days. */}
        {!inline && <DText style={styles.leadUnit} numberOfLines={1}>{unitWord}</DText>}
        {inline && rule.unit === 'km' && <DText style={[styles.leadUnit, styles.leadUnitInline]}>{t('unit.km')}</DText>}
        {!inline && <View style={styles.grow} />}
        {saving && <BrandLoader size={14} color={DESKTOP_COLORS.brand} />}
      </View>
  );

  if (inline) return row;

  return (
    <View style={[styles.lead, dimmed && styles.leadDimmed]} aria-disabled={dimmed}>
      {row}
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
                {rule.unit === 'km' ? preset.toLocaleString(getLocale()) : preset}
              </DText>
            </HoverPressable>
          );
        })}
      </View>
    </View>
  );
}

// עקומת אנימציה
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
// כחול רך
const BRAND_SOFT = '#E6F2F9';
// כחול כהה
const NAVY = '#102536';

// עיצוב דף ההתראות
const styles = StyleSheet.create({
  // הדף
  root: { flex: 1 },
  scroll: { flex: 1 },
  // אזור התוכן
  content: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 64, maxWidth: 1160, width: '100%', alignSelf: 'center', gap: 14 },
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  headingCopy: { gap: 3, flexShrink: 1 },
  pressDown: { transform: [{ scale: 0.97 }] },
  fadeIn: webOnly({
    animationKeyframes: { from: { opacity: 0, transform: [{ translateY: 6 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } },
    animationDuration: '220ms',
    animationTimingFunction: EASE_OUT,
  }),

  // Header
  heroIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  // המתג התראות/הגדרות
  switch: {
    flexDirection: 'row-reverse',
    padding: 3,
    gap: 3,
    borderRadius: 13,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    ...webOnly({ boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }),
  },
  switchItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    ...webOnly({ transition: `background-color 180ms ${EASE_OUT}` }),
  },
  switchItemHover: { backgroundColor: DESKTOP_COLORS.surfaceMuted },
  switchItemActive: { backgroundColor: DESKTOP_COLORS.brand, ...webOnly({ boxShadow: DESKTOP_BRAND_SHADOW }) },
  switchText: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },
  switchTextActive: { color: '#FFFFFF' },
  switchBadge: { minWidth: 24, height: 22, paddingHorizontal: 7, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF0F2' },
  switchBadgeActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  switchBadgeHot: { backgroundColor: DESKTOP_COLORS.danger },
  switchBadgeText: { fontSize: 12, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  switchBadgeTextOn: { color: '#FFFFFF' },

  pane: { gap: 14 },

  // שורת הסינון
  // Feed toolbar
  toolbar: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  // מתג הסינון
  segment: { flexDirection: 'row-reverse', gap: 6, flexWrap: 'wrap' },
  segmentItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    backgroundColor: DESKTOP_COLORS.surface,
    ...webOnly({ transition: `background-color 160ms ${EASE_OUT}, border-color 160ms ${EASE_OUT}` }),
  },
  segmentItemHover: { backgroundColor: DESKTOP_COLORS.surfaceMuted, borderColor: '#CFD7DE' },
  segmentItemActive: { backgroundColor: NAVY, borderColor: NAVY },
  segmentText: { fontSize: 13.5, color: DESKTOP_COLORS.ink },
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
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    backgroundColor: DESKTOP_COLORS.surface,
    ...webOnly({ transition: `background-color 160ms ${EASE_OUT}, border-color 160ms ${EASE_OUT}, transform 160ms ${EASE_OUT}` }),
  },
  ghostButtonHover: { backgroundColor: BRAND_SOFT, borderColor: 'rgba(47,91,255,0.3)' },
  ghostButtonText: { fontSize: 13.5, color: DESKTOP_COLORS.brand },

  // קבוצות לפי יום
  // Feed list
  days: { gap: 18 },
  day: { gap: 8 },
  dayTitle: { fontSize: 13, color: DESKTOP_COLORS.inkMuted, paddingHorizontal: 6 },
  list: {
    borderRadius: 14,
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
  // שורת התראה
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 11,
    paddingHorizontal: 18,
    ...webOnly({ transition: 'background-color 150ms ease' }),
  },
  // שורה שלא נקראה
  rowUnread: { backgroundColor: '#F5F9FD' },
  rowHover: { backgroundColor: '#EEF5FA' },
  unreadEdge: { position: 'absolute', end: 0, top: 12, bottom: 12, width: 4, borderTopStartRadius: 4, borderBottomStartRadius: 4, backgroundColor: DESKTOP_COLORS.brand },
  rowIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  message: { fontSize: 14.5, lineHeight: 21, color: DESKTOP_COLORS.ink, maxWidth: 860 },
  messageRead: { color: '#394755' },
  meta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaTag: { fontSize: 12.5 },
  metaText: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint },
  metaAction: { fontSize: 12.5, color: DESKTOP_COLORS.brand },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#B8C1C9' },
  rowActionSpace: { width: 84, flexShrink: 0 },
  rowActions: { position: 'absolute', start: 18, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconActionWrap: { position: 'relative', alignItems: 'center' },
  iconAction: {
    width: 34,
    height: 34,
    borderRadius: 10,
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

  // Settings sections
  sectionCount: { height: 24, paddingHorizontal: 9, borderRadius: 12, justifyContent: 'center', backgroundColor: '#EEF0F2' },
  sectionCountText: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  bulk: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  bulkLabel: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted, marginStart: 2 },
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
  bulkChipHover: { backgroundColor: BRAND_SOFT, borderColor: 'rgba(47,91,255,0.3)' },
  bulkChipText: { fontSize: 13, color: DESKTOP_COLORS.ink },
  // A section: one panel, its heading inside, its alerts as rows of a grid.
  panel: {
    position: 'relative',
    borderRadius: 14,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    ...webOnly({ boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }),
  },
  panelHead: {
    position: 'relative',
    zIndex: 2,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.borderSoft,
  },
  panelTitle: { fontSize: 15, color: DESKTOP_COLORS.ink, letterSpacing: -0.1 },
  panelNote: { padding: 14, fontSize: 13.5, color: DESKTOP_COLORS.inkMuted },
  allSwitch: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginStart: 4 },
  allSwitchLabel: { fontSize: 13, color: DESKTOP_COLORS.inkMuted },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap' },
  cellTop: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  cellSide: { borderLeftWidth: 1, borderLeftColor: DESKTOP_COLORS.borderSoft },
  // One alert: a slim row inside its section's panel.
  card: {
    position: 'relative',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 14,
    minHeight: 52,
    justifyContent: 'center',
  },
  // The signature's validity: a small dropdown in place of a row of buttons.
  validity: { width: 112, flexShrink: 0 },
  // A document's cell: name on top, its two controls under it at the row's far edge.
  ruleCell: { gap: 8 },
  // Above the controls under it, so the name's "?" bubble isn't covered.
  ruleHead: { position: 'relative', zIndex: 2 },
  ruleControls: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  // Above its neighbours while its explanation is open, so the bubble isn't covered.
  cardRaised: { zIndex: 10 },
  cardFlash: {
    borderRadius: 0,
    borderWidth: 2,
    borderColor: DESKTOP_COLORS.brand,
    backgroundColor: 'rgba(47,91,255,0.08)',
    opacity: 0,
    ...webOnly({ animationKeyframes: { '0%': { opacity: 1 }, '70%': { opacity: 1 }, '100%': { opacity: 0 } }, animationDuration: '1800ms', animationTimingFunction: 'ease-out' }),
  },
  cardHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  cardIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: BRAND_SOFT, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardIconOff: { backgroundColor: '#EEF0F2' },
  cardCopy: { flex: 1, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 2 },
  cardTitle: { flexShrink: 1, fontSize: 13.5, color: DESKTOP_COLORS.ink },
  cardTitleOff: { color: DESKTOP_COLORS.inkMuted },

  // Lead control
  lead: { gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft, ...webOnly({ transition: 'opacity 200ms ease' }) },
  leadDimmed: { opacity: 0.5, pointerEvents: 'none' },
  leadRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  leadRowInline: { flexShrink: 0 },
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
    borderStartWidth: 1,
    borderEndWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    ...webOnly({ outlineStyle: 'none', fontVariantNumeric: 'tabular-nums' }),
  },
  stepInputWide: { width: 60 },
  // The smaller stepper that sits on a card's title row
  stepperInline: { height: 30, borderRadius: 9 },
  stepBtnInline: { width: 24, height: 28 },
  stepInputInline: { width: 32, height: 28, fontSize: 14 },
  leadUnitInline: { fontSize: 13, color: DESKTOP_COLORS.inkMuted },
  presets: { flexDirection: 'row-reverse', gap: 6 },
  ruleError: { color: DESKTOP_TONES.bad.fg },
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
  toastWrap: { position: 'absolute', start: 0, end: 0, bottom: 28, alignItems: 'center' },
  toast: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    height: 52,
    paddingEnd: 18,
    paddingStart: 8,
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
