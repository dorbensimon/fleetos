import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCompany } from '../../lib/CompanyContext';
import {
  countUnreadNotifications,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  Notification,
  resolveNotificationVehicleId,
} from '../../lib/adminApi';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/platformAlert';
import { formatDateTime } from '../../lib/theme';
import { RootStackParamList } from '../../navigation/types';
import { isVehicleFolderNotification } from '../../lib/vehicleFolderAlerts';
import { DText, HoverPressable } from './primitives';
import {
  DESKTOP_COLORS,
  DESKTOP_HEADER_HEIGHT,
  DESKTOP_SIDEBAR_WIDTH,
  webOnly,
} from './desktopTheme';

/**
 * Desktop web frame for signed-in screens: a dark sidebar on the right
 * (RTL) with role-based navigation, and a white top bar with breadcrumbs,
 * a notifications popover and the signed-in user. The page body scrolls
 * on its own so the frame stays fixed.
 */

type NavKey = keyof RootStackParamList;
type Breadcrumb = string | { label: string; onPress: () => void };
type NavItem = {
  key: NavKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: number;
};

const ROLE_LABEL: Record<string, string> = {
  owner: 'בעל החברה',
  admin: 'מנהל מערכת',
  driver: 'נהג',
};

const NOTIFICATION_PREVIEW_COUNT = 5;

export function DesktopShell({
  active,
  breadcrumbs,
  children,
}: {
  active: NavKey;
  breadcrumbs: Breadcrumb[];
  children: React.ReactNode;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { profile, company, companyId } = useCompany();
  const isAdmin = profile?.role === 'admin';
  const isOwner = profile?.role === 'owner';
  const isDriver = profile?.role === 'driver';

  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const refreshCounts = useCallback(() => {
    if (!companyId || !isAdmin) return () => undefined;
    let cancelled = false;
    // Badge counts are decoration — a failure must never break the page.
    countUnreadNotifications(companyId)
      .then((count) => { if (!cancelled) setUnread(count); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [companyId, isAdmin]);

  useFocusEffect(refreshCounts);

  const toggleNotifications = async () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (!next || !companyId) return;
    try {
      const rows = await listNotifications(companyId);
      setNotifications(rows.slice(0, NOTIFICATION_PREVIEW_COUNT));
    } catch {
      setNotifications([]);
    }
  };

  const readAll = async () => {
    if (!companyId) return;
    try {
      await markAllNotificationsRead(companyId);
      setUnread(0);
      setNotifications((rows) => rows.map((row) => ({ ...row, read_at: row.read_at ?? new Date().toISOString() })));
    } catch {
      showAlert('הפעולה נכשלה', 'לא הצלחנו לסמן את ההתראות כנקראו.');
    }
  };

  const openPreviewNotification = async (notification: Notification) => {
    if (!notification.read_at) {
      try {
        await markNotificationRead(notification.id);
        setUnread((current) => Math.max(0, current - 1));
        setNotifications((rows) => rows.map((row) => (
          row.id === notification.id ? { ...row, read_at: new Date().toISOString() } : row
        )));
      } catch {
        showAlert('הפעולה נכשלה', 'לא הצלחנו לסמן את ההתראה כנקראה.');
      }
    }

    setNotifOpen(false);

    const isVehicleNotification = notification.notification_type === 'vehicle_assignment'
      || notification.notification_type === 'vehicle_inspection_last_date_expiry'
      || notification.notification_type === 'vehicle_service_due'
      || isVehicleFolderNotification(notification.notification_type);
    const vehicleId = isVehicleNotification
      ? await resolveNotificationVehicleId(notification)
      : null;

    if (vehicleId) {
      navigation.navigate('VehicleDetail', {
        vehicleId,
        openFolder: notification.folder_key ?? undefined,
      });
      return;
    }

    if (
      (notification.notification_type === 'driver_profile_update'
        || notification.notification_type?.startsWith('driver_document_')
        || notification.notification_type === 'driver_odometer_update')
      && notification.actor_id
    ) {
      navigation.navigate('DriverPersonalDetails', { driverId: notification.actor_id });
      return;
    }

    if (notification.notification_type === 'license_update_requested' && notification.actor_id) {
      navigation.navigate('DriverDetail', { driverId: notification.actor_id });
      return;
    }

    if (
      isVehicleNotification
    ) {
      navigation.navigate('AdminHome');
      return;
    }

    navigation.navigate('Notifications');
  };

  const logout = () => {
    showAlert('התנתקות', 'האם אתה בטוח שברצונך להתנתק מהחשבון?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'התנתק',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.auth.signOut();
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          } catch {
            showAlert('ההתנתקות נכשלה', 'נסה שוב בעוד רגע.');
          }
        },
      },
    ]);
  };

  // Only routes this role can already open from the phone app appear here —
  // mirrors MenuScreen's per-role item lists, the app's existing source of
  // truth for "what can this role reach."
  const manageItems: NavItem[] = isAdmin
    ? [
        { key: 'AdminHome', label: 'דשבורד', icon: 'grid' },
        { key: 'CompanyDocuments', label: 'מסמכי חברה', icon: 'folder-open' },
      ]
    : isOwner
    ? [
        { key: 'OwnerHome', label: 'חברות', icon: 'business' },
        { key: 'GlobalSigningTemplates', label: 'תבניות גלובליות', icon: 'document-text' },
      ]
    : isDriver
    ? [
        { key: 'DriverHome', label: 'הבית שלי', icon: 'home' },
        { key: 'DriverDocuments', label: 'המסמכים שלי', icon: 'folder' },
        { key: 'DriverSigningDocuments', label: 'מסמכים לחתימה', icon: 'create' },
      ]
    : [];
  const accountItems: NavItem[] = isAdmin
    ? [
        { key: 'AdminProfile', label: 'הפרטים שלי', icon: 'person' },
        { key: 'Notifications', label: 'התראות', icon: 'notifications' },
      ]
    : isOwner
    ? [
        { key: 'AdminProfile', label: 'הפרטים שלי', icon: 'person' },
        { key: 'Notifications', label: 'התראות', icon: 'notifications' },
      ]
    : isDriver
    ? [
        { key: 'DriverProfile', label: 'הפרטים שלי', icon: 'person' },
        { key: 'Notifications', label: 'התראות', icon: 'notifications' },
      ]
    : [];

  const go = (key: NavKey) => {
    // `active` is only a highlight hint — detail screens (driver/vehicle)
    // pass their parent's key (e.g. "AdminHome") so the right sidebar item
    // lights up, even though that parent isn't the focused route. Guarding
    // navigation on `key === active` used to make that item a dead click
    // from inside those screens. `navigate` itself already no-ops when the
    // target is the actual focused route, so no guard is needed here.
    // Every sidebar destination is parameterless.
    (navigation.navigate as (name: NavKey) => void)(key);
  };

  /**
   * Every shared desktop header receives simple breadcrumb labels. Resolve the
   * labels that represent actual parent screens here, so they work uniformly
   * without each screen reimplementing the same navigation wiring.
   */
  const breadcrumbAction = (label: string): (() => void) | undefined => {
    switch (label) {
      case 'ניהול':
        return () => navigation.navigate('AdminHome');
      case 'נהגים':
        return () => navigation.navigate('AdminHome', { mode: 'drivers' });
      case 'רכבים':
        return () => navigation.navigate('AdminHome', { mode: 'vehicles' });
      case 'חברות':
        return () => navigation.navigate('OwnerHome');
      case 'חשבון':
        return () => navigation.navigate(isDriver ? 'DriverProfile' : 'AdminProfile');
      case 'הבית שלי':
        return () => navigation.navigate('DriverHome');
      case 'הרכב שלי':
        return () => navigation.navigate('DriverVehicle');
      case 'המסמכים שלי':
        return () => navigation.navigate('DriverDocuments');
      case 'מסמכים לחתימה':
        return () => navigation.navigate('DriverSigningDocuments');
      default:
        return undefined;
    }
  };

  const fullName = profile?.full_name?.trim() || '';
  const initials = fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('') || '?';
  const roleLabel = profile?.job_title || (profile?.role ? ROLE_LABEL[profile.role] : '');

  return (
    <View style={styles.root}>
      <View style={styles.sidebar}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <DText weight="extraBold" style={styles.brandMarkText}>T</DText>
          </View>
          <DText weight="bold" style={styles.brandName}>Tolvex Fleet</DText>
        </View>
        <View style={styles.companyBlock}>
          <DText weight="semiBold" style={styles.companyName} numberOfLines={1}>
            {company?.name ?? ''}
          </DText>
          <DText style={styles.companyRole}>{roleLabel}</DText>
        </View>

        <ScrollView style={styles.nav} contentContainerStyle={styles.navContent}>
          {manageItems.length > 0 && <DText weight="bold" style={styles.navSection}>ניהול</DText>}
          {manageItems.map((item) => (
            <SidebarItem key={item.key} item={item} active={item.key === active} onPress={() => go(item.key)} />
          ))}
          {accountItems.length > 0 && (
            <DText weight="bold" style={[styles.navSection, styles.navSectionSpaced]}>חשבון</DText>
          )}
          {accountItems.map((item) => (
            <SidebarItem key={item.key} item={item} active={item.key === active} onPress={() => go(item.key)} />
          ))}
        </ScrollView>

        <HoverPressable style={styles.logout} hoverStyle={styles.navItemHover} onPress={logout}>
          <Ionicons name="log-out-outline" size={15} color={DESKTOP_COLORS.sidebarText} />
          <DText weight="medium" style={styles.navLabel}>התנתקות</DText>
        </HoverPressable>
      </View>

      <View style={styles.main}>
        <View style={styles.header}>
          <View style={styles.breadcrumbs}>
            {breadcrumbs.map((breadcrumb, index) => {
              const last = index === breadcrumbs.length - 1;
              const crumb = typeof breadcrumb === 'string' ? breadcrumb : breadcrumb.label;
              const onPress = last ? undefined : (typeof breadcrumb === 'string' ? breadcrumbAction(crumb) : breadcrumb.onPress);
              return (
                <React.Fragment key={`${crumb}-${index}`}>
                  {index > 0 && <DText style={styles.crumb}>/</DText>}
                  {onPress ? (
                    <HoverPressable
                      onPress={onPress}
                      hoverStyle={styles.crumbInteractiveHover}
                      accessibilityLabel={`מעבר אל ${crumb}`}
                    >
                      <DText weight="regular" style={[styles.crumb, styles.crumbInteractive]}>{crumb}</DText>
                    </HoverPressable>
                  ) : (
                    <DText weight={last ? 'semiBold' : 'regular'} style={[styles.crumb, last && styles.crumbCurrent]}>
                      {crumb}
                    </DText>
                  )}
                </React.Fragment>
              );
            })}
          </View>

          <View style={styles.headerActions}>
            {isAdmin && (
              <View style={styles.bellWrap}>
                <HoverPressable
                  style={styles.bell}
                  hoverStyle={styles.bellHover}
                  onPress={() => void toggleNotifications()}
                  accessibilityLabel={unread > 0 ? `התראות, ${unread} שלא נקראו` : 'התראות'}
                >
                  <Ionicons name="notifications" size={15} color={DESKTOP_COLORS.ink} />
                  {unread > 0 && <View style={styles.bellDot} />}
                </HoverPressable>
                {notifOpen && (
                  <View style={styles.popover}>
                    <View style={styles.popoverHeader}>
                      <DText weight="bold" style={styles.popoverTitle}>התראות</DText>
                      {unread > 0 && (
                        <HoverPressable onPress={() => void readAll()}>
                          <DText weight="semiBold" style={styles.link}>קרא הכל</DText>
                        </HoverPressable>
                      )}
                    </View>
                    {notifications.length === 0 ? (
                      <DText style={styles.popoverEmpty}>אין התראות חדשות</DText>
                    ) : (
                      notifications.map((n) => (
                        <HoverPressable
                          key={n.id}
                          style={styles.popoverRow}
                          hoverStyle={styles.rowHover}
                          onPress={() => void openPreviewNotification(n)}
                          accessibilityLabel={n.message}
                        >
                          <View style={[styles.popoverDot, !n.read_at && styles.popoverDotUnread]} />
                          <View style={styles.popoverCopy}>
                            <DText weight="semiBold" style={styles.popoverMessage} numberOfLines={2}>
                              {n.message}
                            </DText>
                            <DText style={styles.popoverTime}>{formatDateTime(n.created_at)}</DText>
                          </View>
                        </HoverPressable>
                      ))
                    )}
                    <HoverPressable
                      style={styles.popoverFooter}
                      hoverStyle={styles.rowHover}
                      onPress={() => {
                        setNotifOpen(false);
                        navigation.navigate('Notifications');
                      }}
                    >
                      <DText weight="semiBold" style={[styles.link, styles.centered]}>לכל ההתראות</DText>
                    </HoverPressable>
                  </View>
                )}
              </View>
            )}
            <View style={styles.headerDivider} />
            <HoverPressable
              style={styles.user}
              onPress={() => isAdmin && go('AdminProfile')}
              accessibilityLabel="הפרטים שלי"
            >
              <View style={styles.userAvatar}>
                <DText weight="bold" style={styles.userAvatarText}>{initials}</DText>
              </View>
              <View>
                <DText weight="semiBold" style={styles.userName}>{fullName}</DText>
                <DText style={styles.userRole}>{roleLabel}</DText>
              </View>
            </HoverPressable>
          </View>
        </View>

        <View style={styles.body}>{children}</View>
      </View>

    </View>
  );
}

function SidebarItem({ item, active, onPress }: { item: NavItem; active: boolean; onPress: () => void }) {
  const color = active ? DESKTOP_COLORS.sidebarActiveText : DESKTOP_COLORS.sidebarText;
  return (
    <HoverPressable
      style={[styles.navItem, active && styles.navItemActive]}
      hoverStyle={active ? undefined : styles.navItemHover}
      onPress={onPress}
      accessibilityState={{ selected: active }}
    >
      <Ionicons name={item.icon} size={15} color={color} />
      <DText weight={active ? 'semiBold' : 'medium'} style={[styles.navLabel, { color }]} numberOfLines={1}>
        {item.label}
      </DText>
      {!!item.badge && (
        <View style={styles.navBadge}>
          <DText weight="bold" style={styles.navBadgeText}>{item.badge}</DText>
        </View>
      )}
    </HoverPressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row-reverse', backgroundColor: DESKTOP_COLORS.canvas, overflow: 'hidden' },

  sidebar: { width: DESKTOP_SIDEBAR_WIDTH, flexShrink: 0, backgroundColor: DESKTOP_COLORS.sidebarBg },
  brandRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.sidebarDivider,
  },
  brandMark: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: DESKTOP_COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: { color: '#fff', fontSize: 13, textAlign: 'center' },
  brandName: { color: DESKTOP_COLORS.sidebarTitle, fontSize: 14.5 },
  companyBlock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.sidebarDivider,
  },
  companyName: { color: DESKTOP_COLORS.sidebarTextStrong, fontSize: 12.5 },
  companyRole: { color: DESKTOP_COLORS.sidebarMeta, fontSize: 11, marginTop: 1 },

  nav: { flex: 1 },
  navContent: { padding: 8 },
  navSection: {
    color: DESKTOP_COLORS.sidebarSection,
    fontSize: 10.5,
    letterSpacing: 0.4,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 4,
  },
  navSectionSpaced: { paddingTop: 16 },
  navItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    borderRightWidth: 2,
    borderRightColor: 'transparent',
  },
  navItemActive: { backgroundColor: DESKTOP_COLORS.sidebarActiveBg, borderRightColor: DESKTOP_COLORS.brand },
  navItemHover: { backgroundColor: DESKTOP_COLORS.sidebarHoverBg },
  navLabel: { flex: 1, color: DESKTOP_COLORS.sidebarText, fontSize: 13 },
  navBadge: { backgroundColor: DESKTOP_COLORS.danger, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  navBadgeText: { color: '#fff', fontSize: 10, textAlign: 'center' },
  logout: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 8,
    marginVertical: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
  },

  main: { flex: 1, minWidth: 0 },
  header: {
    height: DESKTOP_HEADER_HEIGHT,
    flexShrink: 0,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: DESKTOP_COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.border,
    zIndex: 20,
  },
  breadcrumbs: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  crumb: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint },
  crumbInteractive: { color: DESKTOP_COLORS.inkMuted, textDecorationLine: 'underline', textDecorationColor: 'transparent' },
  crumbInteractiveHover: { opacity: 0.78 },
  crumbCurrent: { color: DESKTOP_COLORS.ink },
  headerActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  bellWrap: { position: 'relative', zIndex: 30 },
  bell: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    backgroundColor: DESKTOP_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellHover: { backgroundColor: DESKTOP_COLORS.canvas },
  bellDot: {
    position: 'absolute',
    top: 4,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: DESKTOP_COLORS.danger,
    borderWidth: 1,
    borderColor: '#fff',
  },
  popover: {
    position: 'absolute',
    top: 36,
    left: 0,
    width: 300,
    backgroundColor: DESKTOP_COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    overflow: 'hidden',
    ...webOnly({ boxShadow: '0 8px 20px rgba(16,34,50,0.16)' }),
  },
  popoverHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.borderSoft,
  },
  popoverTitle: { fontSize: 12.5 },
  popoverEmpty: { fontSize: 12, color: DESKTOP_COLORS.inkFaint, padding: 14, textAlign: 'center' },
  popoverRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F4F6',
  },
  popoverDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5, backgroundColor: DESKTOP_COLORS.borderInput },
  popoverDotUnread: { backgroundColor: DESKTOP_COLORS.brand },
  popoverCopy: { flex: 1, gap: 1 },
  popoverMessage: { fontSize: 12 },
  popoverTime: { fontSize: 11, color: DESKTOP_COLORS.inkFaint },
  popoverFooter: { paddingVertical: 9 },
  link: { fontSize: 11.5, color: DESKTOP_COLORS.brand },
  centered: { textAlign: 'center' },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  headerDivider: { width: 1, height: 20, backgroundColor: DESKTOP_COLORS.border },
  user: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  userAvatar: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: DESKTOP_COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: { color: '#fff', fontSize: 11, textAlign: 'center' },
  userName: { fontSize: 12, lineHeight: 15 },
  userRole: { fontSize: 10.5, color: DESKTOP_COLORS.inkFaint, lineHeight: 13 },

  body: { flex: 1, minHeight: 0 },
});
