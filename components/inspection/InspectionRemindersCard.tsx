import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DText, HoverPressable, prefersReducedMotion } from '../desktop/primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from '../desktop/desktopTheme';
import { pageStyles } from '../desktop/record/RecordPage';
import { LeadControl } from '../desktop/NotificationsHubDesktopView';
import { LiquidGlassSwitch } from '../ui/LiquidGlassSwitch';
import { useNotificationPreferences } from '../../lib/useNotificationPreferences';
import { LEAD_RULES } from '../../lib/notificationPreferencesApi';
import { INSPECTION_REPEAT_OPTIONS, saveInspectionSettings } from '../../lib/inspections';
import { t } from '../../lib/i18n';
import { errorMessage } from '../../lib/requestError';

const TYPE = 'vehicle_safety_check_due' as const;

/**
 * Everything about when safety inspections come up, in one desktop card:
 * how often each vehicle is checked (company), whether I get the alert (me),
 * and how many days ahead it goes out (company).
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
  const prefs = useNotificationPreferences();
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState('');
  const reduceMotion = prefersReducedMotion();

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

  const alertOn = prefs.prefs?.[TYPE] ?? true;
  const rule = LEAD_RULES[TYPE]!;
  const lead = prefs.leads?.values[TYPE];
  const leadEditable = !prefs.isDriver && lead != null && !!prefs.leads?.perType;

  return (
    <View style={[pageStyles.card, pageStyles.listCard]}>
      <View style={styles.section}>
        <View style={styles.head}>
          <Ionicons name="repeat" size={16} color={DESKTOP_COLORS.inkMuted} />
          <DText weight="semiBold" style={styles.headText}>{t('inspection.howOftenEach')}</DText>
        </View>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {INSPECTION_REPEAT_OPTIONS.map((option) => {
            const on = option.months === repeatMonths;
            return (
              <HoverPressable
                key={option.months}
                style={[styles.chip, on && styles.chipOn]}
                hoverStyle={on ? undefined : styles.chipHover}
                pressMotionStyle={pageStyles.pressDown}
                onPress={() => void choose(option.months)}
                disabled={saving !== null}
                accessibilityRole="radio"
                accessibilityState={{ checked: on, busy: saving === option.months }}
                accessibilityLabel={option.label}
              >
                {on && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                <DText weight="semiBold" style={[styles.chipText, on && styles.chipTextOn]}>{option.label}</DText>
              </HoverPressable>
            );
          })}
        </View>
        <DText style={styles.hint}>{repeatMonths === 0 ? t('inspection.noRemindersHint') : t('inspection.nextDateHint')}</DText>
        {!!error && <DText style={styles.error} accessibilityRole="alert">{error}</DText>}
      </View>

      <View style={[styles.section, styles.divider]}>
        <View style={styles.alertRow}>
          <View style={[styles.alertIcon, !alertOn && styles.alertIconOff]}>
            <Ionicons name={alertOn ? 'notifications' : 'notifications-off-outline'} size={17} color={alertOn ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkFaint} />
          </View>
          <View style={pageStyles.flex}>
            <DText weight="semiBold" style={styles.alertTitle}>{t('inspection.alertMe')}</DText>
            <DText style={styles.hint}>{alertOn ? t('prefs.type.safetyInspectionDesc') : t('inspection.alertOffHint')}</DText>
          </View>
          {prefs.prefs && (
            <LiquidGlassSwitch
              value={alertOn}
              onValueChange={(next) => void prefs.toggle(TYPE, next)}
              disabled={prefs.savingType === TYPE}
              accessibilityLabel={t('inspection.alertMe')}
              tint={DESKTOP_COLORS.brand}
              reduceMotion={reduceMotion}
            />
          )}
        </View>
        {leadEditable && (
          <>
            <LeadControl
              type={TYPE}
              label={t('prefs.type.safetyInspection')}
              rule={rule}
              value={lead!}
              saving={prefs.savingLeadType === TYPE}
              dimmed={!alertOn || repeatMonths === 0}
              onCommit={(next) => prefs.setLead(TYPE, next)}
            />
            <DText style={styles.hint}>{t('inspection.leadShared')}</DText>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { padding: 16, gap: 10 },
  divider: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  head: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  headText: { fontSize: 14.5 },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    backgroundColor: DESKTOP_COLORS.surface,
    ...webOnly({ transition: 'background-color 150ms ease, border-color 150ms ease, transform 120ms ease-out' }),
  },
  chipHover: { backgroundColor: DESKTOP_COLORS.rowHover, borderColor: DESKTOP_COLORS.borderInput },
  chipOn: { backgroundColor: DESKTOP_COLORS.brand, borderColor: DESKTOP_COLORS.brand },
  chipText: { fontSize: 13, color: DESKTOP_COLORS.ink },
  chipTextOn: { color: '#FFFFFF' },
  hint: { fontSize: 12.5, lineHeight: 18, color: DESKTOP_COLORS.inkMuted },
  error: { fontSize: 13, color: DESKTOP_TONES.bad.fg },
  alertRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  alertIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: 'rgba(0,136,204,0.10)', alignItems: 'center', justifyContent: 'center' },
  alertIconOff: { backgroundColor: DESKTOP_COLORS.canvas },
  alertTitle: { fontSize: 14.5 },
});
