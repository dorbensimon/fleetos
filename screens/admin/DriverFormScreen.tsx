import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Card, AppText, ScreenHeader, LoadingState, Field, Input, InputLtr, PrimaryButton } from '../../components/ui';
import { COLORS, SPACING } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { getDriver, updateDriver, createDriverAccount } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';

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
          phone: form.phone.trim() || null,
          national_id: form.national_id.trim() || null,
          employee_number: form.employee_number.trim() || null,
          license_classes: form.license_classes.trim() || null,
          license_expiry: form.license_expiry.trim() || null,
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
            national_id: form.national_id.trim() || null,
            employee_number: form.employee_number.trim() || null,
            license_classes: form.license_classes.trim() || null,
            license_expiry: form.license_expiry.trim() || null,
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

            <Field label="טלפון" optional>
              <InputLtr value={form.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" />
            </Field>

            <Field label="תעודת זהות" optional>
              <InputLtr value={form.national_id} onChangeText={(v) => set('national_id', v)} keyboardType="number-pad" />
            </Field>

            <Field label="מספר עובד" optional>
              <InputLtr value={form.employee_number} onChangeText={(v) => set('employee_number', v)} />
            </Field>
          </Card>

          <Card style={styles.card}>
            <AppText weight="bold" style={styles.cardTitle}>
              רישיון נהיגה
            </AppText>

            <Field label="דרגת רישיון" optional>
              <InputLtr
                value={form.license_classes}
                onChangeText={(v) => set('license_classes', v)}
                placeholder="B, C1..."
              />
            </Field>

            <Field label="תוקף רישיון" optional>
              <InputLtr
                value={form.license_expiry}
                onChangeText={(v) => set('license_expiry', v)}
                placeholder="YYYY-MM-DD"
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
