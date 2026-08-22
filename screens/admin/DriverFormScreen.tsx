import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Card, AppText, ScreenHeader, LoadingState, Field, Input, InputLtr, PrimaryButton } from '../../components/ui';
import { Select } from '../../components/ui/Select';
import { DateField } from '../../components/ui/DateField';
import { COLORS, SPACING } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { getDriver, updateDriver, createDriverAccount } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';

const LICENSE_CLASS_OPTIONS = [
  { value: 'A2', label: 'A2 — אופנוע עד 125 סמ"ק (מגיל 16)' },
  { value: 'A1', label: 'A1 — אופנוע עד 35 ק"ו (מגיל 18)' },
  { value: 'A', label: 'A — אופנוע ללא הגבלת הספק (מגיל 21)' },
  { value: 'B', label: 'B — רכב פרטי / מסחרי קל עד 3.5 טון' },
  { value: 'C1', label: 'C1 — משא 3.5–12 טון' },
  { value: 'C', label: 'C — משא מעל 12 טון' },
  { value: 'C+E', label: 'C+E — משא כבד עם גרור' },
  { value: 'D1', label: 'D1 — הסעת נוסעים' },
  { value: 'D', label: 'D — אוטובוס ציבורי' },
  { value: '1', label: '1 (T) — טרקטור' },
];

/**
 * A5 (add/edit) — placeholder covering the core fields only. The full
 * personal/employment/certification groups from the spec come once the
 * detail screen grows tabs to hold them.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverForm'>;

interface FormState {
  full_name: string;
  phone: string;
  email: string;
  password: string;
  national_id: string;
  employee_number: string;
  license_classes: string;
  license_expiry: string;
}

const EMPTY: FormState = {
  full_name: '',
  phone: '',
  email: '',
  password: '',
  national_id: '',
  employee_number: '',
  license_classes: '',
  license_expiry: '',
};

export default function DriverFormScreen({ route, navigation }: Props) {
  const driverId = route.params?.driverId;
  const isEdit = !!driverId;
  const { companyId } = useCompany();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const load = useCallback(async () => {
    if (!driverId) return;
    const d = await getDriver(driverId);
    if (d) {
      setForm({
        full_name: d.full_name ?? '',
        phone: d.phone ?? '',
        email: '',
        password: '',
        national_id: d.national_id ?? '',
        employee_number: d.employee_number ?? '',
        license_classes: d.license_classes ?? '',
        license_expiry: d.license_expiry ?? '',
      });
    }
  }, [driverId]);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      setLoading(true);
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [isEdit, load]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.full_name.trim()) e.full_name = 'שדה חובה';
    if (!form.phone.trim()) e.phone = 'שדה חובה';
    if (!form.national_id.trim()) e.national_id = 'שדה חובה';
    if (!form.employee_number.trim()) e.employee_number = 'שדה חובה';
    if (!form.license_classes.trim()) e.license_classes = 'שדה חובה';
    if (!form.license_expiry.trim()) e.license_expiry = 'שדה חובה';
    if (!isEdit) {
      if (!form.email.trim()) e.email = 'שדה חובה';
      if (!form.password || form.password.length < 6) e.password = 'לפחות 6 תווים';
    }
    return e;
  };

  const save = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    try {
      if (isEdit) {
        await updateDriver(driverId!, {
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          national_id: form.national_id.trim(),
          employee_number: form.employee_number.trim(),
          license_classes: form.license_classes.trim(),
          license_expiry: form.license_expiry.trim(),
        });
      } else {
        if (!companyId) return;
        const result = await createDriverAccount({
          companyId,
          email: form.email.trim(),
          password: form.password,
          fullName: form.full_name.trim(),
          phone: form.phone.trim(),
          details: {
            national_id: form.national_id.trim(),
            employee_number: form.employee_number.trim(),
            license_classes: form.license_classes.trim(),
            license_expiry: form.license_expiry.trim(),
          },
        });
        if (!result.ok) {
          Alert.alert('יצירת הנהג נכשלה', result.error);
          return;
        }
      }
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('שמירה נכשלה', String(err?.message ?? 'נסה שוב'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title={isEdit ? 'עריכת נהג' : 'נהג חדש'} onBack={() => navigation.goBack()} />
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={isEdit ? 'עריכת נהג' : 'נהג חדש'} onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            <AppText weight="bold" style={styles.cardTitle}>
              פרטים אישיים
            </AppText>

            <Field label="שם מלא" error={errors.full_name}>
              <Input value={form.full_name} onChangeText={(v) => set('full_name', v)} hasError={!!errors.full_name} />
            </Field>

            <Field label="טלפון" error={errors.phone}>
              <InputLtr
                value={form.phone}
                onChangeText={(v) => set('phone', v)}
                keyboardType="phone-pad"
                hasError={!!errors.phone}
              />
            </Field>

            <Field label="תעודת זהות" error={errors.national_id}>
              <InputLtr
                value={form.national_id}
                onChangeText={(v) => set('national_id', v)}
                keyboardType="number-pad"
                hasError={!!errors.national_id}
              />
            </Field>

            <Field label="מספר עובד" error={errors.employee_number}>
              <InputLtr
                value={form.employee_number}
                onChangeText={(v) => set('employee_number', v)}
                hasError={!!errors.employee_number}
              />
            </Field>
          </Card>

          <Card style={styles.card}>
            <AppText weight="bold" style={styles.cardTitle}>
              רישיון נהיגה
            </AppText>

            <Field label="דרגת רישיון" error={errors.license_classes}>
              <Select
                value={form.license_classes || null}
                onChange={(v) => set('license_classes', v ?? '')}
                options={LICENSE_CLASS_OPTIONS}
                placeholder="בחר דרגת רישיון"
                hasError={!!errors.license_classes}
              />
            </Field>

            <Field label="תוקף רישיון" error={errors.license_expiry}>
              <DateField
                value={form.license_expiry || null}
                onChange={(iso) => set('license_expiry', iso ?? '')}
                hasError={!!errors.license_expiry}
              />
            </Field>
          </Card>

          {!isEdit && (
            <Card style={styles.card}>
              <AppText weight="bold" style={styles.cardTitle}>
                גישה לאפליקציה
              </AppText>

              <Field label="מייל" error={errors.email}>
                <InputLtr
                  value={form.email}
                  onChangeText={(v) => set('email', v)}
                  keyboardType="email-address"
                  hasError={!!errors.email}
                />
              </Field>

              <Field label="סיסמה" error={errors.password}>
                <InputLtr
                  value={form.password}
                  onChangeText={(v) => set('password', v)}
                  secureTextEntry
                  hasError={!!errors.password}
                />
              </Field>
            </Card>
          )}

          <PrimaryButton label={isEdit ? 'שמור שינויים' : 'צור נהג'} onPress={save} loading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 48 },
  card: { gap: SPACING.md },
  cardTitle: { fontSize: 15.5, color: COLORS.text },
});
