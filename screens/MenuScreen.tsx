import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, AppText } from '../components/ui';
import { AdminGradientBackground } from '../components/admin/AdminGradientBackground';
import { SPACING } from '../lib/theme';
import { MENU_CARD_SHADOW, MENU_COLORS, MENU_FONT, MENU_TYPO } from '../components/menu/menuTheme';
import { supabase } from '../lib/supabase';
import { useCompany } from '../lib/CompanyContext';
import { listSignatureRequests } from '../lib/docuseal';
import { RootStackParamList } from '../navigation/types';

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
  badgeKey?: 'pendingSigning';
};

const DRIVER_ITEMS: MenuItem[] = [
  { key: 'DriverProfile', icon: 'person-outline', label: 'הפרטים שלי' },
  { key: 'NotificationPreferences', icon: 'notifications-outline', label: 'ניהול התראות' },
];

const OWNER_ITEMS: MenuItem[] = [
  { key: 'AdminProfile', icon: 'person-outline', label: 'הפרטים שלי' },
  { key: 'Departments', icon: 'business-outline', label: 'מחלקות' },
  { key: 'NotificationPreferences', icon: 'notifications-outline', label: 'ניהול התראות' },
];

const ADMIN_ITEMS: MenuItem[] = [
  ...OWNER_ITEMS.slice(0, 2),
  { key: 'AdminDocumentSigning', icon: 'document-text-outline', label: 'מסמכים לחתימה', badgeKey: 'pendingSigning' },
  OWNER_ITEMS[2],
];

const ROLE_LABEL: Record<string, string> = {
  owner: 'בעל החברה',
  admin: 'מנהל מערכת',
  driver: 'נהג',
};

export default function MenuScreen({ navigation }: Props) {
  const { profile, companyId } = useCompany();
  const [pendingSigningCount, setPendingSigningCount] = useState(0);
  const isAdmin = profile?.role === 'admin';

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
      case 'AdminProfile':
        navigation.navigate('AdminProfile');
        break;
      case 'Departments':
        navigation.navigate('Departments');
        break;
      case 'AdminDocumentSigning':
        navigation.navigate('AdminDocumentSigning');
        break;
      case 'NotificationPreferences':
        navigation.navigate('NotificationPreferences');
        break;
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!isAdmin || !companyId) return;
      let cancelled = false;
      listSignatureRequests(companyId)
        .then((requests) => {
          if (cancelled) return;
          setPendingSigningCount(requests.filter((r) => r.status === 'pending').length);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [isAdmin, companyId])
  );

  const logout = async () => {
    await supabase.auth.signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const initials = (profile?.full_name || '?').trim().charAt(0);
  const subtitle = profile?.job_title || (profile?.role ? ROLE_LABEL[profile.role] : '');

  return (
    <Screen style={styles.screen}>
      {isAdmin && <AdminGradientBackground />}
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} activeOpacity={0.7} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-forward" size={19} color={MENU_COLORS.text} />
          </TouchableOpacity>
          <AppText style={MENU_TYPO.version}>גרסה 1.0.0</AppText>
        </View>

        <AppText style={[MENU_TYPO.title, styles.title]}>תפריט</AppText>

        <TouchableOpacity
          style={styles.profileCard}
          activeOpacity={0.7}
            onPress={() => navigation.navigate(profile?.role === 'driver' ? 'DriverProfile' : 'AdminProfile')}
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
            >
              <Ionicons name="chevron-back" size={16} color={MENU_COLORS.chevron} />
              <AppText style={[MENU_TYPO.row, styles.rowLabel]} numberOfLines={1}>
                {item.label}
              </AppText>
              <View style={styles.iconWrap}>
                <Ionicons name={item.icon} size={22} color={MENU_COLORS.text} />
                {item.badgeKey === 'pendingSigning' && pendingSigningCount > 0 && (
                  <View style={styles.badge}>
                    <AppText style={styles.badgeText} numberOfLines={1}>
                      {pendingSigningCount > 99 ? '99+' : pendingSigningCount}
                    </AppText>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.logoutCard}>
          <TouchableOpacity style={styles.logoutRow} activeOpacity={0.6} onPress={logout}>
            <AppText style={[MENU_TYPO.row, styles.logoutLabel]} numberOfLines={1}>
              התנתקות
            </AppText>
            <Ionicons name="log-out-outline" size={22} color={MENU_COLORS.dangerText} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: MENU_COLORS.background },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: MENU_COLORS.backBtnBg,
    borderWidth: 1,
    borderColor: MENU_COLORS.backBtnBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'right',
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  profileCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
    marginHorizontal: SPACING.lg,
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
