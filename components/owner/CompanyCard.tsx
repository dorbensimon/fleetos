import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Company } from '../../lib/supabase';
import { COLORS, AVATAR_PALETTE } from './ownerTheme';

export type CompanyRow = Company & { admins: number; drivers: number };

export function CompanyCard({
  item,
  index,
  onPress,
  onMenuPress,
}: {
  item: CompanyRow;
  index: number;
  onPress: () => void;
  onMenuPress: () => void;
}) {
  const active = item.status === 'active';
  const avatarColor = active ? AVATAR_PALETTE[index % AVATAR_PALETTE.length] : '#E6E6E6';
  const avatarTextColor = active ? COLORS.white : COLORS.grayLight;

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={onPress}>
      {item.logo_url ? (
        <Image source={{ uri: item.logo_url }} style={styles.avatar} resizeMode="cover" />
      ) : (
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={[styles.avatarText, { color: avatarTextColor }]}>{item.name.trim().charAt(0)}</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={[styles.badge, active ? styles.badgeActive : styles.badgeDisabled]}>
            <Text style={[styles.badgeText, active ? styles.badgeTextActive : styles.badgeTextDisabled]}>
              {active ? 'פעיל' : 'מושבת'}
            </Text>
          </View>
        </View>
        <View style={styles.cardMetaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="shield-outline" size={13} color={COLORS.grayLight} />
            <Text style={styles.metaText}>{item.admins} אדמינים</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="car-outline" size={13} color={COLORS.grayLight} />
            <Text style={styles.metaText}>{item.drivers} נהגים</Text>
          </View>
        </View>
      </View>
      <TouchableOpacity style={styles.menuButton} onPress={onMenuPress}>
        <Ionicons name="ellipsis-vertical" size={18} color={COLORS.grayLight} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '600' },
  cardBody: { flex: 1, gap: 5 },
  cardTopRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 15.5, fontWeight: '600', color: COLORS.black, flexShrink: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 6 },
  badgeActive: { backgroundColor: COLORS.activeBg },
  badgeDisabled: { backgroundColor: COLORS.disabledBg },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextActive: { color: COLORS.activeText },
  badgeTextDisabled: { color: COLORS.disabledText },
  cardMetaRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12.5, color: COLORS.gray },
  menuButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
