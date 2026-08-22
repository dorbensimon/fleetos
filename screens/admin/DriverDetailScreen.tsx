import React, { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, ScreenHeader, AppText, Card, InfoRow, LoadingState, SecondaryButton } from '../../components/ui';
import { COLORS, SPACING } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { getDriver, deleteDriver, DriverRow } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';

/**
 * A5 — placeholder. Full tabs (documents, certifications, assigned
 * vehicle history) come next; for now this proves the navigation and
 * shows the fields already in the database.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverDetail'>;

export default function DriverDetailScreen({ route, navigation }: Props) {
  const { driverId } = route.params;
  const { companyId } = useCompany();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = () => {
    Alert.alert(
      'מחיקת נהג',
      `האם למחוק לצמיתות את ${driver?.full_name ?? 'הנהג'}? הפעולה אינה ניתנת לשחזור.`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחק לצמיתות',
          style: 'destructive',
          onPress: async () => {
            if (!companyId) return;
            setDeleting(true);
            const result = await deleteDriver(driverId, companyId);
            setDeleting(false);
            if (!result.ok) {
              Alert.alert('מחיקה נכשלה', result.error);
              return;
            }
            navigation.goBack();
          },
        },
      ]
    );
  };

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
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={confirmDelete}
              disabled={deleting}
              hitSlop={8}
            >
              <Ionicons name="trash-outline" size={17} color={COLORS.dangerText} />
            </TouchableOpacity>
            <SecondaryButton
              label="עריכה"
              icon="pencil-outline"
              onPress={() => navigation.navigate('DriverForm', { driverId })}
            />
          </View>
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
  headerActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.sm },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
