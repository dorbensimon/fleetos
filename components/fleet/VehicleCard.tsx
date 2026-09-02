import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { AppText, Badge } from '../ui';
import { RADIUS, SPACING, daysUntilExpiry, formatDate } from '../../lib/theme';
import { Vehicle, VehicleDriverWithProfile, ComplianceItem } from '../../lib/adminApi';
import {
  VEHICLE_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  complianceBadgeLabel,
  complianceBadgeState,
  complianceRemainingDays,
  findComplianceDef,
} from '../../lib/compliance';
import { formatPlate } from '../../lib/plate';
import {
  TONE_BAD,
  TONE_OK,
  YEAR_DAYS,
  SERVICE_WARN_KM,
  remainingTone,
  remainingRatio,
  worstTone,
  chipFor,
} from '../../lib/fleetCardHelpers';
import { StatCell, statsRowStyles } from './StatCell';
import { FLEET_COLORS, FLEET_FONT, FLEET_SHADOWS } from './fleetTheme';

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
  const insuranceItem = compliance.get(item.id)?.find((c) => c.item_type === 'insurance_mandatory') ?? null;
  const testItem = compliance.get(item.id)?.find((c) => c.item_type === 'annual_test') ?? null;
  const insurance = insuranceItem?.expiry_date ?? null;
  const testDef = findComplianceDef('vehicle', 'annual_test');
  const test = testItem?.expiry_date ?? null;
  const assignedDrivers = vehicleDrivers.get(item.id) ?? [];
  const driverName = assignedDrivers.find((d) => d.is_primary)?.full_name ?? assignedDrivers[0]?.full_name ?? null;
  const extraDriverCount = Math.max(0, assignedDrivers.length - (driverName ? 1 : 0));
  const departmentName = item.department_id ? departmentNames.get(item.department_id) : null;
  const isArchived = item.status === 'archived';

  const insDays = daysUntilExpiry(insurance);
  const testDays = testDef ? complianceRemainingDays(testDef, testItem) : daysUntilExpiry(test);
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
            bg={item.status === 'maintenance' || item.status === 'disabled' ? FLEET_COLORS.danger.tint : FLEET_COLORS.none.tint}
            fg={item.status === 'maintenance' || item.status === 'disabled' ? FLEET_COLORS.danger.text : FLEET_COLORS.none.text}
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
            value={testDef ? complianceBadgeLabel(testDef, testItem) : test ? formatDate(test) : 'חסר'}
            note={
              testDef && testItem?.last_date && !testItem.expiry_date
                ? `בדיקה אחרונה ${formatDate(testItem.last_date)}`
                : testDays == null
                ? 'חסר'
                : testDays < 0
                ? 'פג תוקף'
                : `${testDays} ימים`
            }
            tone={testDef && complianceBadgeState(testDef, testItem) === 'optional' ? TONE_OK : testTone}
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
    backgroundColor: FLEET_COLORS.card,
    borderRadius: 30,
    marginHorizontal: SPACING.lg,
    overflow: 'hidden',
    ...FLEET_SHADOWS.card,
  },
  cardAlert: { shadowColor: TONE_BAD, shadowOpacity: 0.22 },

  cardTop: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: SPACING.md,
    padding: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  cardTitleWrap: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  cardTitle: { fontSize: 15.5, flexShrink: 1, color: FLEET_COLORS.textPrimary, fontFamily: FLEET_FONT.bold },
  cardSubtitle: { fontSize: 11.5, color: FLEET_COLORS.textSecondary, fontFamily: FLEET_FONT.regular },
  chip: { flexShrink: 0, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 10.5, fontFamily: FLEET_FONT.bold },

  plate: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    backgroundColor: FLEET_COLORS.plateYellow,
    borderRadius: 11,
    overflow: 'hidden',
    shadowColor: 'rgba(16,24,40,.4)',
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  plateFlag: {
    backgroundColor: FLEET_COLORS.plateBlue,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateFlagText: { color: '#FFFFFF', fontSize: 9, fontFamily: FLEET_FONT.black },
  plateText: {
    fontSize: 13,
    color: '#111111',
    paddingHorizontal: 8,
    paddingVertical: 5,
    letterSpacing: 0.3,
    fontFamily: FLEET_FONT.black,
  },

  restoreBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(10,132,255,.10)',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  restoreText: { fontSize: 13, color: FLEET_COLORS.primary, fontFamily: FLEET_FONT.bold },
});
