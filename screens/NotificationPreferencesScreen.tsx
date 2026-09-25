import React, { useEffect } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { useIsDesktop } from '../lib/useDesktopLayout';
import { useCompany } from '../lib/CompanyContext';
import { NotificationPrefsMobile } from './NotificationPrefsMobile';
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
  const { profile } = useCompany();
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

  // On desktop the toggles live beside the notification list on one page.
  useEffect(() => {
    if (isDesktop) navigation.replace('Notifications');
  }, [isDesktop, navigation]);

  if (isDesktop) return null;

  return (
    <NotificationPrefsMobile
      insetTop={insets.top}
      insetBottom={insets.bottom}
      loading={loading}
      error={error}
      types={visibleTypes}
      prefs={prefs}
      savingType={savingType}
      onToggle={(type, value) => toggle(type, value)}
      onBack={() => navigation.goBack()}
      onRetry={load}
      personalTitle={profile?.role === 'driver' ? 'עדכונים אליי' : 'עדכונים מהנהגים'}
      lead={
        leadDays != null
          ? {
              label: LEAD_DAYS_LABEL,
              description: LEAD_DAYS_DESCRIPTION,
              draft: leadDraft,
              onDraft: setLeadDraft,
              changed: leadChanged,
              saving: savingLead,
              onSave: () => void saveLeadDays(),
            }
          : null
      }
    />
  );
}
