import React, { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Screen,
  ScreenHeader,
  Card,
  InfoRow,
  LoadingState,
  SecondaryButton,
  PrimaryButton,
  Field,
  Input,
  InputLtr,
  useToast,
} from '../../components/ui';
import { Select } from '../../components/ui/Select';
import { DateField } from '../../components/ui/DateField';
import { SPACING } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { getDriver, updateDriver, listDepartments, DriverRow, Department } from '../../lib/adminApi';
import { formatPhone, isValidIsraeliPhone } from '../../lib/phone';
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
 * The driver's own profile — fully self-editable, per explicit product
 * decision: drivers can now change every field here (name, phone, ת.ז,
 * מספר עובד, דרגת רישיון, תוקף רישיון, מחלקה), not just contact info.
 * Every such self-edit is logged to the admin's notification feed
 * (migration 25) so the visibility trade-off is oversight, not
 * restriction.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverProfile'>;

interface FormState {
  firstName: string;
  lastName: string;
  phone: string;
  national_id: string;
  employee_number: string;
  license_classes: string;
  license_classes_2: string;
  license_expiry: string;
  department_id: string | null;
}

export default function DriverProfileScreen({ navigation }: Props) {
  const { profile, company, companyId, refresh } = useCompany();
  const { showToast } = useToast();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>({
    firstName: '',
    lastName: '',
    phone: '',
    national_id: '',
    employee_number: '',
    license_classes: '',
    license_classes_2: '',
    license_expiry: '',
    department_id: null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const load = useCallback(async () => {
    if (!profile) return;
    const [d, { data: auth }, deps] = await Promise.all([
      getDriver(profile.id),
      supabase.auth.getUser(),
      companyId ? listDepartments(companyId) : Promise.resolve([]),
    ]);
    setDriver(d);
    setEmail(auth.user?.email ?? null);
    setDepartments(deps);
  }, [profile, companyId]);

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

  const departmentName = departments.find((d) => d.id === driver?.department_id)?.name ?? null;

  const startEdit = () => {
    const [firstName, ...rest] = (driver?.full_name || '').trim().split(/\s+/);
    const [firstClass, secondClass] = (driver?.license_classes ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setForm({
      firstName: driver?.full_name ? firstName : '',
      lastName: driver?.full_name ? rest.join(' ') : '',
      phone: driver?.phone || '',
      national_id: driver?.national_id || '',
      employee_number: driver?.employee_number || '',
      license_classes: firstClass ?? '',
      license_classes_2: secondClass ?? '',
      license_expiry: driver?.license_expiry || '',
      department_id: driver?.department_id ?? null,
    });
    setErrors({});
    setEditing(true);
  };

  const save = async () => {
    if (!profile) return;
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = 'שדה חובה';
    if (!form.lastName.trim()) e.lastName = 'שדה חובה';
    if (!form.phone.trim()) e.phone = 'שדה חובה';
    else if (!isValidIsraeliPhone(form.phone)) e.phone = 'מספר טלפון לא תקין';
    if (!form.national_id.trim()) e.national_id = 'שדה חובה';
    if (!form.employee_number.trim()) e.employee_number = 'שדה חובה';
    if (!form.license_classes.trim()) e.license_classes = 'שדה חובה';
    if (!form.license_expiry.trim()) e.license_expiry = 'שדה חובה';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const licenseClasses = [form.license_classes, form.license_classes_2]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ');

    setSaving(true);
    try {
      await updateDriver(profile.id, {
        full_name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
        phone: form.phone.trim(),
        national_id: form.national_id.trim(),
        employee_number: form.employee_number.trim(),
        license_classes: licenseClasses,
        license_expiry: form.license_expiry.trim(),
        department_id: form.department_id,
      });
      setEditing(false);
      await refresh();
      await load();
      showToast('נשמר בהצלחה');
    } catch {
      Alert.alert('שמירה נכשלה', 'לא הצלחנו לשמור את השינויים. נסה שוב');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="הפרטים שלי"
        subtitle={driver?.full_name ?? undefined}
        onBack={() => navigation.goBack()}
        right={
          !editing && !loading ? (
            <SecondaryButton label="עריכה" icon="pencil-outline" onPress={startEdit} />
          ) : undefined
        }
      />

      {loading ? (
        <LoadingState />
      ) : editing ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            <Field label="שם פרטי" error={errors.firstName}>
              <Input value={form.firstName} onChangeText={(v) => set('firstName', v)} hasError={!!errors.firstName} />
            </Field>
            <Field label="שם משפחה" error={errors.lastName}>
              <Input value={form.lastName} onChangeText={(v) => set('lastName', v)} hasError={!!errors.lastName} />
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
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
                placeholder={departments.length ? 'בחר מחלקה' : 'לא הוגדרו מחלקות'}
                allowClear
              />
            </Field>
          </Card>

          <Card style={styles.card}>
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

          <View style={styles.editActions}>
            <SecondaryButton label="ביטול" onPress={() => setEditing(false)} disabled={saving} />
            <PrimaryButton label="שמור" onPress={save} loading={saving} style={styles.saveButton} />
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.content}>
          <Card style={styles.card}>
            <InfoRow label="שם מלא" value={driver?.full_name} />
            <InfoRow label="אימייל" value={email} />
            <InfoRow label="טלפון" value={driver?.phone ? formatPhone(driver.phone) : null} />
            <InfoRow label="חברה" value={company?.name} />
          </Card>

          <Card style={styles.card}>
            <InfoRow label="תעודת זהות" value={driver?.national_id} />
            <InfoRow label="מספר עובד" value={driver?.employee_number} />
            <InfoRow label="מחלקה" value={departmentName} />
            <InfoRow label="דרגת רישיון" value={driver?.license_classes} />
            <InfoRow label="תוקף רישיון" value={driver?.license_expiry} />
          </Card>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 48 },
  card: { gap: SPACING.md },
  editActions: { flexDirection: 'row-reverse', gap: SPACING.sm },
  saveButton: { flex: 1 },
});
