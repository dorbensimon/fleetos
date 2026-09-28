import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DKText, STATUS } from '../driverKit';
import { dueState, dueText } from '../../lib/meetingPlan';
import { t } from '../../lib/i18n';

/**
 * When a driver's next meeting is due, as a small pill: red when late,
 * amber within two weeks, quiet after that. Always spelled out in words.
 */
export function DuePill({ nextDue, firstMeeting }: { nextDue: string; firstMeeting?: boolean }) {
  const state = dueState(nextDue);
  const tone = state === 'late' ? STATUS.expired : state === 'later' ? null : STATUS.soon;
  return (
    <View style={styles.wrap}>
      {firstMeeting ? (
        <View style={[styles.pill, styles.first]}>
          <DKText variant="caption" color="#0B7B87">{t('meeting.first')}</DKText>
        </View>
      ) : null}
      <View style={[styles.pill, { backgroundColor: tone?.soft ?? DK.surfaceSunk }]}>
        {state === 'late' ? <Ionicons name="alert-circle" size={13} color={STATUS.expired.fg} /> : null}
        <DKText variant="caption" color={tone?.fg ?? DK.muted}>{dueText(nextDue)}</DKText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  pill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  first: { backgroundColor: 'rgba(14,159,175,0.1)' },
});
