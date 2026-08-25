import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { AppText, Badge } from '../ui';
import { COLORS, RADIUS, SPACING, CARD_SHADOW, daysUntilExpiry, formatDate } from '../../lib/theme';
import { Vehicle, VehicleDriverWithProfile, ComplianceItem } from '../../lib/adminApi';
import { VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '../../lib/compliance';
import { formatPlate } from '../../lib/plate';
import {
  TONE_BAD,
  YEAR_DAYS,
  SERVICE_WARN_KM,
  remainingTone,
  remainingRatio,
  worstTone,
  chipFor,
} from '../../lib/fleetCardHelpers';
import { StatCell, statsRowStyles } from './StatCell';

export function VehicleCard({
  item,
  compliance,
  vehicleDrivers,
  departmentNames,
  onPress,
  onRestore,
}: {
  item: Vehicle;
  compliance: Map<string, ComplianceItem[]>;
  vehicleDrivers: Map<string, VehicleDriverWithProfile[]>;
  departmentNames: Map<string, string>;
  onPress: () => void;
  onRestore: () => void;
}) {
  const expiryOf = (itemType: string) => compliance.get(item.id)?.find((c) => c.item_type === itemType)?.expiry_date ?? null;

  const insurance = expiryOf('insurance_mandatory');
  const test = expiryOf('annual_test');
  const assignedDrivers = vehicleDrivers.get(item.id) ?? [];
  const driverName = assignedDrivers.find((d) => d.is_primary)?.full_name ?? assignedDrivers[0]?.full_name ?? null;
  const extraDriverCount = Math.max(0, assignedDrivers.length - (driverName ? 1 : 0));
  const departmentName = item.department_id ? departmentNames.get(item.department_id) : null;
  const isArchived = item.status === 'archived';

  const insDays = daysUntilExpiry(insurance);
  const testDays = daysUntilExpiry(test);
  const kmToService = item.next_service_km != null ? item.next_service_km - item.odometer : null;
  const svcTotalKm =
    item.service_interval_km ??
    (item.next_service_km != null ? item.next_service_km - item.last_service_km : null) ??
    10000;

  const insTone = remainingTone(insDays, 30);
  const testTone = remainingTone(testDays, 30);
  const svcOverdue = kmToService != null && kmToService <= 0;
  const svcTone = remainingTone(kmToService, SERVICE_WARN_KM);
  const worst = worstTone([insTone, testTone, svcTone]);
  const badItems: string[] = [];
  if (insTone === TONE_BAD) badItems.push('ביטוח');
  if (testTone === TONE_BAD) badItems.push('טסט');
  if (svcTone === TONE_BAD) badItems.push('טיפול');
  const chip = chipFor(worst, badItems);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.card, worst === TONE_BAD && !isArchived && styles.cardAlert]}
      onPress={onPress}
    >
      <View style={styles.cardTop}>
        <View style={styles.plate}>
          <View style={styles.plateFlag}>
            <AppText weight="bold" style={styles.plateFlagText}>
              IL
            </AppText>
          </View>
          <AppText weight="bold" style={styles.plateText}>
            {formatPlate(item.plate_number)}
          </AppText>
        </View>

        <View style={styles.cardTitleWrap}>
          <View style={styles.titleRow}>
            <AppText weight="bold" style={styles.cardTitle} numberOfLines={1}>
              {[item.manufacturer, item.model].filter(Boolean).join(' ') || 'ללא דגם'}
            </AppText>
            {!isArchived && (
              <View style={[styles.chip, { backgroundColor: chip.bg }]}>
                <AppText weight="bold" style={[styles.chipText, { color: chip.fg }]} numberOfLines={1}>
                  {chip.label}
                </AppText>
              </View>
            )}
          </View>
          <AppText style={styles.cardSubtitle} numberOfLines={1}>
            {driverName ? `נהג: ${driverName}` : 'ללא נהג'}
            {extraDriverCount > 0 ? ` (+${extraDriverCount})` : ''}
            {departmentName ? ` · מח': ${departmentName}` : ''}
            {` · סוג: ${VEHICLE_TYPE_LABELS[item.vehicle_type] ?? item.vehicle_type}`}
          </AppText>
        </View>

        {item.status !== 'active' && (
          <Badge
            label={VEHICLE_STATUS_LABELS[item.status] ?? item.status}
            bg={item.status === 'maintenance' || item.status === 'disabled' ? COLORS.dangerBg : COLORS.neutralBg}
            fg={item.status === 'maintenance' || item.status === 'disabled' ? COLORS.dangerText : COLORS.neutralText}
          />
        )}
      </View>

      {isArchived ? (
        <TouchableOpacity
          style={styles.restoreBtn}
          activeOpacity={0.8}
          onPress={(e) => {
            e.stopPropagation();
            onRestore();
          }}
        >
          <AppText weight="bold" style={styles.restoreText}>
            שחזר מארכיון
          </AppText>
        </TouchableOpacity>
      ) : (
        <View style={statsRowStyles.statsRow}>
          <StatCell
            label="ביטוח"
            value={insurance ? formatDate(insurance) : 'חסר'}
            note={insDays == null ? 'חסר' : insDays < 0 ? 'פג תוקף' : `${insDays} ימים`}
            tone={insTone}
            ratio={remainingRatio(insDays, YEAR_DAYS)}
            showDivider
          />
          <StatCell
            label="טסט"
            value={test ? formatDate(test) : 'חסר'}
            note={testDays == null ? 'חסר' : testDays < 0 ? 'פג תוקף' : `${testDays} ימים`}
            tone={testTone}
            ratio={remainingRatio(testDays, YEAR_DAYS)}
            showDivider
          />
          <StatCell
            label="טיפול"
            value={item.next_service_km != null ? `${item.next_service_km.toLocaleString()} ק״מ` : 'חסר'}
            note={kmToService == null ? 'חסר' : svcOverdue ? 'פג תוקף' : `בעוד ${kmToService.toLocaleString()} ק״מ`}
            tone={svcTone}
            ratio={remainingRatio(kmToService, svcTotalKm)}
          />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    overflow: 'hidden',
    ...CARD_SHADOW,
  },
  cardAlert: { shadowColor: TONE_BAD, shadowOpacity: 0.18 },

  cardTop: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: SPACING.md,
    padding: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  cardTitleWrap: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  cardTitle: { fontSize: 15.5, flexShrink: 1 },
  cardSubtitle: { fontSize: 11.5, color: COLORS.textFaint },
  chip: { flexShrink: 0, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 10.5 },

  plate: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    backgroundColor: '#F5C518',
    borderRadius: 6,
    overflow: 'hidden',
  },
  plateFlag: {
    backgroundColor: '#1B4CA1',
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateFlagText: { color: '#FFFFFF', fontSize: 9 },
  plateText: { fontSize: 13, color: '#1A1A1A', paddingHorizontal: 8, paddingVertical: 5 },

  restoreBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accentSoft,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  restoreText: { fontSize: 13, color: COLORS.accent },
});
