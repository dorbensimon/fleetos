// מסך המסמכים החתומים
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActingCompanyProvider, useCompany } from '../../lib/CompanyContext';
import { getCompany } from '../../lib/companyApi';
import type { Company } from '../../lib/supabase';
import { ErrorState, LoadingState } from '../../components/ui';
import { CreateDocumentSheet } from '../../components/desktop/signing/CreateDocumentSheet';
import { AfterReplaceSheet, FormVersionsSheet } from '../../components/desktop/signing/FormVersionSheets';
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

/**
 * The company's signing documents. The desktop page (reached from the
 * sidebar) also creates new ones; the manager's phone manages the existing
 * ones — view, download, send and delete. The platform owner opens the same
 * page for one company from its page in the control room (`companyId`), and
 * on the phone also creates forms, writes a new version and restores an
 * earlier one, like the desktop.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'SignedDocuments'>;

// בוחר מחשב או טלפון
export default function SignedDocumentsScreen({ navigation, route }: Props) {
  const { company, profile, loading: companyLoading } = useCompany();
  const isDesktop = useIsDesktop();
  const openMeeting = route.params?.openMeeting;
  const meetingOpened = useCallback(() => navigation.setParams({ openMeeting: undefined }), [navigation]);

  if (profile?.role === 'owner') {
    return <OwnerCompanyDocuments navigation={navigation} companyId={route.params?.companyId ?? null} openMeeting={openMeeting} onMeetingOpened={meetingOpened} />;
  }

  if (isDesktop) {
    return (
      <DesktopShell active="SignedDocuments" breadcrumbs={[t('nav.management'), t('nav.signedDocuments')]}>
        {company ? <SignedDocumentsDesktopView companyId={company.id} openMeetingTemplateId={openMeeting} onMeetingOpened={meetingOpened} /> : null}
      </DesktopShell>
    );
  }
  return <SignedDocumentsPhone navigation={navigation} companyId={company?.id ?? null} companyLoading={companyLoading} openMeeting={openMeeting} onMeetingOpened={meetingOpened} />;
}

// הבעלים במסמכים של חברה אחת
/** The owner on one company's documents: loads the company, then shows the manager's page inside it. */
function OwnerCompanyDocuments({
  navigation, companyId, openMeeting, onMeetingOpened,
}: { navigation: Props['navigation']; companyId: string | null; openMeeting?: string; onMeetingOpened: () => void }) {
  const isDesktop = useIsDesktop();
  const [target, setTarget] = useState<Company | null>(null);
  const [error, setError] = useState('');

  // Without a company (an old bookmark) there is nothing to show: back to the control room.
  useEffect(() => {
    if (!companyId) navigation.replace('OwnerHome');
  }, [companyId, navigation]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setError('');
    const { data, error: loadError } = await getCompany(companyId);
    if (loadError || !data) setError(t('company.loadFailedShort'));
    else setTarget(data);
  }, [companyId]);
  useEffect(() => {
    void load();
  }, [load]);

  const body = !target ? (
    <View style={styles.center}>{error ? <ErrorState message={error} onRetry={() => void load()} /> : <LoadingState />}</View>
  ) : (
    <ActingCompanyProvider company={target}>
      {isDesktop ? (
        <SignedDocumentsDesktopView companyId={target.id} companyName={target.name} openMeetingTemplateId={openMeeting} onMeetingOpened={onMeetingOpened} />
      ) : (
        <SignedDocumentsPhone navigation={navigation} companyId={target.id} companyName={target.name} companyLoading={false} openMeeting={openMeeting} onMeetingOpened={onMeetingOpened} ownerTools />
      )}
    </ActingCompanyProvider>
  );

  if (!isDesktop) return body;
  return (
    <DesktopShell active="OwnerHome" breadcrumbs={[t('nav.controlCenter'), target?.name ?? '…', t('nav.signedDocuments')]}>
      {body}
    </DesktopShell>
  );
}

// הגרסה לטלפון
function SignedDocumentsPhone({
  navigation, companyId, companyName, companyLoading, openMeeting, onMeetingOpened, ownerTools = false,
}: {
  navigation: Props['navigation'];
  companyId: string | null;
  /** The owner's view: the company's name in the title. */
  companyName?: string;
  companyLoading: boolean;
  openMeeting?: string;
  onMeetingOpened: () => void;
  /** The owner also creates forms, writes new versions and restores earlier ones here. */
  ownerTools?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [creating, setCreating] = useState(false);
  const [replacing, setReplacing] = useState<SigningTemplate | null>(null);
  const [versionsOf, setVersionsOf] = useState<SigningTemplate | null>(null);
  const [afterReplace, setAfterReplace] = useState<{ template: SigningTemplate; pendingOld: number } | null>(null);
  const [openSend, setOpenSend] = useState<string | undefined>(undefined);
  const [templates, setTemplates] = useState<SigningTemplate[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [plan, setPlan] = useState<PlanRow[]>([]);
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
      const rows = await listSigningTemplates(companyId);
      if (generation !== request.current) return;
      setTemplates(rows);
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
    <>
    <SignedDocumentsMobile
      companyName={companyName}
      onCreate={ownerTools ? () => setCreating(true) : undefined}
      onReplace={ownerTools ? setReplacing : undefined}
      onVersions={ownerTools ? setVersionsOf : undefined}
      openSend={openSend}
      onSendOpened={() => setOpenSend(undefined)}
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
    />
    {ownerTools && companyId ? (
      <>
        {creating ? (
          <CreateDocumentSheet
            companyId={companyId}
            takenTitles={(templates ?? []).map((entry) => entry.title)}
            onClosed={() => setCreating(false)}
            onCreated={(template) => setTemplates((prev) => [template, ...(prev ?? []).filter((entry) => entry.id !== template.id)])}
          />
        ) : null}
        {replacing ? (
          <CreateDocumentSheet
            companyId={companyId}
            replace={replacing}
            onClosed={() => setReplacing(null)}
            onCreated={(template, pendingOld) => {
              setAfterReplace({ template, pendingOld: pendingOld ?? 0 });
              void load();
            }}
          />
        ) : null}
        {versionsOf ? (
          <FormVersionsSheet
            companyId={companyId}
            template={versionsOf}
            onClosed={() => setVersionsOf(null)}
            onRestored={(template, pendingOld) => {
              setAfterReplace({ template, pendingOld });
              void load();
            }}
          />
        ) : null}
        {afterReplace ? (
          <AfterReplaceSheet
            companyId={companyId}
            template={afterReplace.template}
            pendingOld={afterReplace.pendingOld}
            onPickDrivers={() => setOpenSend(afterReplace.template.id)}
            onClosed={() => setAfterReplace(null)}
          />
        ) : null}
      </>
    ) : null}
    </>
  );
}

// עיצוב
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
