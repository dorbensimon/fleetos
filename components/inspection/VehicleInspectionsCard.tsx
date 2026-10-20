// בדיקות קצין בטיחות בתיק רכב (טלפון)
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DK, DKText, KitSection, KitSheet, ListRow, PrimaryAction, STATUS, Surface } from '../driverKit';
import { DateField } from '../ui/DateField';
import { DuePill } from '../checklist/DuePill';
import { dueState } from '../../lib/meetingPlan';
import { INSPECTION_STATE_META, formatIsoDay, inspectionRepeatLabel, todayIso } from '../../lib/inspections';
import type { RootStackParamList } from '../../navigation/types';
import { useVehicleInspections } from './useVehicleInspections';
import { t } from '../../lib/i18n';
import { errorMessage } from '../../lib/requestError';

// תיקיית המסמכים של בדיקות קצין בטיחות בכרטיס הרכב
export const SAFETY_FOLDER = 'safety_officer_approval';

// כמה בדיקות קודמות מוצגות
const HISTORY_SHOWN = 5;

// התאריך הכי רחוק לבדיקה הבאה (שלוש שנים)
/** The latest day the server accepts for a vehicle's next inspection: three years ahead. */
export function latestNextDue(today = todayIso()): string {
  const [y, m, d] = today.split('-').map(Number);
  return `${y + 3}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// מספר הליקויים במילים
export function defectsText(count: number): string {
  return count === 1 ? t('inspection.oneDefect') : t('inspection.defectsCount', { count });
}

// הבדיקה הבאה והיסטוריה
/**
 * "בדיקות בטיחות" in a vehicle's card on the phone: when the next inspection
 * is due (and a way to move it), whether the last one found defects, a button
 * to start one, and the inspections it had.
 */
export function VehicleInspectionsCard({ companyId, vehicleId, archived, title = t('nav.safetyInspections'), onOpenDocuments, onLeave }: {
  companyId: string; vehicleId: string; archived: boolean; title?: string;
  /** Opens the folder of the inspections' documents. */
  onOpenDocuments?: () => void;
  /** Called before going to another screen (e.g. to close the sheet holding the card). */
  onLeave?: () => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const go = (open: () => void) => {
    onLeave?.();
    open();
  };
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
  const tone = state === 'late' ? STATUS.expired : state && state !== 'later' ? STATUS.soon : null;
  const shown = (entries ?? []).slice(0, HISTORY_SHOWN);

  return (
    <View style={styles.wrap}>
      <KitSection title={title} surfaceStyle={styles.card}>
        {!!error && <DKText variant="caption" color={STATUS.expired.fg}>{error}</DKText>}
        {!archived && (
          <View style={styles.top}>
            <View style={[styles.icon, { backgroundColor: tone?.soft ?? DK.accentSoft }]}>
              <Ionicons name={state === 'late' ? 'alert-circle' : 'shield-checkmark'} size={24} color={tone?.fg ?? DK.accent} />
            </View>
            <View style={styles.flex}>
              <DKText variant="caption" color={DK.muted}>{plan?.firstInspection ? t('inspection.first') : t('inspection.next')}</DKText>
              <DKText variant="heading">{plan?.nextDue ? formatIsoDay(plan.nextDue) : t('inspection.noDateSet')}</DKText>
            </View>
            {plan?.nextDue && state !== 'later' && <DuePill nextDue={plan.nextDue} />}
          </View>
        )}
        <DKText variant="caption" color={DK.muted}>
          {repeatMonths > 0 ? t('inspection.repeatLabel', { repeatMonths: inspectionRepeatLabel(repeatMonths) }) : t('inspection.noFixedReminders')}
          {plan?.lastInspection ? t('inspection.lastOn', { v1: formatIsoDay(plan.lastInspection) }) : t('inspection.noneYetSuffix')}
        </DKText>
        {!!plan?.lastDefects && (
          <View style={styles.defects}>
            <Ionicons name="warning" size={16} color={STATUS.expired.fg} />
            <DKText variant="label" color={STATUS.expired.fg} style={styles.flex}>
              {t('inspection.hasDefectsColon')} {defectsText(plan.lastDefects)} {t('inspection.inLast')}
            </DKText>
          </View>
        )}
        {!archived && plan && (
          <View style={styles.move}>
            <DKText variant="label">{t('inspection.changeNextDate')}</DKText>
            <DateField value={plan.nextDue} onChange={(value) => void change(value)} placeholder={t('date.chooseDateAction')} disabled={saving} hasError={!!moveError} />
            {!!moveError && <DKText variant="caption" color={STATUS.expired.fg} accessibilityRole="alert">{moveError}</DKText>}
            {saving && <DKText variant="caption" color={DK.muted}>{t('common.savingEllipsis')}</DKText>}
          </View>
        )}
        {!archived && (
          <PrimaryAction
            label={draft ? t('inspection.continueStarted') : t('inspection.new')}
            icon={draft ? 'play-outline' : 'add-circle-outline'}
            onPress={() => go(() => navigation.navigate('SafetyInspection', draft ? { vehicleId, inspectionId: draft.id } : { vehicleId }))}
          />
        )}
      </KitSection>

      {onOpenDocuments && (
        <Surface style={styles.list}>
          <ListRow first icon="folder-open-outline" title={t('inspection.documents')} subtitle={t('inspection.documentsHint')} onPress={() => go(onOpenDocuments)} />
        </Surface>
      )}

      {shown.length > 0 && (
        <Surface style={styles.list}>
          {shown.map(({ row, state: rowState }, i) => {
            const meta = INSPECTION_STATE_META[rowState];
            const pill = meta.tone === 'info' ? { fg: DK.accent, soft: DK.accentSoft } : STATUS[meta.tone];
            return (
              <ListRow
                key={row.id}
                first={i === 0}
                icon="shield-checkmark-outline"
                title={formatIsoDay(row.inspection_date)}
                subtitle={[row.officer_name, row.defect_count > 0 && rowState !== 'draft' ? defectsText(row.defect_count) : null].filter(Boolean).join(' · ') || null}
                trailing={
                  <View style={[styles.pill, { backgroundColor: pill.soft }]}>
                    <DKText variant="micro" color={pill.fg}>{meta.label}</DKText>
                  </View>
                }
                onPress={() => go(() => navigation.navigate('SafetyInspection', { vehicleId, inspectionId: row.id }))}
              />
            );
          })}
          {(entries?.length ?? 0) > HISTORY_SHOWN && (
            <ListRow icon="list-outline" title={t('inspection.all')} subtitle={t('inspection.countLength', { length: entries!.length })} onPress={() => go(() => navigation.navigate('SafetyInspections'))} />
          )}
        </Surface>
      )}
    </View>
  );
}

// תיקיית בדיקות קצין בטיחות
/**
 * The safety officer's inspections as one folder in the vehicle's folder
 * list: the row shows when the next one is due, and opens a sheet with the
 * next date (and a way to move it), a new inspection, the documents and the
 * inspections done.
 */
export function VehicleInspectionsFolder({ companyId, vehicleId, archived, title, first = false, onOpenDocuments }: {
  companyId: string; vehicleId: string; archived: boolean; title: string; first?: boolean;
  onOpenDocuments?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { plan, entries } = useVehicleInspections(companyId, vehicleId);
  const late = !!plan?.nextDue && dueState(plan.nextDue) === 'late';
  const subtitle = [
    plan?.nextDue ? `${t('inspection.next')}: ${formatIsoDay(plan.nextDue)}` : t('inspection.noDateSet'),
    entries?.length ? t('inspection.countLength', { length: entries.length }) : null,
  ].filter(Boolean).join(' · ');
  return (
    <>
      <ListRow
        first={first}
        icon="shield-checkmark-outline"
        tint={late ? STATUS.expired.fg : DK.accent}
        title={title}
        subtitle={subtitle}
        onPress={() => setOpen(true)}
      />
      <KitSheet visible={open} onClose={() => setOpen(false)} title={title} icon="shield-checkmark-outline">
        {open && (
          <VehicleInspectionsCard
            companyId={companyId}
            vehicleId={vehicleId}
            archived={archived}
            title=""
            onOpenDocuments={onOpenDocuments}
            onLeave={() => setOpen(false)}
          />
        )}
      </KitSheet>
    </>
  );
}

// עיצוב הכרטיס
const styles = StyleSheet.create({
  wrap: { gap: 12 },
  flex: { flex: 1 },
  card: { gap: 12, padding: 16 },
  top: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  defects: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: STATUS.expired.soft },
  move: { gap: 6, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  list: { paddingVertical: 4 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
});
