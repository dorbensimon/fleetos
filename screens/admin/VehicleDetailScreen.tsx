import React, { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Screen,
  Card,
  AppText,
  ScreenHeader,
  LoadingState,
  InfoRow,
  SecondaryButton,
  Badge,
} from '../../components/ui';
import { ComplianceSection } from '../../components/ComplianceSection';
import { COLORS, RADIUS, SPACING, formatDate, formatDateTime } from '../../lib/theme';
import { formatPlate } from '../../lib/plate';
import { useCompany } from '../../lib/CompanyContext';
import {
  getVehicle,
  getDriver,
  archiveVehicle,
  listDepartments,
  Vehicle,
  DriverRow,
  Department,
} from '../../lib/adminApi';
import { VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '../../lib/compliance';
import { RootStackParamList } from '../../navigation/types';

/**
 * A3 — the vehicle file.
 *
 * Everything about one vehicle in one place, split into tabs so the
 * screen doesn't turn into an endless scroll. Accidents and billing are
 * later phases and are deliberately not shown as empty tabs.
 */

type Tab = 'general' | 'maintenance' | 'documents' | 'drivers';

const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'כללי' },
  { key: 'maintenance', label: 'תחזוקה' },
  { key: 'documents', label: 'מסמכים' },
  { key: 'drivers', label: 'נהגים' },
];

type Props = NativeStackScreenProps<RootStackParamList, 'VehicleDetail'>;

export default function VehicleDetailScreen({ route, navigation }: Props) {
  const { vehicleId } = route.params;
  const { companyId } = useCompany();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>(route.params.tab ?? 'general');

  const load = useCallback(async () => {
    const v = await getVehicle(vehicleId);
    setVehicle(v);
    setDriver(v?.primary_driver_id ? await getDriver(v.primary_driver_id) : null);
    if (companyId) setDepartments(await listDepartments(companyId));
  }, [vehicleId, companyId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        try {
          await load();
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [load])
  );

  const confirmArchive = () => {
    Alert.alert(
      'העברה לארכיון',
      `להעביר את ${vehicle?.plate_number} לארכיון? הרכב יוסתר מהרשימה אך הנתונים יישמרו.`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'העבר לארכיון',
          style: 'destructive',
          onPress: async () => {
            await archiveVehicle(vehicleId);
            navigation.goBack();
          },
        },
      ]
    );
  };

  if (loading || !companyId) {
    return (
      <Screen>
        <ScreenHeader title="תיק רכב" onBack={() => navigation.goBack()} />
        <LoadingState />
      </Screen>
    );
  }

  if (!vehicle) {
    return (
      <Screen>
        <ScreenHeader title="תיק רכב" onBack={() => navigation.goBack()} />
        <View style={styles.notFound}>
          <AppText>הרכב לא נמצא</AppText>
        </View>
      </Screen>
    );
  }

  const departmentName =
    departments.find((d) => d.id === vehicle.department_id)?.name ?? null;

  const kmToService =
    vehicle.next_service_km != null ? vehicle.next_service_km - vehicle.odometer : null;

  return (
    <Screen>
      <ScreenHeader
        title={
          [vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') ||
          formatPlate(vehicle.plate_number)
        }
        subtitle={`${formatPlate(vehicle.plate_number)} · ${
          VEHICLE_TYPE_LABELS[vehicle.vehicle_type] ?? vehicle.vehicle_type
        }`}
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity
            onPress={() => navigation.navigate('VehicleForm', { vehicleId })}
            hitSlop={10}
            style={styles.editBtn}
          >
            <Ionicons name="create-outline" size={20} color={COLORS.accent} />
          </TouchableOpacity>
        }
      />

      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            activeOpacity={0.7}
          >
            <AppText
              weight="bold"
              style={[styles.tabText, tab === t.key && styles.tabTextActive]}
            >
              {t.label}
            </AppText>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'general' && (
          <>
            <Card>
              <View style={styles.statusRow}>
                <AppText weight="bold" style={styles.cardTitle}>
                  פרטים טכניים
                </AppText>
                <Badge
                  label={VEHICLE_STATUS_LABELS[vehicle.status] ?? vehicle.status}
                  bg={vehicle.status === 'active' ? COLORS.okBg : COLORS.neutralBg}
                  fg={vehicle.status === 'active' ? COLORS.okText : COLORS.neutralText}
                />
              </View>
              <InfoRow label="מספר רישוי" value={formatPlate(vehicle.plate_number)} />
              <InfoRow label="יצרן" value={vehicle.manufacturer} />
              <InfoRow label="דגם" value={vehicle.model} />
              <InfoRow label="סוג" value={VEHICLE_TYPE_LABELS[vehicle.vehicle_type]} />
              <InfoRow
                label="שנת ייצור"
                value={
                  vehicle.production_year
                    ? `${vehicle.production_month ? `${vehicle.production_month}/` : ''}${
                        vehicle.production_year
                      }`
                    : null
                }
              />
              <InfoRow label="מספר שילדה" value={vehicle.vin} />
              <InfoRow label="קוד פנימי" value={vehicle.internal_code} />
              <InfoRow label="מחלקה" value={departmentName} />
              <InfoRow label="שימוש הרכב" value={vehicle.usage_type} />
            </Card>

            <Card>
              <AppText weight="bold" style={styles.cardTitle}>
                פעולות
              </AppText>
              <View style={styles.actions}>
                <SecondaryButton
                  label="עריכת פרטים"
                  icon="create-outline"
                  style={styles.actionBtn}
                  onPress={() => navigation.navigate('VehicleForm', { vehicleId })}
                />
                <SecondaryButton
                  label="לארכיון"
                  icon="archive-outline"
                  danger
                  style={styles.actionBtn}
                  onPress={confirmArchive}
                />
              </View>
            </Card>
          </>
        )}

        {tab === 'maintenance' && (
          <Card>
            <AppText weight="bold" style={styles.cardTitle}>
              תפעול ותחזוקה
            </AppText>
            <InfoRow label="מד אוץ נוכחי" value={`${vehicle.odometer.toLocaleString()} ק״מ`} />
            <InfoRow
              label="עודכן לאחרונה"
              value={
                vehicle.odometer_updated_at ? formatDateTime(vehicle.odometer_updated_at) : null
              }
            />
            <InfoRow
              label="ק״מ בטיפול האחרון"
              value={`${vehicle.last_service_km.toLocaleString()} ק״מ`}
            />
            <InfoRow
              label="טווח ק״מ בין טיפולים"
              value={vehicle.service_interval_km ? `${vehicle.service_interval_km.toLocaleString()} ק״מ` : null}
            />
            <InfoRow
              label="ק״מ לטיפול הבא"
              value={vehicle.next_service_km ? `${vehicle.next_service_km.toLocaleString()} ק״מ` : null}
            />
            <InfoRow
              label="יתרה לטיפול"
              right={
                kmToService == null ? (
                  <AppText weight="bold" style={styles.infoValue}>
                    —
                  </AppText>
                ) : (
                  <AppText
                    weight="bold"
                    style={[
                      styles.infoValue,
                      { color: kmToService <= 0 ? COLORS.dangerText : COLORS.text },
                    ]}
                  >
                    {kmToService <= 0
                      ? `חריגה של ${Math.abs(kmToService).toLocaleString()} ק״מ`
                      : `${kmToService.toLocaleString()} ק״מ`}
                  </AppText>
                )
              }
            />
          </Card>
        )}

        {tab === 'documents' && (
          <ComplianceSection companyId={companyId} ownerType="vehicle" ownerId={vehicleId} />
        )}

        {tab === 'drivers' && (
          <Card>
            <AppText weight="bold" style={styles.cardTitle}>
              נהג משויך
            </AppText>
            {driver ? (
              <TouchableOpacity
                style={styles.driverRow}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('DriverDetail', { driverId: driver.id })}
              >
                <Ionicons name="chevron-back" size={16} color={COLORS.textFaint} />
                <View style={styles.driverText}>
                  <AppText weight="bold" style={styles.driverName}>
                    {driver.full_name ?? 'ללא שם'}
                  </AppText>
                  <AppText style={styles.driverMeta}>
                    {driver.phone ?? '—'}
                    {driver.license_classes ? ` · דרגה ${driver.license_classes}` : ''}
                  </AppText>
                </View>
                <Ionicons name="person-circle-outline" size={30} color={COLORS.textFaint} />
              </TouchableOpacity>
            ) : (
              <AppText style={styles.noDriver}>לא משויך נהג לרכב זה</AppText>
            )}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  editBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  notFound: { padding: SPACING.xl, alignItems: 'center' },

  tabBar: {
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.card,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.lg,
  },
  tab: { paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: COLORS.accent },
  tabText: { fontSize: 13.5, color: COLORS.textFaint },
  tabTextActive: { color: COLORS.text },

  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 40 },
  cardTitle: { fontSize: 15.5, marginBottom: 4 },
  statusRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  infoValue: { fontSize: 13.5 },

  actions: { flexDirection: 'row-reverse', gap: SPACING.md, marginTop: SPACING.sm },
  actionBtn: { flex: 1 },

  driverRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
    paddingTop: SPACING.md,
  },
  driverText: { flex: 1, gap: 2 },
  driverName: { fontSize: 14.5 },
  driverMeta: { fontSize: 12.5, color: COLORS.textMuted },
  noDriver: { fontSize: 13, color: COLORS.textFaint, paddingTop: SPACING.md },
});
