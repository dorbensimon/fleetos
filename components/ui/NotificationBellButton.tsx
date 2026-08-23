import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppText } from './Text';
import { COLORS } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { countUnreadNotifications } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';

/**
 * The bell button that sits next to the hamburger menu in every admin
 * header, one tap away from Notifications instead of buried inside the
 * menu — the badge count is the whole reason an admin looks up here.
 */
export function NotificationBellButton() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { companyId } = useCompany();
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

  return (
    <TouchableOpacity
      style={styles.button}
      activeOpacity={0.8}
      onPress={() => navigation.navigate('Notifications')}
    >
      <Ionicons name="notifications-outline" size={19} color={COLORS.text} />
      <View style={[styles.badge, unread === 0 && styles.badgeRead]}>
        <AppText weight="bold" style={styles.badgeText}>
          {unread}
        </AppText>
      </View>
    </TouchableOpacity>
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
  badge: {
    position: 'absolute',
    top: -6,
    left: -6,
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
