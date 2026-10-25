// 'דורש טיפול' של המנהל
import React, { useCallback, useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { attentionRoute, type AttentionGroup } from '../../lib/attention';
import { loadAttention } from '../../lib/adminApi/attention';
import { useCompany } from '../../lib/CompanyContext';
import { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { AttentionMobile } from './mobile/AttentionMobile';
import { t } from '../../lib/i18n';
import { errorMessage } from '../../lib/requestError';

type Props = NativeStackScreenProps<RootStackParamList, 'Attention'>;

// טוען ומציג (בטלפון; במחשב הרשימה בתפריט שבראש הדשבורד)
export default function AttentionScreen({ navigation }: Props) {
  const { companyId } = useCompany();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const [groups, setGroups] = useState<AttentionGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Desktop shows the same list in the dashboard's top-bar menu.
  useEffect(() => {
    if (isDesktop) navigation.replace('AdminHome');
  }, [isDesktop, navigation]);

  const load = useCallback(async () => {
    if (!companyId) {
      setError(t('company.noLinkedCompany'));
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setGroups(await loadAttention(companyId));
    } catch (e: any) {
      setError(errorMessage(e, t('attention.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // Coming back from a fixed driver or vehicle shows the list without it.
  useFocusEffect(
    useCallback(() => {
      if (!isDesktop) void load();
    }, [load, isDesktop])
  );

  if (isDesktop) return null;

  return (
    <AttentionMobile
      insetTop={insets.top}
      insetBottom={insets.bottom}
      loading={loading}
      refreshing={refreshing}
      error={error}
      groups={groups}
      onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdminHome'))}
      onRetry={() => {
        setLoading(true);
        void load();
      }}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
      onHome={() => navigation.navigate('AdminHome')}
      // Each task opens on the exact field or folder it is about, lit up.
      onOpen={(item) => {
        const route = attentionRoute(item);
        navigation.navigate(route.screen as any, route.params as any);
      }}
      onAllValidity={() => navigation.navigate('Notifications', { section: 'validity' })}
    />
  );
}
