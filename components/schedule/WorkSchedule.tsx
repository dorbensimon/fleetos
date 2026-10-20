// סידור העבודה בטלפון כאפליקציה: לא קיים (האתר בלבד, ראה WorkSchedule.web.tsx)
import React from 'react';
import { View } from 'react-native';
import { EmptyPanel } from '../driverKit';
import { t } from '../../lib/i18n';

/** iCar is a website; the work schedule is built for the browser only. */
export function WorkSchedule(_props: { companyId: string; phone: boolean; onMenu?: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <EmptyPanel icon="calendar" title={t('schedule.title')} body={t('schedule.webOnly')} />
    </View>
  );
}
