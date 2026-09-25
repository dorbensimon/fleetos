import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCompany } from '../../lib/CompanyContext';
import { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { SignedDocumentsDesktopView } from '../../components/desktop/signing/SignedDocumentsDesktopView';
import { getSigningTemplatePreviewSession, listSigningTemplates, type SigningTemplate } from '../../lib/docuseal';
import { SignedDocumentsMobile } from './mobile/SignedDocumentsMobile';

/**
 * The company's signing documents. The desktop page (reached from the
 * sidebar) also creates new ones; the phone manages the existing ones —
 * view, download, send and delete.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'SignedDocuments'>;

export default function SignedDocumentsScreen({ navigation }: Props) {
  const { company, loading: companyLoading } = useCompany();
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <DesktopShell active="SignedDocuments" breadcrumbs={['ניהול', 'מסמכים חתומים']}>
        {company ? <SignedDocumentsDesktopView companyId={company.id} /> : null}
      </DesktopShell>
    );
  }
  return <SignedDocumentsPhone navigation={navigation} companyId={company?.id ?? null} companyLoading={companyLoading} />;
}

function SignedDocumentsPhone({ navigation, companyId, companyLoading }: { navigation: Props['navigation']; companyId: string | null; companyLoading: boolean }) {
  const insets = useSafeAreaInsets();
  const [templates, setTemplates] = useState<SigningTemplate[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    if (!companyId) return;
    const generation = ++request.current;
    try {
      const rows = await listSigningTemplates(companyId);
      if (generation !== request.current) return;
      setTemplates(rows);
      setError('');
    } catch (err: any) {
      if (generation === request.current) setError(err?.message || 'לא הצלחנו לטעון את המסמכים');
    }
  }, [companyId]);

  useEffect(() => {
    void load();
    return () => {
      request.current += 1;
    };
  }, [load]);

  return (
    <SignedDocumentsMobile
      insetTop={insets.top}
      insetBottom={insets.bottom}
      companyId={companyId ?? ''}
      templates={templates}
      // Right after a refresh the company is still on its way: keep loading.
      loading={!templates && !error && (!!companyId || companyLoading)}
      error={error || (!companyId && !companyLoading ? 'לא נמצאה חברה משויכת לחשבון' : '')}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
      onRetry={() => {
        setError('');
        void load();
      }}
      onBack={() => navigation.goBack()}
      viewTarget={async (template) => ({ ...(await getSigningTemplatePreviewSession(template.id)), title: template.title })}
      onOpenViewer={(target) => navigation.navigate('DocusealWebView', target)}
      onDeleted={(template) => setTemplates((prev) => (prev ?? []).filter((t) => t.id !== template.id))}
    />
  );
}
