import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, ScreenHeader, Card, InfoRow, LoadingState, ErrorState, SecondaryButton } from '../../components/ui';
import { SPACING, formatDate } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { getDriver, listDepartments, DriverRow, Department } from '../../lib/adminApi';
import { formatPhone } from '../../lib/phone';
import { RootStackParamList } from '../../navigation/types';
import { departmentNameById } from '../../lib/driverFields';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverProfile'>;

export default function DriverProfileScreen({ navigation }: Props) {
  const { profile, company, companyId } = useCompany();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setError(null);
    if (!profile) {
      if (requestId === loadRequest.current) {
        setError('פרופיל הנהג אינו זמין');
        setLoading(false);
      }
      return;
    }
    try {
      const [loadedDriver, { data: auth }, deps] = await Promise.all([
        getDriver(profile.id),
        supabase.auth.getUser(),
        companyId ? listDepartments(companyId) : Promise.resolve([]),
      ]);
      if (requestId !== loadRequest.current) return;
      setDriver(loadedDriver);
      setEmail(auth.user?.email ?? null);
      setDepartments(deps);
    } catch (err: any) {
      if (requestId === loadRequest.current) {
        setError(err?.message ?? 'טעינת הפרטים נכשלה');
      }
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [profile, companyId]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => { loadRequest.current += 1; };
    }, [load])
  );

  const departmentName = departmentNameById(departments, driver?.department_id);
  const startEdit = () => profile && navigation.navigate('DriverForm', { driverId: profile.id });

  return (
    <Screen>
      <ScreenHeader
        title="הפרטים שלי"
        subtitle={driver?.full_name ?? undefined}
        onBack={() => navigation.goBack()}
        right={!loading ? <SecondaryButton label="עריכה" icon="pencil-outline" onPress={startEdit} /> : undefined}
      />
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={load} /> : (
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
            <InfoRow label="תאריך הצטרפות לאפליקציה" value={driver?.created_at ? formatDate(driver.created_at) : null} />
          </Card>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 48 },
  card: { gap: SPACING.md },
});
