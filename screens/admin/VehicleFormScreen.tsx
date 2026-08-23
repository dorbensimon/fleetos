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
} from '../../components/ui';
import { Select } from '../../components/ui/Select';
import { MonthYearField } from '../../components/ui/MonthYearField';
import { AutocompleteInput } from '../../components/ui/AutocompleteInput';
import { suggestManufacturers } from '../../lib/manufacturers';
import { COLORS, SPACING } from '../../lib/theme';
import { formatPlate } from '../../lib/plate';
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
import { RootStackParamList } from '../../navigation/types';

/** Add / edit a vehicle. Expiry dates are not here — they live in the documents tab. */

type Props = NativeStackScreenProps<RootStackParamList, 'VehicleForm'>;

interface FormState {
  plate_number: string;
  vehicle_type: VehicleType;
  manufacturer: string;
  model: string;
  internal_code: string;
  vin: string;
  production_year: number | null;
  production_month: number | null;
  usage_type: string;
  status: VehicleStatus;
  department_id: string | null;
  primary_driver_id: string | null;
  odometer: string;
  last_service_km: string;
  service_interval_km: string;
  next_service_km: string;
}

const EMPTY: FormState = {
  plate_number: '',
  vehicle_type: 'car',
  manufacturer: '',
  model: '',
  internal_code: '',
  vin: '',
  production_year: null,
  production_month: null,
  usage_type: '',
  status: 'active',
  department_id: null,
  primary_driver_id: null,
  odometer: '',
  last_service_km: '',
  service_interval_km: '',
  next_service_km: '',
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
  const [original, setOriginal] = useState<Vehicle | null>(null);
  const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
  const [drivers, setDrivers] = useState<{ value: string; label: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /**
   * The three service numbers are one equation:
   *   ק״מ בטיפול האחרון + טווח בין טיפולים = ק״מ לטיפול הבא
   *
   * Whichever two the admin fills in, the third is derived — nobody
   * should be doing this arithmetic by hand, and a manual result that
   * disagrees with the other two fields is simply a typo waiting to
   * mislead the "יתרה לטיפול" counter.
   */
  const setServiceField = (
    key: 'last_service_km' | 'service_interval_km' | 'next_service_km',
    value: string
  ) =>
    setForm((f) => {
      const next = { ...f, [key]: value };

      const last = num(next.last_service_km);
      const interval = num(next.service_interval_km);
      const target = num(next.next_service_km);

      if (key === 'service_interval_km' && last != null && interval != null) {
        next.next_service_km = String(last + interval);
      } else if (key === 'next_service_km' && last != null && target != null) {
        // A next-service reading below the last service is not a range.
        next.service_interval_km = target > last ? String(target - last) : '';
      } else if (key === 'last_service_km' && last != null) {
        if (interval != null) {
          next.next_service_km = String(last + interval);
        } else if (target != null && target > last) {
          next.service_interval_km = String(target - last);
        }
      }

      return next;
    });

  const load = useCallback(async () => {
    if (!companyId) return;

    const [deps, drvs] = await Promise.all([listDepartments(companyId), listDrivers(companyId)]);
    setDepartments(deps.map((d) => ({ value: d.id, label: d.name })));
    setDrivers(drvs.map((d) => ({ value: d.id, label: d.full_name ?? 'ללא שם' })));

    if (vehicleId) {
      const v = await getVehicle(vehicleId);
      if (v) {
        setOriginal(v);
        setForm({
          // Rows saved before the mask existed still come back unhyphenated.
          plate_number: /^[\d-]*$/.test(v.plate_number)
            ? formatPlate(v.plate_number)
            : v.plate_number,
          vehicle_type: v.vehicle_type,
          manufacturer: v.manufacturer ?? '',
          model: v.model ?? '',
          internal_code: v.internal_code ?? '',
          vin: v.vin ?? '',
          production_year: v.production_year ?? null,
          production_month: v.production_month ?? null,
          usage_type: v.usage_type ?? '',
          status: v.status,
          department_id: v.department_id,
          primary_driver_id: v.primary_driver_id,
          odometer: String(v.odometer ?? ''),
          last_service_km: String(v.last_service_km ?? ''),
          service_interval_km: v.service_interval_km ? String(v.service_interval_km) : '',
          next_service_km: v.next_service_km ? String(v.next_service_km) : '',
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
    // Production date can no longer be typed wrong — it comes from a picker.
    return e;
  };

  /**
   * Whether anything in the operations/maintenance block moved. Only then
   * does "עודכן לאחרונה" get restamped, so an unrelated edit (a new
   * nickname, a department change) does not fake a fresh odometer reading.
   */
  const maintenanceChanged = (payload: Partial<Vehicle>) => {
    if (!original) return true;
    return (
      payload.odometer !== original.odometer ||
      payload.last_service_km !== original.last_service_km ||
      payload.service_interval_km !== original.service_interval_km ||
      payload.next_service_km !== original.next_service_km
    );
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
        production_year: form.production_year,
        production_month: form.production_month,
        usage_type: form.usage_type.trim() || null,
        status: form.status,
        department_id: form.department_id,
        primary_driver_id: form.primary_driver_id,
        odometer: num(form.odometer) ?? 0,
        last_service_km: num(form.last_service_km) ?? 0,
        service_interval_km: num(form.service_interval_km),
        next_service_km: num(form.next_service_km),
      };

      if (maintenanceChanged(payload)) {
        payload.odometer_updated_at = new Date().toISOString();
      }

      if (isEdit) {
        await updateVehicle(vehicleId!, payload);
      } else {
        await createVehicle({ ...payload, company_id: companyId, plate_number: payload.plate_number! });
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
                value={form.plate_number}
                onChangeText={(v) => set('plate_number', formatPlate(v))}
                placeholder="12-345-67"
                keyboardType="number-pad"
                maxLength={10}
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
                placeholder="התחל להקליד — למשל טויוטה"
                suggest={(q) =>
                  suggestManufacturers(q).map((m) => ({ value: m.he, hint: m.en }))
                }
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

            <Field label="תאריך ייצור" optional>
              <MonthYearField
                year={form.production_year}
                month={form.production_month}
                onChange={(year, month) =>
                  setForm((f) => ({ ...f, production_year: year, production_month: month }))
                }
                placeholder="בחר חודש ושנת ייצור"
              />
            </Field>
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

          <Card style={styles.card}>
            <AppText weight="bold" style={styles.cardTitle}>
              מד אוץ וטיפולים
            </AppText>

            <Field label="מד אוץ נוכחי (ק״מ)" optional>
              <InputLtr
                value={form.odometer}
                onChangeText={(v) => set('odometer', v)}
                keyboardType="number-pad"
              />
            </Field>

            <Field label="ק״מ בטיפול האחרון" optional>
              <InputLtr
                value={form.last_service_km}
                onChangeText={(v) => setServiceField('last_service_km', v)}
                keyboardType="number-pad"
              />
            </Field>

            <Field label="טווח ק״מ בין טיפולים" optional>
              <InputLtr
                value={form.service_interval_km}
                onChangeText={(v) => setServiceField('service_interval_km', v)}
                keyboardType="number-pad"
                placeholder="למשל 20000"
              />
            </Field>

            <Field label="ק״מ לטיפול הבא" optional>
              <InputLtr
                value={form.next_service_km}
                onChangeText={(v) => setServiceField('next_service_km', v)}
                keyboardType="number-pad"
              />
            </Field>

            <AppText style={styles.hint}>
              מילוי שניים מהשדות משלים את השלישי אוטומטית
            </AppText>
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
  hint: { fontSize: 11.5, color: COLORS.textFaint, textAlign: 'right' },
});
