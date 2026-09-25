import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BrandLoader } from '../../components/ui/BrandLoader';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DriverOdometerMobile } from './DriverOdometerMobile';
import { updateOwnVehicleOdometer } from '../../lib/driverActions';
import { showAlert } from '../../lib/platformAlert';
import type { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DesktopInput, DText, HoverPressable } from '../../components/desktop/primitives';
import { DESKTOP_COLORS } from '../../components/desktop/desktopTheme';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverOdometer'>;
export default function DriverOdometerScreen({ navigation, route }: Props) {
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
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

  if (isDesktop) {
    return (
      <DesktopShell active="DriverHome" breadcrumbs={['הרכב שלי', 'עדכון קילומטראז׳']}>
        <View style={ds.wrap}>
          <View style={ds.card}>
            <DText style={ds.explain}>המספר הקיים הוא {route.params.currentOdometer.toLocaleString('he-IL')} ק״מ. אפשר להעלות אותו, אך לא להוריד.</DText>
            <DesktopInput value={value} onChangeText={(text) => setValue(text.replace(/\D/g, ''))} placeholder="0" keyboardType="number-pad" ltr />
            <HoverPressable style={[ds.button, invalid && ds.buttonDisabled]} hoverStyle={!invalid ? { backgroundColor: DESKTOP_COLORS.brandHover } : undefined} onPress={save} disabled={saving}>
              <DText weight="semiBold" style={[ds.buttonText, saving && { opacity: 0 }]}>שמור קילומטראז׳</DText>
              {saving && <BrandLoader size="small" color="#FFFFFF" style={StyleSheet.absoluteFill} />}
            </HoverPressable>
          </View>
        </View>
      </DesktopShell>
    );
  }

  return (
    <DriverOdometerMobile
      insetTop={insets.top}
      insetBottom={insets.bottom}
      current={route.params.currentOdometer}
      value={value}
      onChange={setValue}
      saving={saving}
      onSave={save}
      onBack={() => navigation.goBack()}
    />
  );
}

const ds = StyleSheet.create({
  wrap: { padding: 24, maxWidth: 380, alignSelf: 'center', width: '100%' },
  card: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 8, padding: 16, gap: 12 },
  explain: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted, lineHeight: 18 },
  button: { height: 36, borderRadius: 7, backgroundColor: DESKTOP_COLORS.brand, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { backgroundColor: DESKTOP_COLORS.surfaceMuted, borderWidth: 1, borderColor: DESKTOP_COLORS.border },
  buttonText: { fontSize: 13, color: '#FFFFFF' },
});
