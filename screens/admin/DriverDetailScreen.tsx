import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, ScreenHeader, AppText, Card, InfoRow, LoadingState, SecondaryButton } from '../../components/ui';
import { COLORS, SPACING } from '../../lib/theme';
import { getDriver, DriverRow } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';

/**
 * A5 — placeholder. Full tabs (documents, certifications, assigned
 * vehicle history) come next; for now this proves the navigation and
 * shows the fields already in the database.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverDetail'>;

export default function DriverDetailScreen({ route, navigation }: Props) {
  const { driverId } = route.params;
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
        title={driver?.full_name ?? 'תיק נהג'}
        subtitle={driver?.national_id ? `ת.ז ${driver.national_id}` : undefined}
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
        <View style={styles.content}>
          <Card style={styles.card}>
            <InfoRow label="מספר עובד" value={driver?.employee_number} />
            <InfoRow label="טלפון" value={driver?.phone} />
            <InfoRow label="דרגת רישיון" value={driver?.license_classes} />
            <InfoRow label="תוקף רישיון" value={driver?.license_expiry} />
            <InfoRow label="רכב משויך" value={driver?.vehicle_plate} />
          </Card>
          <AppText style={styles.note}>
            מסמכים, הכשרות והיסטוריית רכבים יתווספו כאן בהמשך.
          </AppText>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.lg, gap: SPACING.md },
  card: { gap: 4 },
  note: { fontSize: 12.5, color: COLORS.textFaint, textAlign: 'center', marginTop: SPACING.sm },
});
