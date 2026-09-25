import React from 'react';
import { View, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, AppText, BackButton } from '../components/ui';
import { AdminGradientBackground } from '../components/admin/AdminGradientBackground';
import { SPACING, BRAND } from '../lib/theme';
import { MENU_CARD_SHADOW, MENU_COLORS, MENU_FONT, MENU_TYPO } from '../components/menu/menuTheme';
import { supabase } from '../lib/supabase';
import { showAlert } from '../lib/platformAlert';
import { useCompany } from '../lib/CompanyContext';
import { RootStackParamList } from '../navigation/types';
import { useIsDesktop } from '../lib/useDesktopLayout';
import { BrandLogo } from '../components/ui/Brand';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DriverMenuMobile } from './driver/DriverMenuMobile';
import { countUnreadNotifications } from '../lib/adminApi';
import { listSignatureRequests } from '../lib/docuseal';

/**
 * Full-screen menu reached from the home screen's menu button — replaces
 * the old per-role dropdowns (DriverMenuButton / AdminMenuButton). Same
 * screen instance for both roles, item list swapped by profile.role.
 *
 * Visual language follows the pasted "מסך תפריט" spec: iOS-style grouped
 * cards (profile card + nav-group card + logout card) rather than this
 * app's usual flat ScreenHeader list — a deliberate one-off per that spec.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'Menu'>;

type MenuItem = {
  key: keyof RootStackParamList;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
};

const DRIVER_ITEMS: MenuItem[] = [
  { key: 'DriverProfile', icon: 'person-outline', label: 'הפרטים שלי' },
  { key: 'DriverDocuments', icon: 'folder-outline', label: 'המסמכים שלי' },
  { key: 'NotificationPreferences', icon: 'notifications-outline', label: 'ניהול התראות' },
];

const OWNER_ITEMS: MenuItem[] = [
  { key: 'AdminProfile', icon: 'person-outline', label: 'הפרטים שלי' },
  { key: 'Departments', icon: 'business-outline', label: 'מחלקות' },
  { key: 'NotificationPreferences', icon: 'notifications-outline', label: 'ניהול התראות' },
];

const ADMIN_ITEMS: MenuItem[] = [
  ...OWNER_ITEMS.slice(0, 2),
  { key: 'Reports', icon: 'document-text-outline', label: 'ייצוא דוחות' },
  { key: 'CompanyDocuments', icon: 'folder-outline', label: 'מסמכי חברה' },
  OWNER_ITEMS[2],
];

const ROLE_LABEL: Record<string, string> = {
  owner: 'בעל החברה',
  admin: 'מנהל מערכת',
  driver: 'נהג',
};

export default function MenuScreen({ navigation }: Props) {
  const { profile, company } = useCompany();
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const isDriver = profile?.role === 'driver';
  const [counts, setCounts] = React.useState({ unread: 0, signatures: 0 });

  // Live counts beside the driver's menu items; the menu works without them.
  React.useEffect(() => {
    if (!isDriver || isDesktop) return;
    let alive = true;
    Promise.all([
      company?.id ? countUnreadNotifications(company.id).catch(() => 0) : Promise.resolve(0),
      listSignatureRequests()
        .then((rows) => rows.filter((r) => r.status === 'pending' && !!r.docuseal_submitter_slug).length)
        .catch(() => 0),
    ]).then(([unread, signatures]) => alive && setCounts({ unread, signatures }));
    return () => {
      alive = false;
    };
  }, [company?.id, isDesktop, isDriver]);

  // The desktop sidebar already exposes every item this menu offers, so
  // this screen (reached via the mobile hamburger button, which doesn't
  // exist on desktop) has nothing left to add there — send anyone who
  // still lands on its URL straight to the one destination it always led
  // to anyway: the signed-in user's own profile.
  React.useEffect(() => {
    if (isDesktop) {
      navigation.replace(profile?.role === 'driver' ? 'DriverProfile' : 'AdminProfile');
    }
  }, [isDesktop, navigation, profile?.role]);
  if (isDesktop) return null;

  const items =
    profile?.role === 'driver'
      ? DRIVER_ITEMS
      : profile?.role === 'admin'
        ? ADMIN_ITEMS
        : OWNER_ITEMS;

  const navigateToItem = (item: MenuItem) => {
    switch (item.key) {
      case 'DriverProfile':
        navigation.navigate('DriverProfile');
        break;
      case 'DriverDocuments':
        navigation.navigate('DriverDocuments');
        break;
      case 'AdminProfile':
        navigation.navigate('AdminProfile');
        break;
      case 'Departments':
        navigation.navigate('Departments');
        break;
      case 'Reports':
        navigation.navigate('Reports');
        break;
      case 'CompanyDocuments':
        navigation.navigate('CompanyDocuments');
        break;
      case 'AdminDocumentSigning':
        navigation.navigate('AdminDocumentSigning');
        break;
      case 'NotificationPreferences':
        navigation.navigate('NotificationPreferences');
        break;
    }
  };


  const completeLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch {
      showAlert('ההתנתקות נכשלה', 'נסה שוב בעוד רגע.');
    }
  };

  const logout = () => {
    showAlert('התנתקות', 'האם אתה בטוח שברצונך להתנתק מהחשבון?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'התנתק', style: 'destructive', onPress: completeLogout },
    ]);
  };

  const initials = (profile?.full_name || '?').trim().charAt(0);
  const subtitle = profile?.job_title || (profile?.role ? ROLE_LABEL[profile.role] : '');

  if (isDriver) {
    return (
      <DriverMenuMobile
        insetTop={insets.top}
        insetBottom={insets.bottom}
        name={profile?.full_name || ''}
        subtitle={subtitle}
        companyName={company?.name || ''}
        unreadNotifications={counts.unread}
        pendingSignatures={counts.signatures}
        onBack={() => navigation.goBack()}
        onProfile={() => navigation.navigate('DriverProfile')}
        onDocuments={() => navigation.navigate('DriverDocuments')}
        onSigning={() => navigation.navigate('DriverSigningDocuments')}
        onNotifications={() => navigation.navigate('Notifications')}
        onNotificationSettings={() => navigation.navigate('NotificationPreferences')}
        onLogout={logout}
      />
    );
  }

  return (
    <Screen style={styles.adminScreen}>
      <AdminGradientBackground />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <BackButton onPress={() => navigation.goBack()} />
          <BrandLogo height={22} />
        </View>

        <TouchableOpacity
          style={styles.profileCard}
          activeOpacity={0.7}
          onPress={() => navigation.navigate(profile?.role === 'driver' ? 'DriverProfile' : 'AdminProfile')}
          accessibilityRole="button"
          accessibilityLabel={`${profile?.full_name || 'ללא שם'}${subtitle ? `, ${subtitle}` : ''}`}
        >
          <View style={styles.avatar}>
            <AppText weight="bold" style={styles.avatarLetter}>
              {initials}
            </AppText>
          </View>
          <View style={styles.profileText}>
            <AppText weight="bold" style={MENU_TYPO.profileName} numberOfLines={1}>
              {profile?.full_name || 'ללא שם'}
            </AppText>
            {!!subtitle && (
              <AppText style={[MENU_TYPO.profileSubtitle, styles.profileSubtitle]} numberOfLines={1}>
                {subtitle}
              </AppText>
            )}
          </View>
          <Ionicons name="chevron-back" size={18} color={MENU_COLORS.textMuted} />
        </TouchableOpacity>

        <View style={styles.navCard}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.row, index === items.length - 1 && styles.rowLast]}
              activeOpacity={0.6}
              onPress={() => navigateToItem(item)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <Ionicons name="chevron-back" size={16} color={MENU_COLORS.chevron} />
              <AppText style={[MENU_TYPO.row, styles.rowLabel]} numberOfLines={1}>
                {item.label}
              </AppText>
              <View style={styles.iconWrap}>
                <Ionicons name={item.icon} size={22} color={MENU_COLORS.text} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.logoutCard}>
          <TouchableOpacity
            style={styles.logoutRow}
            activeOpacity={0.6}
            onPress={logout}
            accessibilityRole="button"
            accessibilityLabel="התנתקות"
          >
            <AppText style={[MENU_TYPO.row, styles.logoutLabel]} numberOfLines={1}>
              התנתקות
            </AppText>
            <Ionicons name="log-out-outline" size={22} color={MENU_COLORS.dangerText} />
          </TouchableOpacity>
        </View>

        <AppText style={[MENU_TYPO.version, styles.version]}>icar · גרסה 1.0.0</AppText>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: MENU_COLORS.background },
  adminScreen: { backgroundColor: BRAND.screenBg },
  safe: { flex: 1 },
  version: { textAlign: 'center', marginTop: SPACING.lg },
  topBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  profileCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
    padding: SPACING.md,
    borderRadius: 18,
    backgroundColor: MENU_COLORS.background,
    borderWidth: 1,
    borderColor: MENU_COLORS.cardBorder,
    ...MENU_CARD_SHADOW,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: MENU_COLORS.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#FFFFFF', fontSize: 19 },
  profileText: { flex: 1, gap: 3 },
  profileSubtitle: {},
  navCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    borderRadius: 18,
    backgroundColor: MENU_COLORS.background,
    borderWidth: 1,
    borderColor: MENU_COLORS.cardBorder,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: SPACING.md,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: MENU_COLORS.divider,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { flex: 1, textAlign: 'right' },
  iconWrap: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -7,
    left: -9,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 3,
    borderRadius: 9,
    backgroundColor: MENU_COLORS.dangerText,
    borderWidth: 1.5,
    borderColor: MENU_COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: MENU_FONT.bold, fontSize: 10, color: '#FFFFFF', lineHeight: 12 },
  logoutCard: {
    marginHorizontal: SPACING.lg,
    borderRadius: 18,
    backgroundColor: MENU_COLORS.background,
    borderWidth: 1,
    borderColor: MENU_COLORS.cardBorder,
    overflow: 'hidden',
  },
  logoutRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: SPACING.md,
    paddingVertical: 16,
  },
  logoutLabel: { flex: 1, textAlign: 'right', color: MENU_COLORS.dangerText },
});
