import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/platformAlert';
import { RootStackParamList } from '../../navigation/types';
import { DText, HoverPressable } from './primitives';
import { BrandLogo } from '../ui/Brand';
import { HeaderMenuProvider } from './headerMenu';
import { NotificationsBell } from './NotificationsBell';
import { DESKTOP_COLORS, DESKTOP_HEADER_HEIGHT, DESKTOP_SIDEBAR_WIDTH } from './desktopTheme';

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

const SHELL_LEGAL_LINKS = [
  { doc: 'terms', label: 'תנאי שימוש' },
  { doc: 'privacy', label: 'פרטיות' },
  { doc: 'cookies', label: 'עוגיות' },
  { doc: 'accessibility', label: 'נגישות' },
] as const;

export function DesktopShell({
  active,
  breadcrumbs,
  headerAccessory,
  children,
}: {
  active: NavKey;
  breadcrumbs: Breadcrumb[];
  /** Page-specific control shown in the top bar beside the notifications bell. */
  headerAccessory?: React.ReactNode;
  children: React.ReactNode;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { profile, company, companyId } = useCompany();
  const isAdmin = profile?.role === 'admin';
  const isOwner = profile?.role === 'owner';
  const isDriver = profile?.role === 'driver';

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
        { key: 'SignedDocuments', label: 'מסמכים חתומים', icon: 'create' },
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
          <BrandLogo onDark height={24} />
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

        {isAdmin && (
          <View style={styles.footerNav}>
            <SidebarItem
              item={{ key: 'CompanySettings', label: 'הגדרות החברה', icon: 'settings' }}
              active={active === 'CompanySettings'}
              onPress={() => go('CompanySettings')}
            />
          </View>
        )}
        <HoverPressable style={styles.logout} hoverStyle={styles.navItemHover} onPress={logout}>
          <Ionicons name="log-out-outline" size={15} color={DESKTOP_COLORS.sidebarText} />
          <DText weight="medium" style={styles.navLabel}>התנתקות</DText>
        </HoverPressable>
        <View style={styles.legalLinks}>
          {SHELL_LEGAL_LINKS.map(({ doc, label }) => (
            <DText
              key={doc}
              style={styles.legalLink}
              accessibilityRole="link"
              onPress={() => navigation.navigate('Legal', { doc })}
            >
              {label}
            </DText>
          ))}
        </View>
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

          <HeaderMenuProvider>
            <View style={styles.headerActions}>
              {headerAccessory}
              {isAdmin && !!companyId && <NotificationsBell companyId={companyId} role={profile?.role} />}
              <View style={styles.headerDivider} />
              <HoverPressable
                style={styles.user}
                onPress={() => go(isDriver ? 'DriverProfile' : 'AdminProfile')}
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
          </HeaderMenuProvider>
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
      aria-selected={active}
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
  footerNav: {
    paddingHorizontal: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: DESKTOP_COLORS.sidebarDivider,
  },
  legalLinks: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 2,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  legalLink: { color: DESKTOP_COLORS.sidebarMeta, fontSize: 11, textDecorationLine: 'underline', paddingVertical: 2 },
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
