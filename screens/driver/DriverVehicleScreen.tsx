import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, ScreenHeader, AppText, Card, LoadingState, EmptyState, ExpiryBadge } from '../../components/ui';
import { COLORS, RADIUS, SPACING, CARD_SHADOW, expiryState, formatDate } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { listCompliance, Vehicle, ComplianceItem } from '../../lib/adminApi';
import { VEHICLE_TYPE_LABELS } from '../../lib/compliance';
import { RootStackParamList } from '../../navigation/types';

/** U2 — read-only view of the driver's own assigned vehicle. */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverVehicle'>;

export default function DriverVehicleScreen({ navigation }: Props) {
  const { profile } = useCompany();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [compliance, setCompliance] = useState<ComplianceItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('vehicles')
      .select('*')
      .eq('primary_driver_id', profile.id)
      .maybeSingle();
    setVehicle((data as Vehicle) ?? null);
    if (data) {
      setCompliance(await listCompliance('vehicle', (data as Vehicle).id));
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        await load();
        if (active) setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [load])
  );

  const expiryOf = (itemType: string) =>
    compliance.find((c) => c.item_type === itemType)?.expiry_date ?? null;

  const insurance = expiryOf('insurance_mandatory');
  const test = expiryOf('annual_test');

  return (
    <Screen>
      <ScreenHeader title="הרכב שלי" onBack={() => navigation.goBack()} />

      {loading ? (
        <LoadingState />
      ) : !vehicle ? (
        <EmptyState icon="car-outline" title="אין רכב משויך" hint="פנה למנהל הצי שלך לשיוך רכב" />
      ) : (
        <View style={styles.content}>
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
            </AppText>
          </Card>

          <Card style={styles.card}>
            <View style={styles.metaRow}>
              <AppText style={styles.metaLabel}>ביטוח חובה</AppText>
              <ExpiryBadge state={expiryState(insurance)} label={insurance ? formatDate(insurance) : 'חסר'} />
            </View>
            <View style={styles.metaRow}>
              <AppText style={styles.metaLabel}>טסט שנתי</AppText>
              <ExpiryBadge state={expiryState(test)} label={test ? formatDate(test) : 'חסר'} />
            </View>
            {!!vehicle.odometer && (
              <View style={styles.metaRow}>
                <AppText style={styles.metaLabel}>קילומטראז׳</AppText>
                <AppText weight="bold" style={styles.metaValue}>
                  {vehicle.odometer.toLocaleString('he-IL')} ק"מ
                </AppText>
              </View>
            )}
          </Card>
        </View>
      )}
    </Screen>
  );
}

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
  plateText: { fontSize: 16, color: '#1A1A1A', paddingHorizontal: 10, paddingVertical: 6 },
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
});
