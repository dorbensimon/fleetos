import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, ScreenHeader, AppText, Card, LoadingState, EmptyState, ErrorState, ExpiryBadge, SecondaryButton } from '../../components/ui';
import { COLORS, SPACING, expiryState, formatDate } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { listActiveDriverVehicles, listComplianceForOwners, DriverVehicleAssignment, ComplianceItem } from '../../lib/adminApi';
import { VEHICLE_TYPE_LABELS, complianceBadgeLabel, complianceBadgeState, findComplianceDef } from '../../lib/compliance';
import { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DText, HoverPressable, StatusPill } from '../../components/desktop/primitives';
import { DESKTOP_COLORS, DesktopTone } from '../../components/desktop/desktopTheme';
import { Ionicons } from '@expo/vector-icons';

/**
 * U2 — the driver's own vehicles. A driver can be actively assigned to
 * more than one vehicle (e.g. primary on one, secondary on another), so
 * this is a list, not a single-vehicle view — see `.claude/prds/
 * vehicle-drivers-multi.md`. When there's exactly one vehicle, the list
 * still renders (as a single card), keeping the experience just as
 * simple as before rather than adding a picker nobody needs.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverVehicle'>;

export default function DriverVehicleScreen({ navigation }: Props) {
  const { profile } = useCompany();
  const isDesktop = useIsDesktop();
  const [assignments, setAssignments] = useState<DriverVehicleAssignment[]>([]);
  const [compliance, setCompliance] = useState<Map<string, ComplianceItem[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setError(null);
    if (!profile) {
      if (requestId === loadRequest.current) {
        setError('פרופיל הנהג אינו זמין');
        setLoading(false);
      }
      return;
    }
    try {
      const data = await listActiveDriverVehicles(profile.id);
      const loadedCompliance = await listComplianceForOwners('vehicle', data.map((a) => a.vehicle.id));
      if (requestId !== loadRequest.current) return;
      setAssignments(data);
      setCompliance(loadedCompliance);
    } catch (err: any) {
      if (requestId === loadRequest.current) setError(err?.message ?? 'טעינת הרכבים נכשלה');
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        loadRequest.current += 1;
      };
    }, [load])
  );

  if (isDesktop) {
    return (
      <DesktopShell active="DriverHome" breadcrumbs={['הרכב שלי']}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : assignments.length === 0 ? (
          <EmptyState icon="car-outline" title="אין רכב משויך" hint="פנה למנהל הצי שלך לשיוך רכב" />
        ) : (
          <View style={ds.wrap}>
            {assignments.map((a) => (
              <DesktopVehicleCard
                key={a.id}
                vehicle={a.vehicle}
                isPrimary={a.is_primary}
                showPrimaryBadge={assignments.length > 1}
                compliance={compliance.get(a.vehicle.id) ?? []}
                onOdometer={() => navigation.navigate('DriverOdometer', { vehicleId: a.vehicle.id, currentOdometer: a.vehicle.odometer })}
              />
            ))}
          </View>
        )}
      </DesktopShell>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="הרכב שלי" onBack={() => navigation.goBack()} />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : assignments.length === 0 ? (
        <EmptyState icon="car-outline" title="אין רכב משויך" hint="פנה למנהל הצי שלך לשיוך רכב" />
      ) : (
        <View style={styles.content}>
          {assignments.map((a) => (
            <VehicleCard
              key={a.id}
              vehicle={a.vehicle}
              isPrimary={a.is_primary}
              showPrimaryBadge={assignments.length > 1}
              compliance={compliance.get(a.vehicle.id) ?? []}
              onOdometer={() => navigation.navigate('DriverOdometer', { vehicleId: a.vehicle.id, currentOdometer: a.vehicle.odometer })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function VehicleCard({
  vehicle,
  isPrimary,
  showPrimaryBadge,
  compliance,
  onOdometer,
}: {
  vehicle: DriverVehicleAssignment['vehicle'];
  isPrimary: boolean;
  showPrimaryBadge: boolean;
  compliance: ComplianceItem[];
  onOdometer: () => void;
}) {
  const expiryOf = (itemType: string) =>
    compliance.find((c) => c.item_type === itemType)?.expiry_date ?? null;

  const insurance = expiryOf('insurance_mandatory');
  const testItem = compliance.find((c) => c.item_type === 'annual_test') ?? null;
  const testDef = findComplianceDef('vehicle', 'annual_test');

  return (
    <>
      <Card style={styles.plateCard}>
        <View style={styles.plate}>
          <View style={styles.plateFlag}>
            <AppText weight="bold" style={styles.plateFlagText}>
              IL
            </AppText>
          </View>
          <AppText weight="bold" style={styles.plateText}>
            {vehicle.plate_number}
          </AppText>
        </View>
        <AppText weight="bold" style={styles.vehicleTitle}>
          {[vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') || 'ללא דגם'}
        </AppText>
        <AppText style={styles.vehicleSub}>
          {VEHICLE_TYPE_LABELS[vehicle.vehicle_type] ?? vehicle.vehicle_type}
          {showPrimaryBadge ? (isPrimary ? ' · הרכב הראשי שלי' : ' · רכב משני') : ''}
        </AppText>
      </Card>

      <Card style={styles.card}>
        <View style={styles.metaRow}>
          <AppText style={styles.metaLabel}>ביטוח חובה</AppText>
          <ExpiryBadge state={expiryState(insurance)} label={insurance ? formatDate(insurance) : 'חסר'} />
        </View>
        <View style={styles.metaRow}>
          <AppText style={styles.metaLabel}>טסט שנתי</AppText>
          <ExpiryBadge
            state={testDef ? complianceBadgeState(testDef, testItem) : expiryState(testItem?.expiry_date)}
            label={testDef ? complianceBadgeLabel(testDef, testItem) : testItem?.expiry_date ? formatDate(testItem.expiry_date) : 'חסר'}
          />
        </View>
        <View style={styles.metaRow}>
          <AppText style={styles.metaLabel}>קילומטראז׳</AppText>
          <AppText weight="bold" style={styles.metaValue}>{vehicle.odometer.toLocaleString('he-IL')} ק״מ</AppText>
        </View>
        <View style={styles.actions}>
          <SecondaryButton label="עדכון קילומטרים" icon="speedometer-outline" onPress={onOdometer} style={styles.action} />
        </View>
      </Card>
    </>
  );
}

function toneFor(state: ReturnType<typeof expiryState>): DesktopTone {
  return state === 'expired' ? 'bad' : state === 'soon' ? 'warn' : state === 'missing' ? 'neutral' : 'ok';
}

function DesktopVehicleCard({
  vehicle,
  isPrimary,
  showPrimaryBadge,
  compliance,
  onOdometer,
}: {
  vehicle: DriverVehicleAssignment['vehicle'];
  isPrimary: boolean;
  showPrimaryBadge: boolean;
  compliance: ComplianceItem[];
  onOdometer: () => void;
}) {
  const expiryOf = (itemType: string) => compliance.find((c) => c.item_type === itemType)?.expiry_date ?? null;
  const insurance = expiryOf('insurance_mandatory');
  const testItem = compliance.find((c) => c.item_type === 'annual_test') ?? null;
  const testDef = findComplianceDef('vehicle', 'annual_test');
  const testState = testDef ? complianceBadgeState(testDef, testItem) : expiryState(testItem?.expiry_date);
  const testLabel = testDef ? complianceBadgeLabel(testDef, testItem) : testItem?.expiry_date ? formatDate(testItem.expiry_date) : 'חסר';

  return (
    <View style={ds.card}>
      <View style={ds.headRow}>
        <View>
          <DText weight="bold" style={ds.vehicleTitle}>{[vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') || 'ללא דגם'}</DText>
          <DText style={ds.vehicleSub}>
            {VEHICLE_TYPE_LABELS[vehicle.vehicle_type] ?? vehicle.vehicle_type}
            {showPrimaryBadge ? (isPrimary ? ' · הרכב הראשי שלי' : ' · רכב משני') : ''}
          </DText>
        </View>
        <DText weight="bold" style={ds.plateText}>{vehicle.plate_number}</DText>
      </View>
      <View style={ds.metaRow}>
        <DText style={ds.metaLabel}>ביטוח חובה</DText>
        <StatusPill tone={toneFor(expiryState(insurance))} label={insurance ? formatDate(insurance) : 'חסר'} />
      </View>
      <View style={ds.metaRow}>
        <DText style={ds.metaLabel}>טסט שנתי</DText>
        <StatusPill tone={toneFor(testState)} label={testLabel} />
      </View>
      <View style={[ds.metaRow, ds.metaRowLast]}>
        <DText style={ds.metaLabel}>קילומטראז׳</DText>
        <DText weight="semiBold" style={ds.metaValue}>{vehicle.odometer.toLocaleString('he-IL')} ק״מ</DText>
      </View>
      <HoverPressable style={ds.odometerButton} hoverStyle={{ backgroundColor: DESKTOP_COLORS.brandHover }} onPress={onOdometer}>
        <Ionicons name="speedometer-outline" size={14} color="#FFFFFF" />
        <DText weight="semiBold" style={ds.odometerButtonText}>עדכון קילומטרים</DText>
      </HoverPressable>
    </View>
  );
}

const ds = StyleSheet.create({
  wrap: { padding: 24, maxWidth: 420, alignSelf: 'center', width: '100%', gap: 16 },
  card: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 8, padding: 16, gap: 4 },
  headRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  vehicleTitle: { fontSize: 15 },
  vehicleSub: { fontSize: 12, color: DESKTOP_COLORS.inkFaint, marginTop: 2 },
  plateText: { fontSize: 13, writingDirection: 'ltr' },
  metaRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', height: 36, borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  metaRowLast: {},
  metaLabel: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  metaValue: { fontSize: 12.5 },
  odometerButton: { marginTop: 10, height: 34, borderRadius: 6, backgroundColor: DESKTOP_COLORS.brand, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6 },
  odometerButtonText: { fontSize: 12.5, color: '#FFFFFF' },
});

const styles = StyleSheet.create({
  content: { padding: SPACING.lg, gap: SPACING.md },
  plateCard: { alignItems: 'center', gap: 6, paddingVertical: SPACING.lg },
  plate: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#F5C518',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 6,
  },
  plateFlag: {
    backgroundColor: '#1B4CA1',
    paddingHorizontal: 6,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateFlagText: { color: '#FFFFFF', fontSize: 10 },
  plateText: { fontSize: 16, color: COLORS.text, paddingHorizontal: 10, paddingVertical: 6 },
  vehicleTitle: { fontSize: 17 },
  vehicleSub: { fontSize: 13, color: COLORS.textMuted },
  card: { gap: SPACING.sm },
  metaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  metaLabel: { fontSize: 14, color: COLORS.textMuted },
  metaValue: { fontSize: 14 },
  actions: { flexDirection: 'row-reverse', gap: 8, marginTop: 8 },
  action: { flex: 1 },
});
