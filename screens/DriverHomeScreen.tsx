import React, { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, AppText, Card, PressableCard, LoadingState, DriverMenuButton } from '../components/ui';
import { COLORS, RADIUS, SPACING, CARD_SHADOW, timeGreeting, expiryState, formatDate } from '../lib/theme';
import { useCompany } from '../lib/CompanyContext';
import { supabase } from '../lib/supabase';
import { getDriver, listCompliance, DriverRow, Vehicle, ComplianceItem } from '../lib/adminApi';
import { VEHICLE_TYPE_LABELS } from '../lib/compliance';
import { RootStackParamList } from '../navigation/types';

/** U1 — the driver's personal landing screen. */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverHome'>;

export default function DriverHomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { profile } = useCompany();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [compliance, setCompliance] = useState<ComplianceItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    const [d, { data: v }] = await Promise.all([
      getDriver(profile.id),
      supabase.from('vehicles').select('*').eq('primary_driver_id', profile.id).maybeSingle(),
    ]);
    setDriver(d);
    setVehicle((v as Vehicle) ?? null);
    if (v) {
      setCompliance(await listCompliance('vehicle', (v as Vehicle).id));
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

  const firstName = driver?.full_name?.trim().split(/\s+/)[0];
  const test = compliance.find((c) => c.item_type === 'annual_test')?.expiry_date ?? null;
  const testState = expiryState(test);

  return (
    <Screen>
      <View style={[styles.topRow, { paddingTop: insets.top + 14 }]}>
        <View style={styles.greetingWrap}>
          <AppText style={styles.greetingSmall}>{timeGreeting()},</AppText>
          <AppText weight="bold" style={styles.greetingName} numberOfLines={1}>
            {firstName || 'נהג'}
          </AppText>
        </View>
        <DriverMenuButton />
      </View>

      {loading ? (
        <LoadingState />
      ) : (
        <View style={styles.content}>
          <PressableCard
            style={styles.vehicleCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('DriverVehicle')}
          >
            <View style={styles.vehicleIcon}>
              <Ionicons name="car-outline" size={20} color={COLORS.accent} />
            </View>
            <View style={styles.vehicleTextWrap}>
              <AppText style={styles.vehicleLabel}>הרכב שלי</AppText>
              {vehicle ? (
                <>
                  <AppText weight="bold" style={styles.vehicleName} numberOfLines={1}>
                    {[vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') ||
                      VEHICLE_TYPE_LABELS[vehicle.vehicle_type]}
                  </AppText>
                  <AppText style={styles.vehicleSub}>
                    {test ? `טסט הבא: ${formatDate(test)}` : 'ללא תאריך טסט רשום'}
                  </AppText>
                </>
              ) : (
                <AppText weight="bold" style={styles.vehicleName}>
                  אין רכב משויך
                </AppText>
              )}
            </View>
            <Ionicons name="chevron-back" size={16} color={COLORS.textFaint} />
          </PressableCard>

          {testState === 'soon' || testState === 'expired' ? (
            <Card style={[styles.alertCard, testState === 'expired' && styles.alertCardDanger]}>
              <Ionicons
                name="warning-outline"
                size={16}
                color={testState === 'expired' ? COLORS.dangerText : COLORS.warnText}
              />
              <AppText
                weight="bold"
                style={[styles.alertText, { color: testState === 'expired' ? COLORS.dangerText : COLORS.warnText }]}
              >
                {testState === 'expired' ? 'הטסט השנתי של הרכב פג תוקף' : 'הטסט השנתי של הרכב קרוב לפוג'}
              </AppText>
            </Card>
          ) : null}

          <TouchableOpacity
            style={styles.docsButton}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('DriverDocuments')}
          >
            <Ionicons name="document-text-outline" size={17} color={COLORS.textInverse} />
            <AppText weight="bold" style={styles.docsButtonText}>
              המסמכים שלי
            </AppText>
          </TouchableOpacity>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  greetingWrap: { alignItems: 'flex-end' },
  greetingSmall: { fontSize: 13, color: COLORS.textMuted },
  greetingName: { fontSize: 20, marginTop: 1 },

  content: { padding: SPACING.lg, gap: SPACING.md },

  vehicleCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
  },
  vehicleIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleTextWrap: { flex: 1, gap: 2 },
  vehicleLabel: { fontSize: 11.5, color: COLORS.textFaint },
  vehicleName: { fontSize: 15.5 },
  vehicleSub: { fontSize: 12, color: COLORS.textMuted },

  alertCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.warnBg,
    paddingVertical: 12,
    ...CARD_SHADOW,
  },
  alertCardDanger: { backgroundColor: COLORS.dangerBg },
  alertText: { fontSize: 13, flex: 1, textAlign: 'right' },

  docsButton: {
    height: 50,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.text,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: SPACING.sm,
  },
  docsButtonText: { fontSize: 15, color: COLORS.textInverse },
});
