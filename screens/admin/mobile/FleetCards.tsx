import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, DK, DK_SPACE, DKText, Plate, Pressy, STATUS, Surface, validityProgress, type Status } from '../../../components/driverKit';
import { daysUntilExpiry, expiryState, formatDate } from '../../../lib/theme';
import type { ComplianceItem, DriverRow, Vehicle, VehicleDriverWithProfile } from '../../../lib/adminApi';
import { VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS, complianceBadgeLabel, complianceBadgeState, complianceRemainingDays, findComplianceDef } from '../../../lib/compliance';
import { nextServiceKmOf } from '../../../lib/serviceSchedule';
import { formatPlate } from '../../../lib/plate';

const APP_STARTED_AT_MS = Date.now();
const SERVICE_WARN_KM = 1000;

type Health = { label: string; value: string; note: string; status: Status; progress: number };

function daysStatus(days: number | null): Status {
  if (days == null) return 'missing';
  if (days < 0) return 'expired';
  return days <= 30 ? 'soon' : 'ok';
}

function daysNote(days: number | null) {
  if (days == null) return 'חסר';
  if (days === Number.POSITIVE_INFINITY) return 'לפי בדיקה אחרונה';
  if (days < 0) return 'פג תוקף';
  if (days === 0) return 'היום';
  return `${days.toLocaleString('he-IL')} ימים`;
}

/** Insurance, annual test and service for one vehicle, each as a status the card can draw. */
export function vehicleHealth(vehicle: Vehicle, items: ComplianceItem[] | undefined): { rows: Health[]; worst: Status; bad: string[] } {
  const insurance = items?.find((c) => c.item_type === 'insurance_mandatory')?.expiry_date ?? null;
  const testItem = items?.find((c) => c.item_type === 'annual_test') ?? null;
  const testDef = findComplianceDef('vehicle', 'annual_test');
  const insDays = daysUntilExpiry(insurance);
  const testDays = testDef ? complianceRemainingDays(testDef, testItem) : daysUntilExpiry(testItem?.expiry_date);
  const testOptional = !!testDef && complianceBadgeState(testDef, testItem) === 'optional';
  const nextKm = nextServiceKmOf(vehicle);
  const kmLeft = nextKm != null ? nextKm - vehicle.odometer : null;
  const interval = vehicle.service_interval_km ?? (nextKm != null ? nextKm - vehicle.last_service_km : null) ?? 10000;
  const serviceStatus: Status = kmLeft == null ? 'missing' : kmLeft <= 0 ? 'expired' : kmLeft <= SERVICE_WARN_KM ? 'soon' : 'ok';

  const rows: Health[] = [
    {
      label: 'ביטוח',
      value: insurance ? formatDate(insurance) : 'חסר',
      note: daysNote(insDays),
      status: statusFromExpiry(insurance),
      progress: validityProgress(insurance),
    },
    {
      label: 'טסט',
      value: testDef ? complianceBadgeLabel(testDef, testItem) : testItem?.expiry_date ? formatDate(testItem.expiry_date) : 'חסר',
      note: daysNote(testDays),
      status: testOptional ? 'ok' : daysStatus(testDays),
      progress: testDays == null ? 0.06 : testDays === Number.POSITIVE_INFINITY ? 1 : Math.max(0.06, Math.min(1, testDays / 365)),
    },
    {
      label: 'טיפול',
      value: nextKm != null ? `${nextKm.toLocaleString('he-IL')} ק״מ` : 'חסר',
      note: kmLeft == null ? 'חסר' : kmLeft <= 0 ? `חריגה ${Math.abs(kmLeft).toLocaleString('he-IL')} ק״מ` : `עוד ${kmLeft.toLocaleString('he-IL')} ק״מ`,
      status: serviceStatus,
      progress: kmLeft == null || kmLeft <= 0 ? 0.06 : Math.max(0.08, Math.min(1, kmLeft / interval)),
    },
  ];
  const bad = rows.filter((r) => r.status === 'expired').map((r) => r.label);
  const worst: Status = bad.length ? 'expired' : rows.some((r) => r.status === 'soon') ? 'soon' : rows.every((r) => r.status === 'missing') ? 'missing' : 'ok';
  return { rows, worst, bad };
}

function statusFromExpiry(date: string | null): Status {
  const state = expiryState(date);
  return state === 'expired' ? 'expired' : state === 'soon' ? 'soon' : state === 'ok' ? 'ok' : 'missing';
}

function licenseLine(expiry: string | null): { text: string; status: Status } {
  const status = statusFromExpiry(expiry);
  const days = daysUntilExpiry(expiry);
  if (!expiry) return { text: 'אין תוקף רישיון', status: 'missing' };
  if (status === 'expired') return { text: `הרישיון פג ב־${formatDate(expiry)}`, status };
  if (status === 'soon') return { text: days === 0 ? 'הרישיון פג היום' : `הרישיון פג בעוד ${days} ${days === 1 ? 'יום' : 'ימים'}`, status };
  return { text: `רישיון בתוקף עד ${formatDate(expiry)}`, status };
}

/**
 * A driver in the fleet list: who, whether their license is good, the car
 * they drive, and anything waiting on them — with a call button in reach.
 */
export function DriverFleetCard({
  item,
  pendingSigning,
  onPress,
  onPressVehicle,
  onCall,
}: {
  item: DriverRow;
  pendingSigning: number;
  onPress: () => void;
  onPressVehicle: (vehicleId: string) => void;
  onCall: () => void;
}) {
  const license = licenseLine(item.license_expiry);
  const s = STATUS[license.status];
  const activationDays = item.password_set_at ? Math.max(0, Math.floor((APP_STARTED_AT_MS - new Date(item.password_set_at).getTime()) / 86400000)) : null;
  const vehicle = item.vehicles[0] ?? (item.vehicle_id && item.vehicle_plate ? { id: item.vehicle_id, plate_number: item.vehicle_plate, is_primary: true } : null);
  const name = item.full_name ?? 'ללא שם';
  return (
    <Pressy onPress={onPress} accessibilityLabel={`${name}, ${license.text}${vehicle ? `, רכב ${formatPlate(vehicle.plate_number)}` : ', ללא רכב'}`} pressScale={0.985}>
      <Surface style={[styles.card, license.status === 'expired' && styles.cardAlert]}>
        <View style={styles.driverTop}>
          <View>
            <Avatar name={name} size={50} tone={license.status === 'expired' ? 'muted' : 'soft'} />
            {!!item.license_classes && (
              <View style={styles.grade}>
                <DKText variant="micro" color={DK.inkSoft} ltr style={styles.center}>
                  {item.license_classes}
                </DKText>
              </View>
            )}
          </View>
          <View style={styles.flex}>
            <DKText variant="heading" numberOfLines={1}>
              {name}
            </DKText>
            <View style={styles.inline}>
              <View style={[styles.dot, { backgroundColor: s.fill }]} />
              <DKText variant="caption" color={license.status === 'ok' ? DK.muted : s.fg} numberOfLines={1} style={styles.flexShrink}>
                {license.text}
              </DKText>
            </View>
          </View>
          {!!item.phone && (
            <Pressy onPress={onCall} haptic accessibilityLabel={`התקשרות אל ${name}`} style={styles.call} pressScale={0.9}>
              <Ionicons name="call" size={19} color={STATUS.ok.fg} />
            </Pressy>
          )}
        </View>
        {(!!vehicle || pendingSigning > 0 || !!item.must_change_password) && (
          <View style={styles.tags}>
            {vehicle ? (
              <Pressy onPress={() => onPressVehicle(vehicle.id)} accessibilityRole="link" accessibilityLabel={`לרכב ${formatPlate(vehicle.plate_number)}`} style={styles.tag} pressScale={0.95}>
                <Ionicons name="car-sport" size={14} color={DK.accent} />
                <DKText variant="micro" color={DK.accent} ltr>
                  {formatPlate(vehicle.plate_number)}
                </DKText>
                {item.vehicles.length > 1 && (
                  <DKText variant="micro" color={DK.muted}>
                    {`ועוד ${item.vehicles.length - 1}`}
                  </DKText>
                )}
              </Pressy>
            ) : (
              <View style={[styles.tag, styles.tagMuted]}>
                <Ionicons name="car-outline" size={14} color={DK.muted} />
                <DKText variant="micro" color={DK.muted}>
                  ללא רכב
                </DKText>
              </View>
            )}
            {pendingSigning > 0 && (
              <View style={[styles.tag, { backgroundColor: STATUS.soon.soft }]}>
                <Ionicons name="create" size={14} color={STATUS.soon.fg} />
                <DKText variant="micro" color={STATUS.soon.fg}>
                  {pendingSigning === 1 ? 'מסמך לחתימה' : `${pendingSigning} מסמכים לחתימה`}
                </DKText>
              </View>
            )}
            {!!item.must_change_password && (
              <View style={[styles.tag, styles.tagMuted]}>
                <Ionicons name="hourglass-outline" size={14} color={DK.muted} />
                <DKText variant="micro" color={DK.muted}>
                  {activationDays == null || activationDays === 0 ? 'ממתין להפעלה' : `ממתין להפעלה · ${activationDays} ${activationDays === 1 ? 'יום' : 'ימים'}`}
                </DKText>
              </View>
            )}
          </View>
        )}
      </Surface>
    </Pressy>
  );
}

/**
 * A vehicle in the fleet list: plate and model up top, then its insurance,
 * annual test and service as three small gauges in the colour of their state.
 */
export function VehicleFleetCard({
  item,
  compliance,
  drivers,
  departmentName,
  restoring,
  onPress,
  onRestore,
}: {
  item: Vehicle;
  compliance: ComplianceItem[] | undefined;
  drivers: VehicleDriverWithProfile[] | undefined;
  departmentName: string | null;
  restoring: boolean;
  onPress: () => void;
  onRestore: () => void;
}) {
  const archived = item.status === 'archived';
  const health = vehicleHealth(item, compliance);
  const driverName = drivers?.find((d) => d.is_primary)?.full_name ?? drivers?.[0]?.full_name ?? null;
  const extra = Math.max(0, (drivers?.length ?? 0) - (driverName ? 1 : 0));
  const title = [item.manufacturer, item.model].filter(Boolean).join(' ') || 'ללא דגם';
  const meta = [driverName ? `${driverName}${extra ? ` +${extra}` : ''}` : 'ללא נהג', departmentName, VEHICLE_TYPE_LABELS[item.vehicle_type] ?? item.vehicle_type]
    .filter(Boolean)
    .join(' · ');
  const inactive = item.status === 'maintenance' || item.status === 'disabled';
  const chip: { label: string; status: Status } | null = archived
    ? null
    : inactive
      ? { label: VEHICLE_STATUS_LABELS[item.status], status: 'expired' }
      : health.worst === 'expired'
        ? { label: health.bad.join(' · '), status: 'expired' }
        : health.worst === 'soon'
          ? { label: 'מתקרב מועד', status: 'soon' }
          : health.worst === 'missing'
            ? { label: 'חסרים נתונים', status: 'missing' }
            : null;
  return (
    <Pressy onPress={onPress} accessibilityLabel={`${title}, ${formatPlate(item.plate_number)}, ${meta}${chip ? `, ${chip.label}` : ''}`} pressScale={0.985}>
      <Surface style={[styles.card, !archived && health.worst === 'expired' && styles.cardAlert, archived && styles.cardArchived]}>
        <View style={styles.vehicleTop}>
          <View style={styles.flex}>
            <View style={styles.inline}>
              <DKText variant="heading" numberOfLines={1} style={styles.flexShrink}>
                {title}
              </DKText>
              {!!chip && (
                <View style={[styles.statusChip, { backgroundColor: STATUS[chip.status].soft }]}>
                  <DKText variant="micro" color={STATUS[chip.status].fg} numberOfLines={1}>
                    {chip.label}
                  </DKText>
                </View>
              )}
            </View>
            <DKText variant="caption" color={DK.muted} numberOfLines={1}>
              {meta}
            </DKText>
          </View>
          <Plate number={formatPlate(item.plate_number)} size="sm" />
        </View>
        {archived ? (
          <Pressy onPress={onRestore} disabled={restoring} accessibilityLabel="שחזור הרכב מהארכיון" style={styles.restore}>
            <Ionicons name="arrow-undo" size={17} color={DK.accent} />
            <DKText variant="label" color={DK.accent}>
              {restoring ? 'משחזר…' : 'שחזור מהארכיון'}
            </DKText>
          </Pressy>
        ) : (
          <View style={styles.health}>
            {health.rows.map((row, i) => (
              <View key={row.label} style={[styles.healthCell, i > 0 && styles.healthDivider]} accessible accessibilityLabel={`${row.label}: ${row.value}, ${row.note}`}>
                <DKText variant="micro" color={DK.muted}>
                  {row.label}
                </DKText>
                <DKText variant="number" numberOfLines={1} adjustsFontSizeToFit style={styles.healthValue}>
                  {row.value}
                </DKText>
                <DKText variant="micro" color={row.status === 'ok' || row.status === 'missing' ? DK.muted : STATUS[row.status].fg} numberOfLines={1}>
                  {row.note}
                </DKText>
                <View style={styles.track}>
                  <View style={[styles.trackFill, { width: `${Math.round(row.progress * 100)}%`, backgroundColor: STATUS[row.status].fill }]} />
                </View>
              </View>
            ))}
          </View>
        )}
      </Surface>
    </Pressy>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  center: { textAlign: 'center' },
  inline: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  card: { padding: 14, gap: 12, borderRadius: 24 },
  cardAlert: { borderWidth: 1, borderColor: 'rgba(255,77,94,0.28)' },
  cardArchived: { opacity: 0.92 },

  driverTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  grade: {
    position: 'absolute',
    bottom: -4,
    left: -5,
    minWidth: 22,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 8,
    backgroundColor: DK.surface,
    borderWidth: 1,
    borderColor: DK.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  call: { width: 46, height: 46, borderRadius: 23, backgroundColor: STATUS.ok.soft, alignItems: 'center', justifyContent: 'center' },
  tags: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, paddingRight: 62 },
  tag: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, minHeight: 30, paddingHorizontal: 10, borderRadius: 10, backgroundColor: DK.accentSoft },
  tagMuted: { backgroundColor: DK.surfaceSunk },

  vehicleTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 2 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, flexShrink: 0, maxWidth: '55%' },
  health: { flexDirection: 'row-reverse', backgroundColor: DK.surfaceSunk, borderRadius: 18, paddingVertical: 12 },
  healthCell: { flex: 1, paddingHorizontal: DK_SPACE.sm, gap: 3 },
  healthDivider: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: 'rgba(10,22,38,0.1)' },
  healthValue: { fontSize: 14.5, lineHeight: 20 },
  track: { height: 4, borderRadius: 2, backgroundColor: '#E3E8EF', overflow: 'hidden', marginTop: 4, flexDirection: 'row-reverse' },
  trackFill: { height: '100%', borderRadius: 2 },
  restore: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 16, backgroundColor: DK.accentSoft },
});
