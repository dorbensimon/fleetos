import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppText } from './Text';
import { COLORS, RADIUS, SPACING } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useCompany } from '../../lib/CompanyContext';
import { countUnreadNotifications } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';

/**
 * The hamburger button that lives in every admin header's top-left
 * corner. The bell badge is red with the unread count while there are
 * unread notifications, and turns grey once it's 0 — refetched on
 * every focus so it updates right after leaving the Notifications
 * screen (which is what actually marks things read).
 */
export function AdminMenuButton() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { companyId } = useCompany();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!companyId) return;
    setUnread(await countUnreadNotifications(companyId));
  }, [companyId]);

  useFocusEffect(
    useCallback(() => {
      refreshUnread();
    }, [refreshUnread])
  );

  useEffect(() => {
    refreshUnread();
  }, [refreshUnread]);

  const logout = async () => {
    setMenuOpen(false);
    await supabase.auth.signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <>
      <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={() => setMenuOpen(true)}>
        <Ionicons name="menu" size={19} color={COLORS.text} />
      </TouchableOpacity>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuAnchor}>
            <Pressable style={styles.menu} onPress={(e) => e.stopPropagation()}>
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => {
                  setMenuOpen(false);
                  navigation.navigate('Notifications');
                }}
              >
                <View style={styles.bellWrap}>
                  <Ionicons name="notifications-outline" size={19} color={COLORS.text} />
                  <View style={[styles.badge, unread === 0 && styles.badgeRead]}>
                    <AppText weight="bold" style={styles.badgeText}>
                      {unread}
                    </AppText>
                  </View>
                </View>
                <AppText weight="bold" style={styles.menuItemTextNeutral}>
                  התראות
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => {
                  setMenuOpen(false);
                  navigation.navigate('AdminProfile');
                }}
              >
                <Ionicons name="person-outline" size={19} color={COLORS.text} />
                <AppText weight="bold" style={styles.menuItemTextNeutral}>
                  הפרטים שלי
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => {
                  setMenuOpen(false);
                  navigation.navigate('Departments');
                }}
              >
                <Ionicons name="business-outline" size={19} color={COLORS.text} />
                <AppText weight="bold" style={styles.menuItemTextNeutral}>
                  מחלקות
                </AppText>
              </TouchableOpacity>

              <View style={styles.menuDivider} />

              <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={logout}>
                <Ionicons name="log-out-outline" size={19} color={COLORS.dangerText} />
                <AppText weight="bold" style={styles.menuItemText}>
                  התנתקות
                </AppText>
              </TouchableOpacity>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  menuAnchor: { position: 'absolute', top: 100, left: SPACING.lg },
  menu: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.sm,
    minWidth: 160,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  menuItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
  },
  menuItemText: { fontSize: 14.5, color: COLORS.dangerText },
  menuItemTextNeutral: { fontSize: 14.5, color: COLORS.text },
  menuDivider: { height: 1, backgroundColor: COLORS.divider, marginVertical: 4 },

  bellWrap: { position: 'relative' },
  badge: {
    position: 'absolute',
    top: -7,
    right: -9,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: COLORS.dangerText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRead: { backgroundColor: COLORS.textFaint },
  badgeText: { fontSize: 9.5, color: COLORS.textInverse },
});
