import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DKText, STATUS, Surface } from '../driverKit';
import { DateField } from '../ui/DateField';
import { formatIsoDay, repeatLabel, todayIso } from '../../lib/checklistForms';
import { dueState, type PlanRow } from '../../lib/meetingPlan';
import { DuePill } from './DuePill';

/**
 * "המפגש הבא" in a driver's folder on a repeating form: the date, how far off
 * it is, and a date picker to move it for this driver only.
 */
export function NextMeetingCard({
  row,
  repeatMonths,
  canEdit,
  onMove,
}: {
  row: PlanRow;
  repeatMonths: number;
  canEdit: boolean;
  onMove: (nextDue: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const state = dueState(row.nextDue);
  const tone = state === 'late' ? STATUS.expired : state === 'later' ? null : STATUS.soon;

  const change = async (value: string | null) => {
    if (!value || value === row.nextDue || saving) return;
    if (value < todayIso()) {
      setError('בחרו תאריך מהיום והלאה');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onMove(value);
    } catch (e) {
      setError((e as Error)?.message || 'שמירת התאריך נכשלה. נסו שוב.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Surface style={styles.card}>
      <View style={styles.top}>
        <View style={[styles.icon, { backgroundColor: tone?.soft ?? DK.accentSoft }]}>
          <Ionicons name={state === 'late' ? 'alert-circle' : 'calendar'} size={24} color={tone?.fg ?? DK.accent} />
        </View>
        <View style={styles.flex}>
          <DKText variant="caption" color={DK.muted}>{row.firstMeeting ? 'המפגש הראשון' : 'המפגש הבא'}</DKText>
          <DKText variant="heading">{formatIsoDay(row.nextDue)}</DKText>
        </View>
        {state !== 'later' && <DuePill nextDue={row.nextDue} />}
      </View>
      <DKText variant="caption" color={DK.muted}>
        {`מפגש ${repeatLabel(repeatMonths)}`}
        {row.lastMeeting ? ` · האחרון היה ב-${formatIsoDay(row.lastMeeting)}` : ' · עוד לא התקיים מפגש'}
      </DKText>
      {canEdit && (
        <View style={styles.move}>
          <DKText variant="label">שינוי התאריך לנהג הזה</DKText>
          <DateField value={row.nextDue} onChange={(value) => void change(value)} placeholder="בחירת תאריך" disabled={saving} hasError={!!error} />
          {!!error && <DKText variant="caption" color={STATUS.expired.fg} accessibilityRole="alert">{error}</DKText>}
          {saving && <DKText variant="caption" color={DK.muted}>שומר…</DKText>}
        </View>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, marginBottom: 12, padding: 16 },
  top: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  move: { gap: 6, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
});
