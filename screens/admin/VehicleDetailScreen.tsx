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
  PrimaryButton,
  Field,
  InputLtr,
  Badge,
  ExpiryBadge,
  useToast,
} from '../../components/ui';
import { ComplianceSection } from '../../components/ComplianceSection';
import { COLORS, RADIUS, SPACING, formatDate, expiryState, ExpiryState } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import {
  getVehicle,
  getDriver,
  archiveVehicle,
  listDepartments,
  listCompliance,
  updateVehicle,
  Vehicle,
  DriverRow,
  Department,
  ComplianceItem,
} from '../../lib/adminApi';
import { VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '../../lib/compliance';
import { formatPlate } from '../../lib/plate';
import { formatPhone } from '../../lib/phone';
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

const num = (s: string): number | null => {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

interface MaintForm {
  odometer: string;
  last_service_km: string;
  service_interval_km: string;
  next_service_km: string;
}

export default function VehicleDetailScreen({ route, navigation }: Props) {
  const { vehicleId } = route.params;
  const { companyId } = useCompany();
  const { showToast } = useToast();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [compliance, setCompliance] = useState<ComplianceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('general');

  const [editingMaintenance, setEditingMaintenance] = useState(false);
  const [maintForm, setMaintForm] = useState<MaintForm>({
    odometer: '',
    last_service_km: '',
    service_interval_km: '',
    next_service_km: '',
  });
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  const startEditMaintenance = () => {
    if (!vehicle) return;
    setMaintForm({
      odometer: String(vehicle.odometer ?? ''),
      last_service_km: String(vehicle.last_service_km ?? ''),
      service_interval_km: vehicle.service_interval_km ? String(vehicle.service_interval_km) : '',
      next_service_km: vehicle.next_service_km ? String(vehicle.next_service_km) : '',
    });
    setEditingMaintenance(true);
  };

  const setLastServiceKm = (value: string) => setMaintForm((f) => ({ ...f, last_service_km: value }));
  const setNextServiceKm = (value: string) => setMaintForm((f) => ({ ...f, next_service_km: value }));

  /**
   * The only auto-fill left: once both the odometer reading and the
   * service interval are known, "ק״מ לטיפול הבא" is odometer + interval,
   * recomputed on every change to either of those two. Nothing else is
   * derived automatically.
   */
  const setOdometer = (value: string) => {
    setMaintForm((f) => {
      const next = { ...f, odometer: value };
      const odo = num(value);
      const interval = num(next.service_interval_km);
      if (odo != null && interval != null) next.next_service_km = String(odo + interval);
      return next;
    });
  };

  const setServiceIntervalKm = (value: string) => {
    setMaintForm((f) => {
      const next = { ...f, service_interval_km: value };
      const odo = num(next.odometer);
      const interval = num(value);
      if (odo != null && interval != null) next.next_service_km = String(odo + interval);
      return next;
    });
  };

  const saveMaintenance = async () => {
    setSavingMaintenance(true);
    try {
      await updateVehicle(vehicleId, {
        odometer: num(maintForm.odometer) ?? 0,
        last_service_km: num(maintForm.last_service_km) ?? 0,
        service_interval_km: num(maintForm.service_interval_km),
        next_service_km: num(maintForm.next_service_km),
      });
      setEditingMaintenance(false);
      await load();
      showToast('נשמר בהצלחה');
    } catch (err: any) {
      Alert.alert('שמירה נכשלה', String(err?.message ?? 'נסה שוב'));
    } finally {
      setSavingMaintenance(false);
    }
  };

  const load = useCallback(async () => {
    const v = await getVehicle(vehicleId);
    setVehicle(v);
    setDriver(v?.primary_driver_id ? await getDriver(v.primary_driver_id) : null);
    if (companyId) setDepartments(await listDepartments(companyId));
    setCompliance(await listCompliance('vehicle', vehicleId));
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
      `להעביר את ${formatPlate(vehicle?.plate_number)} לארכיון? הרכב יוסתר מהרשימה אך הנתונים יישמרו.`,
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
  const serviceState: ExpiryState =
    kmToService == null ? 'missing' : kmToService <= 0 ? 'expired' : kmToService <= 1000 ? 'soon' : 'ok';
  const serviceLabel =
    kmToService == null
      ? 'חסר'
      : kmToService <= 0
      ? `חריגה ${Math.abs(kmToService).toLocaleString()} ק״מ`
      : `${kmToService.toLocaleString()} ק״מ`;
  const insuranceDate =
    compliance.find((c) => c.item_type === 'insurance_mandatory')?.expiry_date ?? null;
  const testDate = compliance.find((c) => c.item_type === 'annual_test')?.expiry_date ?? null;

  return (
    <Screen>
      <ScreenHeader
        title={[vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') || formatPlate(vehicle.plate_number)}
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

      <View style={styles.badgeRow}>
        <View style={styles.badgeItem}>
          <AppText style={styles.badgeLabel}>ביטוח</AppText>
          <ExpiryBadge state={expiryState(insuranceDate)} label={insuranceDate ? formatDate(insuranceDate) : 'חסר'} />
        </View>
        <View style={styles.badgeItem}>
          <AppText style={styles.badgeLabel}>טסט</AppText>
          <ExpiryBadge state={expiryState(testDate)} label={testDate ? formatDate(testDate) : 'חסר'} />
        </View>
        <View style={styles.badgeItem}>
          <AppText style={styles.badgeLabel}>טיפול</AppText>
          <ExpiryBadge state={serviceState} label={serviceLabel} />
        </View>
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
            <View style={styles.statusRow}>
              <AppText weight="bold" style={styles.cardTitle}>
                תפעול ותחזוקה
              </AppText>
              {!editingMaintenance && (
                <TouchableOpacity onPress={startEditMaintenance} hitSlop={10} style={styles.editBtn}>
                  <Ionicons name="create-outline" size={20} color={COLORS.accent} />
                </TouchableOpacity>
              )}
            </View>

            {editingMaintenance ? (
              <>
                <Field label="מד אוץ נוכחי (ק״מ)">
                  <InputLtr value={maintForm.odometer} onChangeText={setOdometer} keyboardType="number-pad" />
                </Field>
                <Field label="ק״מ בטיפול האחרון">
                  <InputLtr value={maintForm.last_service_km} onChangeText={setLastServiceKm} keyboardType="number-pad" />
                </Field>
                <Field label="טווח ק״מ בין טיפולים">
                  <InputLtr
                    value={maintForm.service_interval_km}
                    onChangeText={setServiceIntervalKm}
                    keyboardType="number-pad"
                    placeholder="למשל 20000"
                  />
                </Field>
                <Field label="ק״מ לטיפול הבא">
                  <InputLtr value={maintForm.next_service_km} onChangeText={setNextServiceKm} keyboardType="number-pad" />
                </Field>
                <View style={styles.actions}>
                  <SecondaryButton
                    label="ביטול"
                    style={styles.actionBtn}
                    disabled={savingMaintenance}
                    onPress={() => setEditingMaintenance(false)}
                  />
                  <PrimaryButton
                    label="שמור"
                    style={styles.actionBtn}
                    loading={savingMaintenance}
                    onPress={saveMaintenance}
                  />
                </View>
              </>
            ) : (
              <>
                <InfoRow label="מד אוץ נוכחי" value={`${vehicle.odometer.toLocaleString()} ק״מ`} />
                <InfoRow
                  label="עודכן לאחרונה"
                  value={vehicle.odometer_updated_at ? formatDate(vehicle.odometer_updated_at) : null}
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
              </>
            )}
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
                    {driver.phone ? formatPhone(driver.phone) : '—'}
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

  badgeRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  badgeItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  badgeLabel: { fontSize: 12, color: COLORS.textMuted },

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
