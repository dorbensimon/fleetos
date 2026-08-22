import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
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
} from '../../components/ui';
import { SPACING } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { getDriver, DriverRow } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';

/**
 * The driver's own profile. Name and phone are self-editable (RLS lets
 * a user update their own profiles row, per migration 22); the official
 * fields — ת.ז, מספר עובד, דרגת רישיון, תוקף רישיון — stay read-only,
 * same policy as everywhere else in the app: identity/licensing data
 * is admin-controlled, not self-service.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverProfile'>;

export default function DriverProfileScreen({ navigation }: Props) {
  const { profile, company, refresh } = useCompany();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const [d, { data: auth }] = await Promise.all([getDriver(profile.id), supabase.auth.getUser()]);
    setDriver(d);
    setEmail(auth.user?.email ?? null);
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

  const startEdit = () => {
    const [firstName, ...rest] = (driver?.full_name || '').trim().split(/\s+/);
    setForm({
      firstName: driver?.full_name ? firstName : '',
      lastName: driver?.full_name ? rest.join(' ') : '',
      phone: driver?.phone || '',
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
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
        phone: form.phone.trim(),
      })
      .eq('id', profile.id);
    setSaving(false);

    if (error) {
      Alert.alert('שמירה נכשלה', 'לא הצלחנו לשמור את השינויים. נסה שוב');
      return;
    }
    setEditing(false);
    await refresh();
    await load();
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
      ) : (
        <View style={styles.content}>
          {editing ? (
            <Card style={styles.card}>
              <Field label="שם פרטי" error={errors.firstName}>
                <Input
                  value={form.firstName}
                  onChangeText={(v) => setForm((f) => ({ ...f, firstName: v }))}
                  hasError={!!errors.firstName}
                />
              </Field>
              <Field label="שם משפחה" error={errors.lastName}>
                <Input
                  value={form.lastName}
                  onChangeText={(v) => setForm((f) => ({ ...f, lastName: v }))}
                  hasError={!!errors.lastName}
                />
              </Field>
              <Field label="טלפון" error={errors.phone}>
                <InputLtr
                  value={form.phone}
                  onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
                  keyboardType="phone-pad"
                  hasError={!!errors.phone}
                />
              </Field>

              <View style={styles.editActions}>
                <SecondaryButton label="ביטול" onPress={() => setEditing(false)} disabled={saving} />
                <PrimaryButton label="שמור" onPress={save} loading={saving} style={styles.saveButton} />
              </View>
            </Card>
          ) : (
            <Card style={styles.card}>
              <InfoRow label="שם מלא" value={driver?.full_name} />
              <InfoRow label="אימייל" value={email} />
              <InfoRow label="טלפון" value={driver?.phone} />
              <InfoRow label="חברה" value={company?.name} />
            </Card>
          )}

          <Card style={styles.card}>
            <InfoRow label="תעודת זהות" value={driver?.national_id} />
            <InfoRow label="מספר עובד" value={driver?.employee_number} />
            <InfoRow label="דרגת רישיון" value={driver?.license_classes} />
            <InfoRow label="תוקף רישיון" value={driver?.license_expiry} />
          </Card>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.lg, gap: SPACING.md },
  card: { gap: 4 },
  editActions: { flexDirection: 'row-reverse', gap: SPACING.sm, marginTop: SPACING.sm },
  saveButton: { flex: 1 },
});
