import React, { useEffect } from 'react';
import { Pressable, View, ScrollView, StyleSheet } from 'react-native';
import { BrandLoader } from '../components/ui/BrandLoader';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LoadingState,
  ErrorState,
  AppText,
  BackButton,
  Input,
} from '../components/ui';
import { LiquidGlassSwitch } from '../components/ui/LiquidGlassSwitch';
import { AdminGradientBackground } from '../components/admin/AdminGradientBackground';
import { RootStackParamList } from '../navigation/types';
import { DC_COLORS, DC_SPACING, DC_TYPO } from '../components/driverCard/driverCardTheme';
import { useIsDesktop } from '../lib/useDesktopLayout';
import { LEAD_DAYS_DESCRIPTION, LEAD_DAYS_LABEL, useNotificationPreferences } from '../lib/useNotificationPreferences';

/**
 * Notification preferences, reached from Settings — shared by admin and
 * driver. Each role sees only notification types that are relevant to it.
 * Phone only: on desktop the same toggles sit beside the notification list
 * (NotificationsHubDesktopView), so this route forwards there.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'NotificationPreferences'>;

export default function NotificationPreferencesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const {
    loading,
    error,
    load,
    prefs,
    savingType,
    toggle,
    visibleTypes,
    leadDays,
    leadDraft,
    setLeadDraft,
    savingLead,
    saveLeadDays,
    leadChanged,
  } = useNotificationPreferences({ enabled: !isDesktop });
  const leadLabel = LEAD_DAYS_LABEL;
  const leadDescription = LEAD_DAYS_DESCRIPTION;

  // On desktop the toggles live beside the notification list on one page.
  useEffect(() => {
    if (isDesktop) navigation.replace('Notifications');
  }, [isDesktop, navigation]);

  if (isDesktop) return null;

  return (
    <View style={styles.screen}>
      <AdminGradientBackground />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 76, paddingBottom: DC_SPACING.listBottomPadding + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <AppText style={[DC_TYPO.largeTitle, styles.title]}>ניהול התראות</AppText>
        {loading ? (
          <View style={styles.state}><LoadingState /></View>
        ) : error ? (
          <View style={styles.state}><ErrorState message={error} onRetry={load} /></View>
        ) : (
          <>
            {leadDays != null && (
              <>
                <AppText style={[DC_TYPO.groupTitle, styles.sectionTitle]}>הגדרות חברה</AppText>
                <View style={[styles.list, styles.leadList]}>
                  <View style={[styles.row, styles.rowLast]}>
                    <View style={styles.rowText}>
                      <AppText style={[DC_TYPO.rowLabel, styles.label]}>{leadLabel}</AppText>
                      <AppText style={styles.description}>{leadDescription}</AppText>
                    </View>
                    <View style={styles.leadControl}>
                      <Input
                        value={leadDraft}
                        onChangeText={(v) => setLeadDraft(v.replace(/\D/g, '').slice(0, 2))}
                        onSubmitEditing={() => void saveLeadDays()}
                        editable={!savingLead}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        textAlign="center"
                        style={styles.leadInput}
                      />
                      <AppText style={styles.description}>ימים</AppText>
                      <Pressable
                        style={({ pressed }) => [styles.confirmBtn, !leadChanged && !savingLead && styles.confirmBtnIdle, pressed && styles.pressDown]}
                        onPress={() => void saveLeadDays()}
                        disabled={!leadChanged || savingLead}
                        accessibilityRole="button"
                        accessibilityLabel="שמירת זמן ההתראה"
                      >
                        {savingLead ? <BrandLoader size="small" color="#FFFFFF" /> : <Ionicons name="checkmark" size={17} color="#FFFFFF" />}
                      </Pressable>
                    </View>
                  </View>
                </View>
              </>
            )}
            <AppText style={styles.hint}>בחר אילו עדכונים תרצה לקבל. כל שינוי נשמר מיד עבורך בלבד.</AppText>
            <AppText style={[DC_TYPO.groupTitle, styles.sectionTitle]}>העדפות אישיות</AppText>
            <View style={styles.list}>
              {visibleTypes.map((item, index) => (
                <View key={item.type} style={[styles.row, index === visibleTypes.length - 1 && styles.rowLast]}>
                  <View style={styles.rowText}>
                    <AppText style={[DC_TYPO.rowLabel, styles.label]}>{item.label}</AppText>
                    {!!item.description && <AppText style={styles.description}>{item.description}</AppText>}
                  </View>
                  <LiquidGlassSwitch
                    value={prefs?.[item.type] ?? true}
                    onValueChange={(value) => toggle(item.type, value)}
                    disabled={savingType === item.type}
                    accessibilityLabel={item.label}
                  />
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <View style={[styles.backButton, { top: insets.top + 12 }]}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DC_COLORS.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: DC_SPACING.screenPaddingH },
  title: { color: DC_COLORS.label, textAlign: 'right', writingDirection: 'rtl', marginBottom: 26 },
  hint: { color: DC_COLORS.labelSecondary, fontSize: 14, textAlign: 'right', writingDirection: 'rtl', marginBottom: 26 },
  sectionTitle: { color: DC_COLORS.labelTertiary, textAlign: 'right', writingDirection: 'rtl', marginBottom: 8, marginRight: 2 },
  list: { backgroundColor: DC_COLORS.surface, borderRadius: DC_SPACING.groupRadius, overflow: 'hidden' },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: DC_SPACING.iconTextGap,
    minHeight: 62,
    paddingHorizontal: DC_SPACING.rowPaddingH,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: DC_COLORS.separator,
  },
  rowLast: { borderBottomWidth: 0 },
  rowText: { flex: 1, gap: 3 },
  label: { color: DC_COLORS.label, textAlign: 'right', writingDirection: 'rtl' },
  description: { color: DC_COLORS.labelSecondary, fontSize: 12.5, textAlign: 'right', writingDirection: 'rtl' },
  state: { paddingTop: 36 },
  leadList: { marginBottom: 26 },
  leadControl: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  leadInput: { width: 56, height: 38, paddingHorizontal: 6 },
  confirmBtn: { width: 34, height: 34, borderRadius: 9, backgroundColor: DC_COLORS.blue, alignItems: 'center', justifyContent: 'center' },
  confirmBtnIdle: { opacity: 0.35 },
  pressDown: { transform: [{ scale: 0.97 }] },
  backButton: { position: 'absolute', right: 16 },
});
