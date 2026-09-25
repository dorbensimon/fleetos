import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  DK,
  DK_SPACE,
  DKText,
  DriverPage,
  Gauge,
  HeroTitle,
  Plate,
  PrimaryAction,
  Reveal,
  Surface,
  relativeDays,
  statusOf,
  validityProgress,
} from '../../components/driverKit';
import { ErrorState, LoadingState } from '../../components/ui';
import {
  VEHICLE_TYPE_LABELS,
  complianceBadgeLabel,
  complianceBadgeState,
  complianceTargetDate,
  findComplianceDef,
  isRetiredVehicleComplianceItem,
} from '../../lib/compliance';
import { expiryState, formatDate } from '../../lib/theme';
import type { ComplianceItem, DriverVehicleAssignment } from '../../lib/adminApi';

type Props = {
  insetTop: number;
  insetBottom: number;
  loading: boolean;
  error: string | null;
  assignments: DriverVehicleAssignment[];
  compliance: Map<string, ComplianceItem[]>;
  onBack: () => void;
  onRetry: () => void;
  onOdometer: (assignment: DriverVehicleAssignment) => void;
};

/** Insurance and the annual test always show — as "missing" when absent. */
const ALWAYS = ['insurance_mandatory', 'annual_test'];

function rowsFor(compliance: ComplianceItem[]) {
  const types = [
    ...ALWAYS,
    ...compliance.map((c) => c.item_type).filter((t) => !ALWAYS.includes(t) && !isRetiredVehicleComplianceItem(t)),
  ];
  return [...new Set(types)].map((type) => {
    const item = compliance.find((c) => c.item_type === type) ?? null;
    const def = findComplianceDef('vehicle', type);
    const target = def ? complianceTargetDate(def, item) : item?.expiry_date ?? null;
    const state = def ? complianceBadgeState(def, item) : expiryState(item?.expiry_date);
    return {
      type,
      label: def?.label ?? type,
      value: def ? complianceBadgeLabel(def, item) : item?.expiry_date ? formatDate(item.expiry_date) : 'חסר',
      target,
      status: state === 'optional' ? ('ok' as const) : statusOf(state),
    };
  });
}

export function DriverVehicleMobile(p: Props) {
  const many = p.assignments.length > 1;
  return (
    <DriverPage
      insetTop={p.insetTop}
      insetBottom={p.insetBottom}
      hero={
        <HeroTitle
          title={many ? 'הרכבים שלי' : 'הרכב שלי'}
          subtitle={many ? `${p.assignments.length} רכבים משויכים אליך` : 'תוקף, טיפולים וקילומטראז׳'}
          onBack={p.onBack}
        />
      }
    >
      {p.loading ? (
        <Surface>
          <LoadingState />
        </Surface>
      ) : p.error ? (
        <Surface>
          <ErrorState message={p.error} onRetry={p.onRetry} />
        </Surface>
      ) : p.assignments.length === 0 ? (
        <Reveal>
          <Surface style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="car-sport-outline" size={30} color={DK.accent} />
            </View>
            <DKText variant="heading" style={styles.center}>
              עוד אין רכב משויך
            </DKText>
            <DKText variant="body" color={DK.muted} style={styles.center}>
              מנהל הצי משייך רכבים לנהגים. כשזה יקרה, הרכב יופיע כאן עם כל התוקפים שלו.
            </DKText>
          </Surface>
        </Reveal>
      ) : (
        p.assignments.map((a, index) => {
          const v = a.vehicle;
          const rows = rowsFor(p.compliance.get(v.id) ?? []);
          return (
            <Reveal key={a.id} index={index}>
              <Surface style={styles.card}>
                <View style={styles.identity}>
                  <View style={styles.identityText}>
                    {many && (
                      <View style={[styles.rolePill, a.is_primary && styles.rolePrimary]}>
                        <DKText variant="micro" color={a.is_primary ? DK.accent : DK.muted}>
                          {a.is_primary ? 'הרכב הראשי שלי' : 'רכב משני'}
                        </DKText>
                      </View>
                    )}
                    <DKText variant="title" numberOfLines={2}>
                      {[v.manufacturer, v.model].filter(Boolean).join(' ') || 'ללא דגם'}
                    </DKText>
                    <DKText variant="caption" color={DK.muted}>
                      {VEHICLE_TYPE_LABELS[v.vehicle_type] ?? v.vehicle_type}
                    </DKText>
                  </View>
                  <Plate number={v.plate_number} />
                </View>

                <View style={styles.gauges}>
                  {rows.map((row, i) => (
                    <Gauge
                      key={row.type}
                      label={row.label}
                      value={row.value}
                      detail={relativeDays(row.target)}
                      status={row.status}
                      progress={validityProgress(row.target)}
                      index={i}
                      last={i === rows.length - 1}
                    />
                  ))}
                </View>

                <View style={styles.odometer}>
                  <View style={styles.odometerText}>
                    <DKText variant="caption" color={DK.muted}>
                      קילומטראז׳ נוכחי
                    </DKText>
                    <View style={styles.odometerValue}>
                      <DKText style={styles.km}>{v.odometer.toLocaleString('he-IL')}</DKText>
                      <DKText variant="label" color={DK.muted}>
                        ק״מ
                      </DKText>
                    </View>
                  </View>
                  <View style={styles.speedIcon}>
                    <Ionicons name="speedometer" size={24} color={DK.accent} />
                  </View>
                </View>
                <PrimaryAction label="עדכון קילומטרים" icon="create-outline" onPress={() => p.onOdometer(a)} style={styles.cta} />
              </Surface>
            </Reveal>
          );
        })
      )}
    </DriverPage>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  card: { paddingBottom: DK_SPACE.lg },
  identity: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12, padding: DK_SPACE.lg, paddingBottom: 12 },
  identityText: { flex: 1, gap: 4, alignItems: 'flex-end' },
  rolePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: DK.surfaceSunk, marginBottom: 4 },
  rolePrimary: { backgroundColor: DK.accentSoft },
  gauges: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  odometer: {
    marginHorizontal: DK_SPACE.lg,
    marginTop: 8,
    padding: 16,
    borderRadius: 20,
    backgroundColor: DK.surfaceSunk,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  odometerText: { flex: 1, gap: 2 },
  odometerValue: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 6 },
  km: { fontFamily: 'Heebo_800ExtraBold', fontSize: 30, lineHeight: 36, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  speedIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: DK.accentSoft },
  cta: { marginHorizontal: DK_SPACE.lg, marginTop: 14 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 34, paddingHorizontal: 26 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
