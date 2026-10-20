// סידור עבודה: נסיעות, רכבים ונהגים לפי ימים
import React from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState } from '../../components/ui';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { WorkSchedule } from '../../components/schedule/WorkSchedule';
import { useCompany } from '../../lib/CompanyContext';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { RootStackParamList } from '../../navigation/types';
import { t } from '../../lib/i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkSchedule'>;

/**
 * The manager's work schedule. On a computer it sits in the desktop shell
 * beside the sidebar; on a phone it fills the screen like the iPhone
 * Calendar app, with its own menu button.
 */
export default function WorkScheduleScreen({ navigation }: Props) {
  const { companyId } = useCompany();
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const body = companyId
    ? <WorkSchedule companyId={companyId} phone={!isDesktop} onMenu={() => navigation.navigate('Menu')} />
    : <ErrorState message={t('company.noLinkedCompany')} />;

  if (isDesktop) {
    return (
      <DesktopShell active="WorkSchedule" breadcrumbs={[t('nav.management'), t('schedule.title')]}>
        {body}
      </DesktopShell>
    );
  }
  return <View style={{ flex: 1, paddingBottom: insets.bottom }}>{body}</View>;
}
