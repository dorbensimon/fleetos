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
import { loadMeetingPlan, type PlanRow } from '../../lib/meetingPlan';
import { requestErrorDetails } from '../../lib/requestError';
import { useFocusEffect } from '@react-navigation/native';
import { t } from '../../lib/i18n';
import { listCompanyFolders, type CompanyFolder } from '../../lib/folderCatalog';

/**
 * The company's signing documents. The desktop page (reached from the
 * sidebar) also creates new ones; the phone manages the existing ones —
 * view, download, send and delete.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'SignedDocuments'>;

export default function SignedDocumentsScreen({ navigation, route }: Props) {
  const { company, loading: companyLoading } = useCompany();
  const isDesktop = useIsDesktop();
  const openMeeting = route.params?.openMeeting;
  const meetingOpened = useCallback(() => navigation.setParams({ openMeeting: undefined }), [navigation]);

  if (isDesktop) {
    return (
      <DesktopShell active="SignedDocuments" breadcrumbs={[t('nav.management'), t('nav.signedDocuments')]}>
        {company ? <SignedDocumentsDesktopView companyId={company.id} openMeetingTemplateId={openMeeting} onMeetingOpened={meetingOpened} /> : null}
      </DesktopShell>
    );
  }
  return <SignedDocumentsPhone navigation={navigation} companyId={company?.id ?? null} companyLoading={companyLoading} openMeeting={openMeeting} onMeetingOpened={meetingOpened} />;
}

function SignedDocumentsPhone({
  navigation, companyId, companyLoading, openMeeting, onMeetingOpened,
}: { navigation: Props['navigation']; companyId: string | null; companyLoading: boolean; openMeeting?: string; onMeetingOpened: () => void }) {
  const insets = useSafeAreaInsets();
  const [templates, setTemplates] = useState<SigningTemplate[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [catalog, setCatalog] = useState<CompanyFolder[]>([]);
  const request = useRef(0);

  // Who needs a meeting: fresh every time the screen is shown (after a meeting, too).
  const loadPlan = useCallback(async () => {
    if (!companyId) return;
    setPlan(await loadMeetingPlan(companyId).catch(() => []));
  }, [companyId]);
  useFocusEffect(useCallback(() => { void loadPlan(); }, [loadPlan]));

  const load = useCallback(async () => {
    if (!companyId) return;
    const generation = ++request.current;
    try {
      const [rows, folders] = await Promise.all([
        listSigningTemplates(companyId),
        // Extra: the page still works when the folders fail to load.
        listCompanyFolders(companyId).then((result) => result.folders).catch(() => [] as CompanyFolder[]),
      ]);
      if (generation !== request.current) return;
      setTemplates(rows);
      setCatalog(folders);
      setError('');
    } catch (err) {
      if (generation === request.current) {
        const details = requestErrorDetails(err, t('documents.loadFailed'));
        setError([details.message, details.hint].filter(Boolean).join(' '));
      }
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
      error={error || (!companyId && !companyLoading ? t('company.noLinkedToAccount') : '')}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await Promise.all([load(), loadPlan()]);
        setRefreshing(false);
      }}
      onRetry={() => {
        setError('');
        void load();
      }}
      onBack={() => navigation.goBack()}
      viewTarget={async (template) => ({ ...(await getSigningTemplatePreviewSession(template.id)), title: template.title })}
      onOpenViewer={(target) => navigation.navigate('DocusealWebView', target)}
      onDeleted={(template) => setTemplates((prev) => (prev ?? []).filter((entry) => entry.id !== template.id))}
      onStartMeeting={(templateId, driverId) => navigation.navigate('ChecklistMeeting', { driverId, templateId })}
      plan={plan}
      openMeeting={openMeeting}
      onMeetingOpened={onMeetingOpened}
      catalog={catalog}
      onFoldersChanged={() => void load()}
    />
  );
}
