import React, { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, ScreenHeader, Card, InfoRow, LoadingState, SecondaryButton } from '../../components/ui';
import { SPACING } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { getDriver, DriverRow } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';

/**
 * Read-only view of exactly the fields DriverFormScreen collects -
 * reached by tapping the driver's name on their card, for a quick
 * "what's actually on file" check without opening the edit form.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverPersonalDetails'>;

export default function DriverPersonalDetailsScreen({ route, navigation }: Props) {
  const { driverId } = route.params;
  const { company } = useCompany();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const d = await getDriver(driverId);
        if (active) {
          setDriver(d);
          setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [driverId])
  );

  return (
    <Screen>
      <ScreenHeader
        title="פרטי נהג"
        subtitle={driver?.full_name ?? undefined}
        onBack={() => navigation.goBack()}
        right={
          <SecondaryButton
            label="עריכה"
            icon="pencil-outline"
            onPress={() => navigation.navigate('DriverForm', { driverId })}
          />
        }
      />

      {loading ? (
        <LoadingState />
      ) : (
        <Card style={styles.card}>
          <InfoRow label="שם מלא" value={driver?.full_name} />
          <InfoRow label="חברה" value={company?.name} />
          <InfoRow label="טלפון" value={driver?.phone} />
          <InfoRow label="תעודת זהות" value={driver?.national_id} />
          <InfoRow label="מספר עובד" value={driver?.employee_number} />
          <InfoRow label="דרגת רישיון" value={driver?.license_classes} />
          <InfoRow label="תוקף רישיון" value={driver?.license_expiry} />
          <InfoRow label="רכב משויך" value={driver?.vehicle_plate} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { margin: SPACING.lg, gap: 4 },
});
