import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DateField } from '../ui/DateField';
import { DLtrText, DText, HoverPressable, StatusPill } from '../desktop/primitives';
import { GroupLabel, pageStyles } from '../desktop/record/RecordPage';
import { DESKTOP_COLORS, DESKTOP_TONES, type DesktopTone } from '../desktop/desktopTheme';
import { dueState, dueText } from '../../lib/meetingPlan';
import { INSPECTION_STATE_META, formatIsoDay, inspectionRepeatLabel, todayIso } from '../../lib/inspections';
import type { RootStackParamList } from '../../navigation/types';
import { useVehicleInspections } from './useVehicleInspections';
import { defectsText, latestNextDue } from './VehicleInspectionsCard';
import { t, dirIcon } from '../../lib/i18n';
import { errorMessage } from '../../lib/requestError';

const HISTORY_SHOWN = 6;
const STATE_TONE: Record<string, DesktopTone> = { ok: 'ok', soon: 'warn', expired: 'bad', missing: 'neutral', info: 'neutral' };

/**
 * "בדיקות בטיחות" in a vehicle's card on the desktop: the next inspection
 * (and a way to move it) beside the inspections the vehicle had.
 */
export function VehicleInspectionsDesktopSection({ companyId, vehicleId, archived }: { companyId: string; vehicleId: string; archived: boolean }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { plan, entries, repeatMonths, error, draft, move } = useVehicleInspections(companyId, vehicleId);
  const [saving, setSaving] = useState(false);
  const [moveError, setMoveError] = useState('');

  const change = async (value: string | null) => {
    if (!value || value === plan?.nextDue || saving) return;
    if (value < todayIso() || value > latestNextDue()) {
      setMoveError(t('inspection.dateRange'));
      return;
    }
    setSaving(true);
    setMoveError('');
    try {
      await move(value);
    } catch (e) {
      setMoveError(errorMessage(e, t('common.saveDateFailedRetry')));
    } finally {
      setSaving(false);
    }
  };

  const state = plan?.nextDue ? dueState(plan.nextDue) : null;
  const dueColor = state === 'late' ? DESKTOP_TONES.bad.fg : state && state !== 'later' ? DESKTOP_TONES.warn.fg : DESKTOP_COLORS.ink;
  const shown = (entries ?? []).slice(0, HISTORY_SHOWN);
  const open = (inspectionId?: string) => navigation.navigate('SafetyInspection', inspectionId ? { vehicleId, inspectionId } : { vehicleId });

  return (
    <>
      <View style={pageStyles.docsHead}>
        <DText weight="bold" style={pageStyles.docsTitle}>{t('nav.safetyInspections')}</DText>
        <DText style={pageStyles.mutedText}>{t('inspection.sectionHint')}</DText>
      </View>
      <View style={pageStyles.gridRow}>
        <View style={pageStyles.halfCell}>
          <GroupLabel>{plan?.firstInspection ? t('inspection.first') : t('inspection.next')}</GroupLabel>
          <View style={[pageStyles.card, styles.body]}>
            {!!error && <DText style={styles.error}>{error}</DText>}
            {!archived && (
              <View style={styles.dueRow}>
                <DLtrText weight="bold" style={[styles.dueDate, { color: plan?.nextDue ? dueColor : DESKTOP_COLORS.inkFaint }]}>
                  {plan?.nextDue ? formatIsoDay(plan.nextDue) : t('inspection.noDateSet')}
                </DLtrText>
                {plan?.nextDue && state !== 'later' && <StatusPill tone={state === 'late' ? 'bad' : 'warn'} label={dueText(plan.nextDue)} />}
              </View>
            )}
            <DText style={pageStyles.mutedText}>
              {repeatMonths > 0 ? t('inspection.repeatLabel', { repeatMonths: inspectionRepeatLabel(repeatMonths) }) : t('inspection.noFixedReminders')}
              {plan?.lastInspection ? t('inspection.lastOn', { v1: formatIsoDay(plan.lastInspection) }) : t('inspection.noneYetSuffix')}
            </DText>
            {!!plan?.lastDefects && (
              <View style={styles.defects}>
                <Ionicons name="warning-outline" size={16} color={DESKTOP_TONES.bad.fg} />
                <DText weight="semiBold" style={styles.defectsText}>{t('inspection.hasDefectsColon')} {defectsText(plan.lastDefects)} {t('inspection.inLast')}</DText>
              </View>
            )}
            {!archived && plan && (
              <View style={styles.move}>
                <DText style={pageStyles.editFieldLabel}>{t('inspection.changeNextDate')}</DText>
                <DateField value={plan.nextDue} onChange={(value) => void change(value)} placeholder={t('date.chooseDateAction')} disabled={saving} hasError={!!moveError} />
                {!!moveError && <DText style={styles.error} accessibilityRole="alert">{moveError}</DText>}
                {saving && <DText style={pageStyles.mutedText}>{t('common.savingEllipsis')}</DText>}
              </View>
            )}
            {!archived && (
              <HoverPressable style={[pageStyles.primaryBtn, styles.button]} hoverStyle={pageStyles.primaryBtnHover} pressStyle={pageStyles.pressDown} onPress={() => open(draft?.id)}>
                <Ionicons name={draft ? 'play-outline' : 'add'} size={16} color="#FFFFFF" />
                <DText weight="semiBold" style={pageStyles.primaryBtnText}>{draft ? t('inspection.continueStarted') : t('inspection.new')}</DText>
              </HoverPressable>
            )}
          </View>
        </View>

        <View style={pageStyles.halfCell}>
          <GroupLabel
            action={
              (entries?.length ?? 0) > HISTORY_SHOWN ? (
                <HoverPressable style={pageStyles.linkBtn} hoverStyle={pageStyles.softBtnHover} onPress={() => navigation.navigate('SafetyInspections')} accessibilityLabel={t('inspection.all')}>
                  <DText weight="semiBold" style={pageStyles.linkText}>{t('common.allOpen')}{entries!.length})</DText>
                </HoverPressable>
              ) : undefined
            }
          >
            {t('inspection.previous')}
          </GroupLabel>
          <View style={[pageStyles.card, pageStyles.listCard]}>
            {entries === null ? (
              <DText style={[pageStyles.mutedText, styles.empty]}>{t('common.loadingEllipsis')}</DText>
            ) : shown.length === 0 ? (
              <DText style={[pageStyles.mutedText, styles.empty]}>{t('inspection.noneForVehicle')}</DText>
            ) : (
              shown.map(({ row, state: rowState }, index) => {
                const meta = INSPECTION_STATE_META[rowState];
                const defects = row.defect_count > 0 && rowState !== 'draft' ? defectsText(row.defect_count) : null;
                return (
                  <HoverPressable
                    key={row.id}
                    style={[pageStyles.detailRow, index > 0 && pageStyles.rowDivider]}
                    hoverStyle={pageStyles.rowHover}
                    onPress={() => open(row.id)}
                    accessibilityLabel={t('inspection.fromLabel', { v1: formatIsoDay(row.inspection_date), label: meta.label, v2: defects ? `, ${defects}` : '' })}
                  >
                    <DLtrText weight="semiBold" style={styles.rowDate}>{formatIsoDay(row.inspection_date)}</DLtrText>
                    <View style={pageStyles.flex}>
                      <DText style={pageStyles.mutedText} numberOfLines={1}>
                        {[row.officer_name, defects].filter(Boolean).join(' · ') || ' '}
                      </DText>
                    </View>
                    <StatusPill tone={STATE_TONE[meta.tone]} label={meta.label} />
                    <Ionicons name={dirIcon('chevron-back')} size={15} color={DESKTOP_COLORS.inkFaint} />
                  </HoverPressable>
                );
              })
            )}
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 10 },
  dueRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  dueDate: { fontSize: 24, lineHeight: 30 },
  defects: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: DESKTOP_TONES.bad.bg },
  defectsText: { fontSize: 14, color: DESKTOP_TONES.bad.fg, flex: 1 },
  move: { gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  button: { justifyContent: 'center', marginTop: 4 },
  error: { fontSize: 13.5, color: DESKTOP_TONES.bad.fg },
  empty: { padding: 16 },
  rowDate: { fontSize: 14.5, width: 92 },
});
