import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppText } from './Text';
import { COLORS, RADIUS, SPACING } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { RootStackParamList } from '../../navigation/types';

/**
 * Fixed bar at the bottom of every admin screen, replacing the old tab
 * bar. The hamburger opens the account menu (currently just log out —
 * more admin-level actions land here later); the black button on its
 * side is each screen's one primary action.
 *
 * Kept always visible (no hide-on-scroll) since it's the only way to
 * log out — a bar that disappears while scrolling would strand the
 * user without it.
 */
export function AdminBottomBar({
  actionLabel,
  actionIcon,
  onAction,
}: {
  actionLabel: string;
  actionIcon: React.ComponentProps<typeof Ionicons>['name'];
  onAction: () => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [menuOpen, setMenuOpen] = useState(false);

  const logout = async () => {
    setMenuOpen(false);
    await supabase.auth.signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.hamburger}
        activeOpacity={0.8}
        onPress={() => setMenuOpen(true)}
      >
        <Ionicons name="menu" size={22} color={COLORS.text} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.action} activeOpacity={0.85} onPress={onAction}>
        <Ionicons name={actionIcon} size={18} color={COLORS.textInverse} />
        <AppText weight="bold" style={styles.actionText}>
          {actionLabel}
        </AppText>
      </TouchableOpacity>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menu} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={logout}>
              <Ionicons name="log-out-outline" size={19} color={COLORS.dangerText} />
              <AppText weight="bold" style={styles.menuItemText}>
                התנתקות
              </AppText>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.lg,
    paddingBottom: 30,
  },
  hamburger: {
    width: 54,
    height: 54,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  action: {
    flex: 1,
    height: 54,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.text,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  actionText: { color: COLORS.textInverse, fontSize: 15 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  menu: {
    margin: SPACING.lg,
    marginBottom: 96,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.sm,
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
    paddingVertical: 13,
    paddingHorizontal: SPACING.md,
  },
  menuItemText: { fontSize: 14.5, color: COLORS.dangerText },
});
