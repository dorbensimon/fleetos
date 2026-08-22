import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, ScreenHeader, Card, InfoRow, LoadingState } from '../../components/ui';
import { SPACING, formatDate } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { RootStackParamList } from '../../navigation/types';

/**
 * The logged-in admin's own details, reached from the hamburger menu.
 * Read-only for now — profile self-editing isn't part of the app yet.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'AdminProfile'>;

export default function AdminProfileScreen({ navigation }: Props) {
  const { profile, company } = useCompany();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const { data } = await supabase.auth.getUser();
        if (active) {
          setEmail(data.user?.email ?? null);
          setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  return (
    <Screen>
      <ScreenHeader title="הפרטים שלי" subtitle={profile?.full_name ?? undefined} onBack={() => navigation.goBack()} />

      {loading ? (
        <LoadingState />
      ) : (
        <View style={styles.content}>
          <Card style={styles.card}>
            <InfoRow label="שם מלא" value={profile?.full_name} />
            <InfoRow label="אימייל" value={email} />
            <InfoRow label="טלפון" value={profile?.phone} />
            <InfoRow label="תפקיד" value="אדמין" />
          </Card>

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
});
