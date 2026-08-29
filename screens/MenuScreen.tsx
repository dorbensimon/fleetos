import React from 'react';
import { View, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, AppText } from '../components/ui';
import { COLORS, SPACING } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { useCompany } from '../lib/CompanyContext';
import { RootStackParamList } from '../navigation/types';

/**
 * Full-screen menu reached from the home screen's menu button — replaces
 * the old per-role dropdowns (DriverMenuButton / AdminMenuButton). Same
 * screen instance for both roles, item list swapped by profile.role.
 *
 * Layout intentionally mirrors a big-app "account settings" list (large
 * title under a standalone circular back button, flat spaced rows with
 * the icon on the trailing edge and the chevron on the leading edge, no
 * card/dividers between rows) rather than this app's usual ScreenHeader +
 * card-list pattern — a deliberate one-off per design direction.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'Menu'>;

type MenuItem = { key: keyof RootStackParamList; icon: keyof typeof Ionicons.glyphMap; label: string };

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
  { key: 'AdminDocumentSigning', icon: 'document-text-outline', label: 'מסמכים לחתימה' },
  OWNER_ITEMS[2],
];

export default function MenuScreen({ navigation }: Props) {
  const { profile } = useCompany();
  const items =
    profile?.role === 'driver'
      ? DRIVER_ITEMS
      : profile?.role === 'admin'
        ? ADMIN_ITEMS
        : OWNER_ITEMS;

  const logout = async () => {
    await supabase.auth.signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <Screen>
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} activeOpacity={0.7} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-forward" size={20} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <AppText weight="bold" style={styles.title}>
          תפריט
        </AppText>

        <View style={styles.list}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate(item.key as any)}
            >
              <Ionicons name="chevron-back" size={20} color={COLORS.textFaint} />
              <AppText style={styles.rowLabel} numberOfLines={1}>
                {item.label}
              </AppText>
              <Ionicons name={item.icon} size={22} color={COLORS.text} />
            </TouchableOpacity>
          ))}

          <View style={styles.divider} />

          <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={logout}>
            <View style={{ width: 20 }} />
            <AppText style={[styles.rowLabel, styles.logoutLabel]} numberOfLines={1}>
              התנתקות
            </AppText>
            <Ionicons name="log-out-outline" size={22} color={COLORS.dangerText} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { flexDirection: 'row-reverse', paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 30,
    textAlign: 'right',
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  list: { paddingHorizontal: SPACING.lg },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 18,
  },
  rowLabel: { flex: 1, fontSize: 16, color: COLORS.text, textAlign: 'right' },
  divider: { height: 1, backgroundColor: COLORS.divider, marginVertical: SPACING.sm },
  logoutLabel: { color: COLORS.dangerText },
});
