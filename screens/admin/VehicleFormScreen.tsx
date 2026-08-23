import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Screen,
  Card,
  AppText,
  ScreenHeader,
  LoadingState,
  Field,
  Input,
  InputLtr,
  PrimaryButton,
  AutocompleteInput,
} from '../../components/ui';
import { Select } from '../../components/ui/Select';
import { COLORS, SPACING } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import {
  getVehicle,
  createVehicle,
  updateVehicle,
  listDepartments,
  listDrivers,
  Vehicle,
  VehicleStatus,
  VehicleType,
} from '../../lib/adminApi';
import { VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '../../lib/compliance';
import { ISRAEL_COMMON_MANUFACTURERS } from '../../lib/manufacturers';
import { formatPlate } from '../../lib/plate';
import { RootStackParamList } from '../../navigation/types';

/**
 * Add / edit a vehicle. Expiry dates are not here — they live in the
 * documents tab. Odometer/service-km fields aren't here either — they
 * live in the vehicle detail screen's maintenance tab.
 */

type Props = NativeStackScreenProps<RootStackParamList, 'VehicleForm'>;

interface FormState {
  plate_number: string;
  vehicle_type: VehicleType;
  manufacturer: string;
  model: string;
  internal_code: string;
  vin: string;
  production_year: string;
  production_month: string;
  usage_type: string;
  status: VehicleStatus;
  department_id: string | null;
  primary_driver_id: string | null;
}

const EMPTY: FormState = {
  plate_number: '',
  vehicle_type: 'car',
  manufacturer: '',
  model: '',
  internal_code: '',
  vin: '',
  production_year: '',
  production_month: '',
  usage_type: '',
  status: 'active',
  department_id: null,
  primary_driver_id: null,
};

const num = (s: string): number | null => {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

export default function VehicleFormScreen({ route, navigation }: Props) {
  const vehicleId = route.params?.vehicleId;
  const isEdit = !!vehicleId;
  const { companyId } = useCompany();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
  const [drivers, setDrivers] = useState<{ value: string; label: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const load = useCallback(async () => {
    if (!companyId) return;

    const [deps, drvs] = await Promise.all([listDepartments(companyId), listDrivers(companyId)]);
    setDepartments(deps.map((d) => ({ value: d.id, label: d.name })));
    setDrivers(drvs.map((d) => ({ value: d.id, label: d.full_name ?? 'ללא שם' })));

    if (vehicleId) {
      const v = await getVehicle(vehicleId);
      if (v) {
        setForm({
          plate_number: v.plate_number,
          vehicle_type: v.vehicle_type,
          manufacturer: v.manufacturer ?? '',
          model: v.model ?? '',
          internal_code: v.internal_code ?? '',
          vin: v.vin ?? '',
          production_year: v.production_year ? String(v.production_year) : '',
          production_month: v.production_month ? String(v.production_month) : '',
          usage_type: v.usage_type ?? '',
          status: v.status,
          department_id: v.department_id,
          primary_driver_id: v.primary_driver_id,
        });
      }
    }
  }, [companyId, vehicleId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.plate_number.trim()) e.plate_number = 'שדה חובה';
    const year = num(form.production_year);
    if (form.production_year.trim() && (year === null || year < 1950 || year > 2100)) {
      e.production_year = 'שנה לא תקינה';
    }
    const month = num(form.production_month);
    if (form.production_month.trim() && (month === null || month < 1 || month > 12)) {
      e.production_month = 'חודש חייב להיות 1–12';
    }
    return e;
  };

  const save = async () => {
    if (!companyId) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    try {
      const payload: Partial<Vehicle> = {
        plate_number: form.plate_number.trim(),
        vehicle_type: form.vehicle_type,
        manufacturer: form.manufacturer.trim() || null,
        model: form.model.trim() || null,
        internal_code: form.internal_code.trim() || null,
        vin: form.vin.trim() || null,
        production_year: num(form.production_year),
        production_month: num(form.production_month),
        usage_type: form.usage_type.trim() || null,
        status: form.status,
        department_id: form.department_id,
        primary_driver_id: form.primary_driver_id,
      };

      if (isEdit) {
        await updateVehicle(vehicleId!, payload);
      } else {
        await createVehicle({
          ...payload,
          company_id: companyId,
          plate_number: payload.plate_number!,
          odometer: 0,
          last_service_km: 0,
        });
      }
      navigation.goBack();
    } catch (err: any) {
      const message = String(err?.message ?? '');
      Alert.alert(
        'שמירה נכשלה',
        message.includes('duplicate') || message.includes('unique')
          ? 'קיים כבר רכב עם מספר הרישוי הזה בחברה'
          : message || 'נסה שוב'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title={isEdit ? 'עריכת רכב' : 'רכב חדש'} onBack={() => navigation.goBack()} />
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={isEdit ? 'עריכת רכב' : 'רכב חדש'} onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            <AppText weight="bold" style={styles.cardTitle}>
              זיהוי הרכב
            </AppText>

            <Field label="מספר רישוי" error={errors.plate_number}>
              <InputLtr
                value={formatPlate(form.plate_number)}
                onChangeText={(v) => set('plate_number', v.replace(/\D/g, ''))}
                placeholder="12-345-67"
                keyboardType="number-pad"
                hasError={!!errors.plate_number}
              />
            </Field>

            <Field label="סוג רכב">
              <Select<VehicleType>
                value={form.vehicle_type}
                onChange={(v) => set('vehicle_type', v ?? 'car')}
                options={Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => ({
                  value: value as VehicleType,
                  label,
                }))}
              />
            </Field>

            <Field label="יצרן" optional>
              <AutocompleteInput
                value={form.manufacturer}
                onChangeText={(v) => set('manufacturer', v)}
                options={ISRAEL_COMMON_MANUFACTURERS}
              />
            </Field>

            <Field label="דגם" optional>
              <Input value={form.model} onChangeText={(v) => set('model', v)} />
            </Field>

            <Field label="קוד פנימי" optional>
              <InputLtr value={form.internal_code} onChangeText={(v) => set('internal_code', v)} />
            </Field>

            <Field label="מספר שילדה (VIN)" optional>
              <InputLtr value={form.vin} onChangeText={(v) => set('vin', v)} />
            </Field>

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Field label="שנת ייצור" optional error={errors.production_year}>
                  <InputLtr
                    value={form.production_year}
                    onChangeText={(v) => set('production_year', v)}
                    keyboardType="number-pad"
                    placeholder="2020"
                    hasError={!!errors.production_year}
                  />
                </Field>
              </View>
              <View style={styles.rowItem}>
                <Field label="חודש" optional error={errors.production_month}>
                  <InputLtr
                    value={form.production_month}
                    onChangeText={(v) => set('production_month', v)}
                    keyboardType="number-pad"
                    placeholder="1–12"
                    hasError={!!errors.production_month}
                  />
                </Field>
              </View>
            </View>
          </Card>

          <Card style={styles.card}>
            <AppText weight="bold" style={styles.cardTitle}>
              שיוך וסטטוס
            </AppText>

            <Field label="סטטוס">
              <Select<VehicleStatus>
                value={form.status}
                onChange={(v) => set('status', v ?? 'active')}
                options={(['active', 'maintenance', 'disabled'] as VehicleStatus[]).map((s) => ({
                  value: s,
                  label: VEHICLE_STATUS_LABELS[s],
                }))}
              />
            </Field>

            <Field label="מחלקה" optional>
              <Select
                value={form.department_id}
                onChange={(v) => set('department_id', v)}
                options={departments}
                placeholder={departments.length ? 'בחר מחלקה' : 'לא הוגדרו מחלקות'}
                allowClear
              />
            </Field>

            <Field label="נהג משויך" optional>
              <Select
                value={form.primary_driver_id}
                onChange={(v) => set('primary_driver_id', v)}
                options={drivers}
                placeholder={drivers.length ? 'בחר נהג' : 'לא הוגדרו נהגים'}
                allowClear
              />
            </Field>

            <Field label="שימוש הרכב" optional>
              <Input value={form.usage_type} onChangeText={(v) => set('usage_type', v)} />
            </Field>
          </Card>

          <PrimaryButton
            label={isEdit ? 'שמור שינויים' : 'צור רכב'}
            onPress={save}
            loading={saving}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 48 },
  card: { gap: SPACING.md },
  cardTitle: { fontSize: 15.5, color: COLORS.text },
  row: { flexDirection: 'row-reverse', gap: SPACING.md },
  rowItem: { flex: 1 },
});
