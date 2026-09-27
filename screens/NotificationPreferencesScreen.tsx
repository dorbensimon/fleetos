import React, { useEffect } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { useIsDesktop } from '../lib/useDesktopLayout';
import { NotificationPrefsMobile } from './NotificationPrefsMobile';
import { useNotificationPreferences } from '../lib/useNotificationPreferences';

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
  const state = useNotificationPreferences({ enabled: !isDesktop });

  // On desktop the toggles live beside the notification list on one page.
  useEffect(() => {
    if (isDesktop) navigation.replace('Notifications', { section: 'settings' });
  }, [isDesktop, navigation]);

  if (isDesktop) return null;

  return <NotificationPrefsMobile insetTop={insets.top} insetBottom={insets.bottom} state={state} onBack={() => navigation.goBack()} />;
}
