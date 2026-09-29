import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LoadingState, EmptyState, ErrorState } from '../../components/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FocusTarget, FocusTargetProvider } from '../../components/ui/FocusTarget';
import { DriverVehicleMobile } from './DriverVehicleMobile';
import { expiryState, formatDate } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { listActiveDriverVehicles, listComplianceForOwners, markNotificationsReadWhere, DriverVehicleAssignment, ComplianceItem } from '../../lib/adminApi';
import { VEHICLE_TYPE_LABELS, complianceBadgeLabel, complianceBadgeState, findComplianceDef } from '../../lib/compliance';
import { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DText, HoverPressable, StatusPill } from '../../components/desktop/primitives';
import { DESKTOP_COLORS, DesktopTone } from '../../components/desktop/desktopTheme';
import { Ionicons } from '@expo/vector-icons';
import { t, getLocale } from '../../lib/i18n';
import { errorMessage } from '../../lib/requestError';

/**
 * U2 — the driver's own vehicles. A driver can be actively assigned to
 * more than one vehicle (e.g. primary on one, secondary on another), so
 * this is a list, not a single-vehicle view — see `.claude/prds/
 * vehicle-drivers-multi.md`. When there's exactly one vehicle, the list
 * still renders (as a single card), keeping the experience just as
 * simple as before rather than adding a picker nobody needs.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverVehicle'>;

export default function DriverVehicleScreen({ navigation, route }: Props) {
  const focus = route.params?.focus;
  const { profile, loading: profileLoading } = useCompany();
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const [assignments, setAssignments] = useState<DriverVehicleAssignment[]>([]);
  const [compliance, setCompliance] = useState<Map<string, ComplianceItem[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);
  // Whose vehicles are on screen: a return refreshes them quietly.
  const shownFor = useRef<string | null>(null);

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    const quiet = !!profile && shownFor.current === profile.id;
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    if (!profile) {
      // Right after a refresh the profile is still on its way: keep loading.
      if (profileLoading) return;
      if (requestId === loadRequest.current) {
        setError(t('driver.profileUnavailable'));
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
      shownFor.current = profile.id;
    } catch (err: any) {
      if (requestId === loadRequest.current && !quiet) setError(errorMessage(err, t('fleet.vehiclesLoadFailed')));
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [profile, profileLoading]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        loadRequest.current += 1;
      };
    }, [load])
  );

  // Seeing the vehicle is what "you were assigned a vehicle" asks for.
  const profileId = profile?.id;
  useFocusEffect(useCallback(() => {
    if (!profileId) return;
    markNotificationsReadWhere({ types: ['vehicle_assignment'], recipientId: profileId }).catch(() => undefined);
  }, [profileId]));

  if (isDesktop) {
    return (
      <FocusTargetProvider focus={focus}>
      <DesktopShell active="DriverHome" breadcrumbs={[t('driver.myVehicle')]}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : assignments.length === 0 ? (
          <EmptyState icon="car-outline" title={t('driver.noAssignedVehicleTitle')} hint={t('driver.askManagerForVehicle')} />
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
      </FocusTargetProvider>
    );
  }

  return (
    <DriverVehicleMobile
      insetTop={insets.top}
      insetBottom={insets.bottom}
      loading={loading}
      error={error}
      assignments={assignments}
      compliance={compliance}
      onBack={() => navigation.goBack()}
      onRetry={load}
      onOdometer={(a) => navigation.navigate('DriverOdometer', { vehicleId: a.vehicle.id, currentOdometer: a.vehicle.odometer })}
      focus={focus}
    />
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
  const testLabel = testDef ? complianceBadgeLabel(testDef, testItem) : testItem?.expiry_date ? formatDate(testItem.expiry_date) : t('status.missing');

  return (
    <View style={ds.card}>
      <View style={ds.headRow}>
        <View>
          <DText weight="bold" style={ds.vehicleTitle}>{[vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') || t('vehicle.noModelShort')}</DText>
          <DText style={ds.vehicleSub}>
            {VEHICLE_TYPE_LABELS[vehicle.vehicle_type] ?? vehicle.vehicle_type}
            {showPrimaryBadge ? (isPrimary ? t('driver.myPrimarySuffix') : t('driver.secondarySuffix')) : ''}
          </DText>
        </View>
        <DText weight="bold" style={ds.plateText}>{vehicle.plate_number}</DText>
      </View>
      <FocusTarget id="insurance_mandatory" radius={6} tint={DESKTOP_COLORS.brand}>
        <View style={ds.metaRow}>
          <DText style={ds.metaLabel}>{t('folder.mandatoryInsurance')}</DText>
          <StatusPill tone={toneFor(expiryState(insurance))} label={insurance ? formatDate(insurance) : t('status.missing')} />
        </View>
      </FocusTarget>
      <FocusTarget id="annual_test" radius={6} tint={DESKTOP_COLORS.brand}>
        <View style={ds.metaRow}>
          <DText style={ds.metaLabel}>{t('folder.annualTest')}</DText>
          <StatusPill tone={toneFor(testState)} label={testLabel} />
        </View>
      </FocusTarget>
      <FocusTarget id="odometer,service" radius={6} tint={DESKTOP_COLORS.brand}>
        <View style={[ds.metaRow, ds.metaRowLast]}>
          <DText style={ds.metaLabel}>{t('vehicle.mileage')}</DText>
          <DText weight="semiBold" style={ds.metaValue}>{vehicle.odometer.toLocaleString(getLocale())} {t('unit.km')}</DText>
        </View>
      </FocusTarget>
      <HoverPressable style={ds.odometerButton} hoverStyle={{ backgroundColor: DESKTOP_COLORS.brandHover }} onPress={onOdometer}>
        <Ionicons name="speedometer-outline" size={14} color="#FFFFFF" />
        <DText weight="semiBold" style={ds.odometerButtonText}>{t('odometer.updateKm')}</DText>
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

