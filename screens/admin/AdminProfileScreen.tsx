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
import { SPACING, formatDate } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { RootStackParamList } from '../../navigation/types';

/** The logged-in admin's own details, reached from the hamburger menu. */
type Props = NativeStackScreenProps<RootStackParamList, 'AdminProfile'>;

export default function AdminProfileScreen({ navigation }: Props) {
  const { profile, company, refresh } = useCompany();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const [{ data }] = await Promise.all([supabase.auth.getUser(), refresh()]);
        if (active) {
          setEmail(data.user?.email ?? null);
          setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const startEdit = () => {
    const [firstName, ...rest] = (profile?.full_name || '').trim().split(/\s+/);
    setForm({
      firstName: profile?.full_name ? firstName : '',
      lastName: profile?.full_name ? rest.join(' ') : '',
      phone: profile?.phone || '',
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
  };

  return (
    <Screen>
      <ScreenHeader
        title="הפרטים שלי"
        subtitle={profile?.full_name ?? undefined}
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
              <InfoRow label="שם מלא" value={profile?.full_name} />
              <InfoRow label="אימייל" value={email} />
              <InfoRow label="טלפון" value={profile?.phone} />
              <InfoRow label="תפקיד" value="אדמין" />
            </Card>
          )}

          <Card style={styles.card}>
            <InfoRow label="שם החברה" value={company?.name} />
            <InfoRow label="סוג חברה" value={company?.company_type} />
            <InfoRow label="ח.פ / ע.מ" value={company?.business_id} />
            <InfoRow label="כתובת החברה" value={company?.address} />
            <InfoRow label="טלפון החברה" value={company?.phone} />
          </Card>

          <Card style={styles.card}>
            <InfoRow label="תאריך הצטרפות" value={profile?.created_at ? formatDate(profile.created_at) : null} />
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
