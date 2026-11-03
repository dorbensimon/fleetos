// כרטיס תזכורות הבדיקות (מחשב)
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DesktopSelect, DText, HoverPressable } from '../desktop/primitives';
import { DESKTOP_COLORS, DESKTOP_TONES } from '../desktop/desktopTheme';
import { pageStyles } from '../desktop/record/RecordPage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { INSPECTION_REPEAT_OPTIONS, saveInspectionSettings } from '../../lib/inspections';
import { t, dirIcon } from '../../lib/i18n';
import { errorMessage } from '../../lib/requestError';

// כל כמה זמן בודקים ומתי מתריעים
/**
 * Everything about when safety inspections come up, in one desktop card:
 * how often each vehicle is checked (company), and a way to the alert's
 * settings, which live with every other alert on the notifications page.
 */
export function InspectionRemindersCard({
  companyId,
  repeatMonths,
  onRepeatSaved,
}: {
  companyId: string;
  repeatMonths: number;
  onRepeatSaved: (months: number) => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState('');

  const choose = async (months: number) => {
    if (months === repeatMonths || saving !== null) return;
    setSaving(months);
    setError('');
    try {
      const saved = await saveInspectionSettings(companyId, { repeatMonths: months });
      onRepeatSaved(saved.repeatMonths);
    } catch (e) {
      setError(errorMessage(e, t('meeting.saveFrequencyFailed')));
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={[pageStyles.card, pageStyles.listCard]}>
      <View style={styles.section}>
        <View style={styles.head}>
          <Ionicons name="repeat" size={16} color={DESKTOP_COLORS.inkMuted} />
          <DText weight="semiBold" style={styles.headText}>{t('inspection.howOftenEach')}</DText>
        </View>
        <View style={styles.select}>
          <DesktopSelect
            value={String(repeatMonths)}
            options={INSPECTION_REPEAT_OPTIONS.map((option) => ({ value: String(option.months), label: option.label }))}
            onChange={(v) => v != null && void choose(Number(v))}
          />
        </View>
        <DText style={styles.hint}>{repeatMonths === 0 ? t('inspection.noRemindersHint') : t('inspection.nextDateHint')}</DText>
        {!!error && <DText style={styles.error} accessibilityRole="alert">{error}</DText>}
      </View>

      {/* The alert itself is set with every other one, on the notifications page. */}
      <HoverPressable
        style={[styles.section, styles.divider, styles.alertRow]}
        hoverStyle={styles.alertRowHover}
        onPress={() => navigation.navigate('Notifications', { section: 'settings' })}
        accessibilityRole="link"
        accessibilityLabel={t('inspection.alertInNotifications')}
      >
        <View style={styles.alertIcon}>
          <Ionicons name="notifications" size={17} color={DESKTOP_COLORS.brand} />
        </View>
        <View style={pageStyles.flex}>
          <DText weight="semiBold" style={styles.alertTitle}>{t('inspection.alertMe')}</DText>
          <DText style={styles.hint}>{t('inspection.alertInNotifications')}</DText>
        </View>
        <Ionicons name={dirIcon('chevron-back')} size={15} color={DESKTOP_COLORS.inkFaint} />
      </HoverPressable>
    </View>
  );
}

// עיצוב הכרטיס
const styles = StyleSheet.create({
  section: { padding: 16, gap: 10 },
  divider: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  head: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  headText: { fontSize: 14.5 },
  // הרשימה הנפתחת
  select: { width: 240, maxWidth: '100%', alignSelf: 'flex-end' },
  hint: { fontSize: 12.5, lineHeight: 18, color: DESKTOP_COLORS.inkMuted },
  error: { fontSize: 13, color: DESKTOP_TONES.bad.fg },
  // שורת ההתראה
  alertRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  alertIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: 'rgba(47,91,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  alertRowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  alertTitle: { fontSize: 14.5 },
});
