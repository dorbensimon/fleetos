import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../ui';
import { COLORS, RADIUS, SPACING, CARD_SHADOW, SUBTLE_SHADOW, expiryState, daysUntilExpiry, formatDate } from '../../lib/theme';
import { DriverRow } from '../../lib/adminApi';
import { formatPlate } from '../../lib/plate';

export function DriverCard({
  item,
  onPress,
  onPressVehicle,
  onCall,
}: {
  item: DriverRow;
  onPress: () => void;
  onPressVehicle: () => void;
  onCall: () => void;
}) {
  const state = expiryState(item.license_expiry);
  const warn = state === 'soon' || state === 'expired';
  const days = daysUntilExpiry(item.license_expiry);
  const licenseText = !item.license_expiry
    ? 'ללא תוקף רישיון'
    : state === 'expired'
    ? 'רישיון פג תוקף'
    : state === 'soon'
    ? `רישיון יפוג בעוד ${days} ${days === 1 ? 'יום' : 'ימים'}`
    : `רישיון בתוקף עד ${formatDate(item.license_expiry)}`;
  const licenseColor = state === 'expired' ? COLORS.dangerText : state === 'soon' ? COLORS.warnText : COLORS.okText;

  return (
    <TouchableOpacity activeOpacity={0.85} style={styles.card} onPress={onPress}>
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <AppText weight="bold" style={styles.avatarText}>
            {(item.full_name ?? '?').trim().charAt(0)}
          </AppText>
        </View>
        {!!item.license_classes && (
          <View style={[styles.gradeBadge, warn && styles.gradeBadgeWarn]}>
            <AppText weight="bold" style={[styles.gradeText, warn && styles.gradeTextWarn]}>
              {item.license_classes}
            </AppText>
          </View>
        )}
      </View>

      <View style={styles.cardTitleWrap}>
        <AppText weight="bold" style={styles.cardTitle} numberOfLines={1}>
          {item.full_name ?? 'ללא שם'}
        </AppText>
        <AppText style={styles.cardSubtitle} numberOfLines={1}>
          {item.national_id ? `ת.ז ${item.national_id}` : 'ללא ת.ז'}
        </AppText>
        <View style={styles.licenseRow}>
          <View style={[styles.dot, { backgroundColor: licenseColor }]} />
          <AppText style={[styles.licenseText, { color: licenseColor }]} numberOfLines={1}>
            {licenseText}
          </AppText>
        </View>
        {item.vehicle_id && item.vehicle_plate && (
          <TouchableOpacity
            hitSlop={4}
            onPress={(e) => {
              e.stopPropagation();
              onPressVehicle();
            }}
          >
            <AppText style={styles.vehicleLink} numberOfLines={1}>
              רכב: {formatPlate(item.vehicle_plate)}
            </AppText>
          </TouchableOpacity>
        )}
      </View>

      {!!item.phone && (
        <TouchableOpacity style={styles.callBtn} onPress={onCall} hitSlop={8}>
          <Ionicons name="call-outline" size={17} color={COLORS.okText} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginHorizontal: SPACING.lg,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
    ...CARD_SHADOW,
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 17, color: COLORS.accent },
  gradeBadge: {
    position: 'absolute',
    bottom: -4,
    left: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: COLORS.card,
    ...SUBTLE_SHADOW,
  },
  gradeBadgeWarn: { backgroundColor: COLORS.warnBg },
  gradeText: { fontSize: 10, color: COLORS.textMuted },
  gradeTextWarn: { color: COLORS.warnText },

  cardTitleWrap: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 15 },
  cardSubtitle: { fontSize: 12, color: COLORS.textFaint },
  licenseRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginTop: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  licenseText: { fontSize: 11 },
  vehicleLink: { fontSize: 11.5, color: COLORS.accent, marginTop: 3 },

  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.okBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
