import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Card, AppText, ScreenHeader, LoadingState, Field, Input, InputLtr, PrimaryButton, useToast } from '../../components/ui';
import { Select } from '../../components/ui/Select';
import { DateField } from '../../components/ui/DateField';
import { COLORS, SPACING } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { getDriver, updateDriver, createDriverAccount, listDepartments } from '../../lib/adminApi';
import { formatPhone, isValidIsraeliPhone } from '../../lib/phone';
import { isValidEmail } from '../../lib/validation';
import { RootStackParamList } from '../../navigation/types';

const LICENSE_CLASS_OPTIONS = [
  { value: 'A2', label: 'A2 — אופנוע קל, עד 125 סמ"ק / 14.9 כ"ס' },
  { value: 'A1', label: 'A1 — אופנוע בינוני, עד 47.46 כ"ס' },
  { value: 'A', label: 'A — אופנוע כבד, ללא הגבלת הספק או נפח' },
  { value: 'B', label: 'B — רכב פרטי, עד 3,500 ק"ג ו-8 נוסעים' },
  { value: 'C1', label: 'C1 — משא קל, 3,501–12,000 ק"ג' },
  { value: 'C', label: 'C — משא כבד, ללא הגבלת משקל' },
  { value: 'C+E', label: 'C+E — רכב מחובר (משאית עם גרור/נתמך)' },
  { value: 'D1', label: 'D1 — מונית ומיניבוס ציבורי, עד 16 נוסעים' },
  { value: 'D2', label: 'D2 — אוטובוס זעיר ציבורי (היתר מיוחד)' },
  { value: 'D3', label: 'D3 — אוטובוס זעיר פרטי' },
  { value: 'D', label: 'D — אוטובוס מלא, ללא הגבלת נוסעים' },
  { value: '1', label: '1 (T) — טרקטור, טרקטורון ורכב שטח' },
  { value: 'PERMIT', label: 'היתר מכונה ניידת (צמ"ה)' },
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
  license_classes_2: string;
  license_expiry: string;
  department_id: string | null;
}

const EMPTY: FormState = {
  full_name: '',
  phone: '',
  email: '',
  password: '',
  national_id: '',
  employee_number: '',
  license_classes: '',
  license_classes_2: '',
  license_expiry: '',
  department_id: null,
};

export default function DriverFormScreen({ route, navigation }: Props) {
  const driverId = route.params?.driverId;
  const isEdit = !!driverId;
  const { companyId } = useCompany();
  const { showToast } = useToast();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const load = useCallback(async () => {
    if (companyId) {
      const deps = await listDepartments(companyId);
      setDepartments(deps.map((d) => ({ value: d.id, label: d.name })));
    }

    if (!driverId) return;
    const d = await getDriver(driverId);
    if (d) {
      const [firstClass, secondClass] = (d.license_classes ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      setForm({
        full_name: d.full_name ?? '',
        phone: d.phone ?? '',
        email: '',
        password: '',
        national_id: d.national_id ?? '',
        employee_number: d.employee_number ?? '',
        license_classes: firstClass ?? '',
        license_classes_2: secondClass ?? '',
        license_expiry: d.license_expiry ?? '',
        department_id: d.department_id,
      });
    }
  }, [driverId, companyId]);

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
    if (!form.full_name.trim()) e.full_name = 'שדה חובה';
    if (!form.phone.trim()) e.phone = 'שדה חובה';
    else if (!isValidIsraeliPhone(form.phone)) e.phone = 'מספר טלפון לא תקין';
    if (!form.national_id.trim()) e.national_id = 'שדה חובה';
    if (!form.employee_number.trim()) e.employee_number = 'שדה חובה';
    if (!form.license_classes.trim()) e.license_classes = 'שדה חובה';
    if (!form.license_expiry.trim()) e.license_expiry = 'שדה חובה';
    if (!isEdit) {
      if (!form.email.trim()) e.email = 'שדה חובה';
      else if (!isValidEmail(form.email)) e.email = 'כתובת מייל לא תקינה';
      if (!form.password || form.password.length < 6) e.password = 'לפחות 6 תווים';
    }
    return e;
  };

  const save = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const licenseClasses = [form.license_classes, form.license_classes_2]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ');

    setSaving(true);
    try {
      if (isEdit) {
        await updateDriver(driverId!, {
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          national_id: form.national_id.trim(),
          employee_number: form.employee_number.trim(),
          license_classes: licenseClasses,
          license_expiry: form.license_expiry.trim(),
          department_id: form.department_id,
        });
      } else {
        // The CompanyContext value can still be mid-fetch the moment this
        // screen mounts (its load() runs in a useEffect, after first
        // render) — refetch directly here rather than trusting a value
        // that may not have resolved yet.
        let activeCompanyId = companyId;
        if (!activeCompanyId) {
          const { data: auth } = await supabase.auth.getUser();
          if (auth.user) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('company_id')
              .eq('id', auth.user.id)
              .single();
            activeCompanyId = prof?.company_id ?? null;
          }
        }
        if (!activeCompanyId) {
          Alert.alert('שמירה נכשלה', 'לא נמצאה חברה משויכת לחשבון שלך. נסה להתחבר מחדש');
          return;
        }
        const result = await createDriverAccount({
          companyId: activeCompanyId,
          email: form.email.trim(),
          password: form.password,
          fullName: form.full_name.trim(),
          phone: form.phone.trim(),
          details: {
            national_id: form.national_id.trim(),
            employee_number: form.employee_number.trim(),
            license_classes: licenseClasses,
            license_expiry: form.license_expiry.trim(),
            department_id: form.department_id,
          },
        });
        if (!result.ok) {
          Alert.alert('יצירת הנהג נכשלה', result.error);
          return;
        }
      }
      showToast('נשמר בהצלחה');
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
                value={formatPhone(form.phone)}
                onChangeText={(v) => set('phone', v.replace(/\D/g, ''))}
                placeholder="052-7898655"
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

            <Field label="מחלקה" optional>
              <Select
                value={form.department_id}
                onChange={(v) => set('department_id', v)}
                options={departments}
                placeholder={departments.length ? 'בחר מחלקה' : 'לא הוגדרו מחלקות'}
                allowClear
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
                onChange={(v) => {
                  set('license_classes', v ?? '');
                  if (!v) set('license_classes_2', '');
                }}
                options={LICENSE_CLASS_OPTIONS}
                placeholder="בחר דרגת רישיון"
                hasError={!!errors.license_classes}
              />
            </Field>

            {!!form.license_classes && (
              <Field label="דרגת רישיון נוספת" optional>
                <Select
                  value={form.license_classes_2 || null}
                  onChange={(v) => set('license_classes_2', v ?? '')}
                  options={LICENSE_CLASS_OPTIONS.filter((o) => o.value !== form.license_classes)}
                  placeholder="בחר דרגה נוספת (אם יש)"
                  allowClear
                />
              </Field>
            )}

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
