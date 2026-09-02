import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../ui';
import { SPACING, expiryState, daysUntilExpiry, formatDate } from '../../lib/theme';
import { DriverRow } from '../../lib/adminApi';
import { formatPlate } from '../../lib/plate';
import { FLEET_COLORS, FLEET_FONT, FLEET_SHADOWS, severityFor } from './fleetTheme';

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
  const severity = severityFor(state);

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
        <AppText style={styles.emailText} numberOfLines={1}>
          {item.email || 'ללא אימייל'}
        </AppText>
        <View style={styles.licenseRow}>
          <View style={[styles.dot, { backgroundColor: severity.text }]} />
          <AppText style={[styles.licenseText, { color: severity.text }]} numberOfLines={1}>
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
        <TouchableOpacity
          style={styles.callBtn}
          onPress={onCall}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`התקשר אל ${item.full_name ?? 'הנהג'}`}
        >
          <Ionicons name="call-outline" size={17} color={FLEET_COLORS.success.text} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: FLEET_COLORS.card,
    borderRadius: 30,
    padding: SPACING.md,
    marginHorizontal: SPACING.lg,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
    ...FLEET_SHADOWS.card,
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(10,132,255,.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 17, color: FLEET_COLORS.primary, fontFamily: FLEET_FONT.bold },
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
    backgroundColor: FLEET_COLORS.card,
    borderWidth: 1.5,
    borderColor: FLEET_COLORS.card,
    shadowColor: '#08245e',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  gradeBadgeWarn: { backgroundColor: FLEET_COLORS.warning.tint },
  gradeText: { fontSize: 10, color: FLEET_COLORS.textSecondary, fontFamily: FLEET_FONT.bold },
  gradeTextWarn: { color: FLEET_COLORS.warning.text },

  cardTitleWrap: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 15, color: FLEET_COLORS.textPrimary, fontFamily: FLEET_FONT.bold },
  cardSubtitle: { fontSize: 12, color: FLEET_COLORS.textSecondary, fontFamily: FLEET_FONT.regular },
  emailText: { fontSize: 11.5, color: FLEET_COLORS.textSecondary, fontFamily: FLEET_FONT.regular },
  licenseRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginTop: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  licenseText: { fontSize: 11, fontFamily: FLEET_FONT.regular },
  vehicleLink: { fontSize: 11.5, color: FLEET_COLORS.primary, marginTop: 3, fontFamily: FLEET_FONT.regular },

  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: FLEET_COLORS.success.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
