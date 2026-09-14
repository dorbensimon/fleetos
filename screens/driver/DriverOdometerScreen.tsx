import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppText, Card, Field, InputLtr, PrimaryButton, Screen, ScreenHeader } from '../../components/ui';
import { updateOwnVehicleOdometer } from '../../lib/driverActions';
import { showAlert } from '../../lib/platformAlert';
import { COLORS, SPACING } from '../../lib/theme';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverOdometer'>;
export default function DriverOdometerScreen({ navigation, route }: Props) {
  const [value, setValue] = useState(String(route.params.currentOdometer));
  const [saving, setSaving] = useState(false);
  const next = Number(value);
  const invalid = value.trim() === '' || !Number.isSafeInteger(next) || next < route.params.currentOdometer;
  const save = async () => {
    if (invalid) { showAlert('המספר לא תקין', `הקילומטראז׳ החדש חייב להיות ${route.params.currentOdometer.toLocaleString('he-IL')} ומעלה`); return; }
    setSaving(true);
    try { await updateOwnVehicleOdometer(route.params.vehicleId, next); showAlert('הקילומטראז׳ עודכן', 'מנהל הצי יוכל לראות את המספר החדש.', [{ text: 'סיום', onPress: () => navigation.goBack() }]); }
    catch (error: any) { showAlert('העדכון נכשל', error?.message ?? 'נסה שוב'); }
    finally { setSaving(false); }
  };
  return <Screen><ScreenHeader title="עדכון קילומטראז׳" onBack={() => navigation.goBack()} /><View style={styles.content}><Card style={styles.card}><AppText style={styles.explain}>המספר הקיים הוא {route.params.currentOdometer.toLocaleString('he-IL')} ק״מ. אפשר להעלות אותו, אך לא להוריד.</AppText><Field label="הקילומטראז׳ עכשיו"><InputLtr keyboardType="number-pad" value={value} onChangeText={(text) => setValue(text.replace(/\D/g, ''))} placeholder="0" /></Field><PrimaryButton label="שמור קילומטראז׳" icon="speedometer-outline" loading={saving} onPress={save} /></Card></View></Screen>;
}
const styles = StyleSheet.create({ content: { padding: SPACING.lg }, card: { gap: SPACING.md }, explain: { color: COLORS.textMuted, textAlign: 'right', lineHeight: 21 } });
