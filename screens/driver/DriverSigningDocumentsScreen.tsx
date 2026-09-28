import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { Banner, DK, DKText, DriverPage, EmptyPanel, ErrorPanel, HeroTitle, KitSheet, LoadingPanel, PrimaryAction, Pressy, Reveal, STATUS, SheetActions, Surface } from '../../components/driverKit';
import { SigningFolders } from '../../components/driverCard/SigningFolders';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { assignSigningTemplate, downloadSignedRequest, getSigningSession, getSigningTemplatePreviewSession, inspectDriverSigning, listDriverSigningRequests, listSigningTemplates, syncSigningRequest, type SignatureRequest } from '../../lib/docuseal';
import { eraseSigningRequest, eraseWarning } from '../../lib/signingSend';
import { buildSigningFolders, type SigningFolder } from '../../lib/signingFolders';
import { getDriver, type DriverRow } from '../../lib/adminApi';
import { useCompany } from '../../lib/CompanyContext';
import type { RootStackParamList } from '../../navigation/types';
import { showAlert } from '../../lib/platformAlert';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DText, HoverPressable } from '../../components/desktop/primitives';
import { DESKTOP_COLORS } from '../../components/desktop/desktopTheme';
import { DriverSigningMobile } from './DriverSigningMobile';
import { checklistPreviewTarget, useFolderMeetings } from '../../components/checklist/useFolderMeetings';
import { cancelMeeting, formatIsoDay, type MeetingRow } from '../../lib/checklistForms';
import { useNextMeeting } from '../../components/checklist/useNextMeeting';
import { NextMeetingCard } from '../../components/checklist/NextMeetingCard';
import { t, dirIcon, getLocale } from '../../lib/i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverSigningDocuments'>;
const time = (date: string) => new Date(date).toLocaleString(getLocale(), { dateStyle: 'short', timeStyle: 'short' });

export default function DriverSigningDocumentsScreen({ navigation, route }: Props) {
  const { profile, loading: profileLoading } = useCompany();
  const driverId = profile?.role === 'driver' ? profile.id : route.params?.driverId;
  const folderId = route.params?.folderId;
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [folder, setFolder] = useState<SigningFolder | null>(null);
  const [folders, setFolders] = useState<SigningFolder[]>([]);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState('');
  const [sending, setSending] = useState(false);
  const sendingLock = useRef(false);
  // A document the manager is deleting; kept while the sheet closes so its text stays.
  const [cancelTarget, setCancelTarget] = useState<SignatureRequest | null>(null);
  // A meeting ("רשימת סעיפים") being cancelled: a draft, or one already signed.
  const [cancelMeetingTarget, setCancelMeetingTarget] = useState<MeetingRow | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadRequest = useRef(0);
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const canSend = !!driver && (profile?.role === 'owner' || (profile?.role === 'admin' && profile.company_id === driver.company_id));
  const meetings = useFolderMeetings(profile?.role === 'driver' ? null : driver?.id, folder?.template, folder?.requests);
  const reloadMeetings = meetings.reload;
  const next = useNextMeeting(profile?.role === 'driver' ? null : driver?.company_id, folder?.template, driver?.id);
  const reloadNext = next.reload;
  useFocusEffect(useCallback(() => { void reloadMeetings(); void reloadNext(); }, [reloadMeetings, reloadNext]));
  const nextCard = folderId && next.row ? (
    <NextMeetingCard row={next.row} repeatMonths={next.repeatMonths} canEdit={canSend} onMove={next.move} />
  ) : null;
  const startMeeting = (meetingId?: string) => {
    if (!driver || !folder?.template) return;
    navigation.navigate('ChecklistMeeting', meetingId ? { driverId: driver.id, meetingId } : { driverId: driver.id, templateId: folder.template.id });
  };
  const load = useCallback(async () => {
    const generation = ++loadRequest.current;
    // Right after a refresh the profile is still on its way: keep loading.
    if (!driverId && profileLoading) return;
    if (!driverId) { setError(t('signing.openFromDriverProfile')); setLoading(false); return; }
    try {
      const target = await getDriver(driverId);
      if (!target?.company_id) throw new Error(t('driver.notFound'));
      const [templates, initial] = await Promise.all([listSigningTemplates(target.company_id), listDriverSigningRequests(driverId)]);
      const toSync = initial.filter(item => (item.status === 'pending' && item.docuseal_submitter_slug) || (item.status === 'completed' && !item.signed_file_path));
      const results = await Promise.allSettled(toSync.map(item => syncSigningRequest(item.id)));
      const requests = toSync.length ? await listDriverSigningRequests(driverId) : initial;
      if (generation !== loadRequest.current) return;
      setDriver(target);
      const built = buildSigningFolders(templates, requests);
      setFolder(built.find(item => item.id === folderId) || null);
      // The driver's own list shows only folders with something sent to them.
      setFolders(built.filter(item => item.requests.length > 0));
      setError(results.some(result => result.status === 'rejected') ? t('signing.statusRefreshFailed') : '');
    } catch (err: any) { if (generation === loadRequest.current) setError(err?.message || t('documents.loadFailedShort')); }
    finally { if (generation === loadRequest.current) setLoading(false); }
  }, [driverId, folderId, profileLoading]);
  useFocusEffect(useCallback(() => {
    setLoading(true); load();
    const interval = setInterval(load, 60_000);
    return () => { loadRequest.current += 1; clearInterval(interval); };
  }, [load]));
  const open = async (item: SignatureRequest) => {
    setOpening(item.id);
    try {
      // A document that only needs the driver's signature is signed on the
      // app's own pad, the same one the manager uses. Anything else to fill
      // in stays in DocuSeal's form.
      if (profile?.role === 'driver' && item.status === 'pending') {
        const check = await inspectDriverSigning(item.id).catch(() => null);
        if (check?.status === 'pending' && check.signOnly) {
          navigation.navigate('DriverSignDocument', {
            requestId: item.id,
            title: item.template_title || folder?.title || t('documents.document'),
            documentUrl: check.documentUrl ?? null,
          });
          return;
        }
      }
      const session = await getSigningSession(item.id);
      navigation.navigate('DocusealWebView', {
        ...session,
        title: item.template_title || folder?.title || t('documents.document'),
        requestId: item.id,
        returnToDriverDocuments: profile?.role === 'driver',
        allowDownload: item.status === 'completed',
      });
    } catch (err: any) { setError(err?.message || t('common.openDocumentFailed')); }
    finally { setOpening(''); }
  };
  const send = async () => {
    if (!canSend || !driver?.company_id || !folder?.template || sendingLock.current) return;
    sendingLock.current = true; setSending(true); setError('');
    try {
      const result = await assignSigningTemplate(driver.company_id, folder.template.id, [driver.id]);
      await load();
      if (!result.success || result.created !== 1) setError(result.message || t('signing.sendNotApprovedRetry'));
    } catch (err: any) { setError(err?.message || t('signing.sendFailedRetry')); }
    finally { sendingLock.current = false; setSending(false); }
  };
  // The blank form as the driver will get it, so the manager can check it before sending.
  const preview = async () => {
    if (!folder?.template || opening) return;
    setOpening('preview'); setError('');
    try {
      const session = meetings.checklist
        ? await checklistPreviewTarget(folder.template, folder.title)
        : await getSigningTemplatePreviewSession(folder.template.id);
      navigation.navigate('DocusealWebView', { ...session, title: folder.title });
    } catch (err: any) { setError(err?.message || t('common.openDocumentFailedRetry')); }
    finally { setOpening(''); }
  };
  // Opened from a notification or a task about one request: a driver goes
  // straight to signing it; a manager lands in the folder that holds it.
  const requestParam = route.params?.requestId;
  useEffect(() => {
    if (!requestParam || loading || !driver) return;
    navigation.setParams({ requestId: undefined });
    const host = folders.find(item => item.requests.some(request => request.id === requestParam));
    const request = host?.requests.find(item => item.id === requestParam);
    if (!host || !request) return;
    if (profile?.role === 'driver' && request.status === 'pending') {
      void open(request);
      return;
    }
    if (host.id !== folderId) navigation.push('DriverSigningDocuments', { driverId: driver.id, folderId: host.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestParam, loading, driver, folders]);
  const download = async (item: SignatureRequest) => {
    setOpening(`download:${item.id}`); setError('');
    try { await downloadSignedRequest(item); }
    catch (err: any) { setError(err?.message || t('signing.downloadFailed')); }
    finally { setOpening(''); }
  };
  const cancel = async () => {
    if ((!cancelTarget && !cancelMeetingTarget) || !driver?.company_id) return;
    setCancelling(true); setError('');
    try {
      if (cancelMeetingTarget) await cancelMeeting(driver.company_id, cancelMeetingTarget.id);
      else await eraseSigningRequest(driver.company_id, cancelTarget!.id);
      await Promise.all([reloadMeetings(), reloadNext()]);
      setCancelOpen(false);
      await load();
    } catch (err: any) { setCancelOpen(false); setError(err?.message || t('common.deleteFailedRetry')); }
    finally { setCancelling(false); }
  };
  const askErase = (item: SignatureRequest) => {
    if (!driver?.company_id) return;
    const companyId = driver.company_id;
    showAlert(t('documents.deleteQuestion'), eraseWarning(item.status, driver.full_name), [
      { text: t('common.keep'), style: 'cancel' },
      {
        text: t('documents.deleteDocument'),
        style: 'destructive',
        onPress: () => {
          setOpening(`erase:${item.id}`); setError('');
          eraseSigningRequest(companyId, item.id)
            .then(load)
            .catch((err: Error) => setError(err?.message || t('common.deleteFailedRetry')))
            .finally(() => setOpening(''));
        },
      },
    ]);
  };
  // The computer's version of the meeting delete (the phone uses the sheet below).
  const askCancelMeeting = (meeting: MeetingRow) => {
    if (!driver?.company_id) return;
    const companyId = driver.company_id;
    const draft = meeting.status === 'draft';
    showAlert(
      draft ? t('meeting.deleteDraftQuestion') : t('meeting.deleteQuestion'),
      draft ? t('meeting.draftDeletedStartNew') : t('meeting.deleteWarning'),
      [
        { text: t('common.keep'), style: 'cancel' },
        {
          text: draft ? t('meeting.deleteDraft') : t('meeting.delete'),
          style: 'destructive',
          onPress: () => {
            setOpening(`cancel:${meeting.id}`); setError('');
            cancelMeeting(companyId, meeting.id)
              .then(async () => { await Promise.all([reloadMeetings(), reloadNext()]); await load(); })
              .catch((err: Error) => setError(err?.message || t('common.deleteFailedRetry')))
              .finally(() => setOpening(''));
          },
        },
      ],
    );
  };
  const pending = folder?.requests.find(item => item.status === 'pending' && !!item.docuseal_submitter_slug);
  const completed = folder?.requests.find(item => item.status === 'completed');

  if (isDesktop) {
    return (
      <DesktopShell active="DriverSigningDocuments" breadcrumbs={[t('nav.signingDocuments'), ...(folder ? [folder.title] : [])]}>
        {loading ? (
          <LoadingState />
        ) : !driver ? (
          <ErrorState message={error || t('driver.notFound')} onRetry={load} />
        ) : (
          <View style={ds.wrap}>
            {!!error && <DText style={ds.error}>{error}</DText>}
            {!folderId ? (
              <SigningFolders desktop driverId={driver.id} onOpen={item => navigation.push('DriverSigningDocuments', { driverId: driver.id, folderId: item.id })} />
            ) : !folder ? (
              <EmptyState title={t('signing.folderUnavailable')} />
            ) : (
              <>
                {nextCard && <View style={ds.next}>{nextCard}</View>}
                {canSend && folder.template && meetings.checklist && (
                  <HoverPressable style={ds.sendButton} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }} onPress={() => startMeeting()}>
                    <Ionicons name="add-circle-outline" size={15} color={DESKTOP_COLORS.brand} />
                    <DText weight="semiBold" style={ds.sendText}>{t('meeting.new')}</DText>
                  </HoverPressable>
                )}
                {meetings.drafts.length > 0 && (
                  <View style={ds.table}>
                    {meetings.drafts.map((draft, index) => (
                      <HoverPressable
                        key={draft.id}
                        style={[ds.row, index === meetings.drafts.length - 1 && ds.rowLast]}
                        hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}
                        onPress={() => startMeeting(draft.id)}
                        accessibilityLabel={t('meeting.draftContinue', { title: draft.title })}
                      >
                        <Ionicons name="create-outline" size={16} color={DESKTOP_COLORS.brand} />
                        <View style={{ flex: 1 }}>
                          <DText weight="semiBold" style={ds.rowTitle}>{draft.title}</DText>
                          <DText style={ds.rowMeta}>{t('signing.draftNotSignedSep')} {formatIsoDay(draft.updated_at.slice(0, 10))}</DText>
                        </View>
                        {canSend && (
                          <HoverPressable onPress={() => askCancelMeeting(draft)} disabled={!!opening} accessibilityLabel={t('meeting.deleteDraft')} style={ds.rowAction} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}>
                            <DText weight="semiBold" style={ds.rowDanger}>{opening === `cancel:${draft.id}` ? t('common.deleting') : t('common.deleteAction')}</DText>
                          </HoverPressable>
                        )}
                        <DText weight="semiBold" style={ds.sendText}>{t('common.continue')}</DText>
                      </HoverPressable>
                    ))}
                  </View>
                )}
                {canSend && folder.template && !meetings.checklist && (
                  <HoverPressable
                    style={[ds.sendButton, sending && ds.disabled]}
                    hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}
                    disabled={sending}
                    onPress={() => (completed && !pending ? open(completed) : send())}
                  >
                    <Ionicons name={completed && !pending ? 'document-text-outline' : 'send-outline'} size={14} color={DESKTOP_COLORS.brand} />
                    <DText weight="semiBold" style={ds.sendText}>
                      {sending ? t('common.sending') : pending ? t('signing.resendTitle', { title: folder.title }) : completed ? t('signing.viewDocument') : t('signing.sendTitleForSignature', { title: folder.title })}
                    </DText>
                  </HoverPressable>
                )}
                {folder.requests.length === 0 ? (
                  meetings.drafts.length ? null : <EmptyState icon="folder-outline" title={meetings.checklist ? t('meeting.notHeldYet') : t('documents.folderEmptyShort')} />
                ) : (
                  <View style={ds.table}>
                    {folder.requests.map((item, index) => {
                      const meeting = meetings.byRequest.get(item.id);
                      const cancelled = meeting?.status === 'cancelled';
                      const ready = !cancelled && item.status === 'pending' && !!item.docuseal_submitter_slug;
                      const signNow = ready && !!meeting && canSend;
                      const openable = item.status === 'completed' || (ready && profile?.role === 'driver') || signNow;
                      return (
                        <HoverPressable
                          key={item.id}
                          style={[ds.row, index === folder.requests.length - 1 && ds.rowLast]}
                          hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}
                          disabled={opening === item.id || !openable}
                          onPress={() => (signNow ? startMeeting(meeting!.id) : open(item))}
                        >
                          <Ionicons
                            name={item.status === 'completed' ? 'checkmark-circle' : ready ? 'time-outline' : 'alert-circle-outline'}
                            size={16}
                            color={item.status === 'completed' ? DESKTOP_COLORS.brand : ready ? DESKTOP_COLORS.brand : DESKTOP_COLORS.danger}
                          />
                          <View style={{ flex: 1 }}>
                            <DText weight="semiBold" style={ds.rowTitle}>{item.template_title || folder.title}</DText>
                            <DText style={ds.rowMeta}>
                              {cancelled ? t('common.cancelled') : item.status === 'completed' ? t('signing.signedV1', { v1: time(item.completed_at || item.created_at) }) : signNow ? t('signing.awaitingDriverTapNow') : ready ? t('signing.sentWhen', { v1: time(item.sent_at || item.created_at) }) : item.status === 'declined' ? t('signing.declined') : t('signing.notApprovedCanRetry')}
                            </DText>
                          </View>
                          {canSend && meeting && (
                            <HoverPressable onPress={() => askCancelMeeting(meeting)} disabled={!!opening} accessibilityLabel={t('meeting.delete')} style={ds.rowAction} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}>
                              <DText weight="semiBold" style={ds.rowDanger}>{opening === `cancel:${meeting.id}` ? t('common.deleting') : t('common.deleteAction')}</DText>
                            </HoverPressable>
                          )}
                          {canSend && !meeting && (
                            <HoverPressable onPress={() => askErase(item)} disabled={!!opening} accessibilityLabel={t('documents.deleteDocument')} style={ds.rowAction} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}>
                              <DText weight="semiBold" style={ds.rowDanger}>{opening === `erase:${item.id}` ? t('common.deleting') : t('common.deleteAction')}</DText>
                            </HoverPressable>
                          )}
                          {openable && <Ionicons name={dirIcon('chevron-back')} size={14} color={DESKTOP_COLORS.inkFaint} />}
                        </HoverPressable>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </View>
        )}
      </DesktopShell>
    );
  }

  if (profile?.role === 'driver') {
    return (
      <DriverSigningMobile
        insetTop={insets.top}
        insetBottom={insets.bottom}
        loading={loading}
        error={error}
        fatal={!driver}
        folder={folder}
        folderMode={!!folderId}
        folders={folders}
        opening={opening}
        onBack={() => navigation.goBack()}
        onRetry={() => { setLoading(true); load(); }}
        onOpenFolder={item => navigation.push('DriverSigningDocuments', { driverId: driver?.id, folderId: item.id })}
        onOpenRequest={item => void open(item)}
      />
    );
  }

  // The manager's view: every folder (empty ones are where sending starts),
  // and inside one, what was sent and its state, with send / resend on top.
  const sendLabel = sending ? t('common.sending') : pending ? t('signing.resendForSignature') : completed ? t('signing.viewSigned') : t('signing.sendForSignature');
  return (
    <DriverPage
      insetTop={insets.top}
      insetBottom={insets.bottom}
      hero={<HeroTitle title={folder?.title || t('signing.formsAndDocs')} subtitle={driver?.full_name || ' '} onBack={() => navigation.goBack()} />}
      footer={
        folderId && folder && canSend && folder.template && meetings.checklist ? (
          <View style={styles.footer}>
            <PrimaryAction label={t('signing.viewForm')} icon="eye-outline" tone="ghost" loading={opening === 'preview'} onPress={() => void preview()} style={styles.grow} />
            <PrimaryAction label={t('meeting.new')} icon="add-circle-outline" onPress={() => startMeeting()} disabled={opening === 'preview'} style={styles.flex2} />
          </View>
        ) : folderId && folder && canSend && folder.template ? (
          <View style={styles.footer}>
            {!(completed && !pending) && (
              <PrimaryAction label={t('common.view')} icon="eye-outline" tone="ghost" loading={opening === 'preview'} disabled={sending} onPress={() => void preview()} style={styles.grow} />
            )}
            <PrimaryAction
              label={sendLabel}
              icon={completed && !pending ? 'eye-outline' : 'send'}
              tone={completed && !pending ? 'ghost' : 'accent'}
              loading={sending || (!!completed && !pending && opening === completed.id)}
              disabled={opening === 'preview'}
              onPress={() => (completed && !pending ? void open(completed) : void send())}
              style={styles.flex2}
            />
          </View>
        ) : undefined
      }
      overlay={
        <KitSheet
          visible={cancelOpen}
          onClose={() => setCancelOpen(false)}
          dismissable={!cancelling}
          icon="trash"
          tone="danger"
          title={cancelMeetingTarget ? (cancelMeetingTarget.status === 'draft' ? t('meeting.deleteDraftQuestion') : t('meeting.deleteQuestion')) : t('documents.deleteQuestion')}
          subtitle={
            cancelMeetingTarget
              ? cancelMeetingTarget.status === 'draft'
                ? t('meeting.draftDeletedStartNew')
                : t('meeting.deleteWarning')
              : eraseWarning(cancelTarget?.status ?? 'pending', driver?.full_name)
          }
          footer={
            <SheetActions>
              <PrimaryAction label={t('common.keep')} tone="ghost" onPress={() => setCancelOpen(false)} disabled={cancelling} style={styles.grow} />
              <PrimaryAction
                label={cancelMeetingTarget ? (cancelMeetingTarget.status === 'draft' ? t('meeting.deleteDraft') : t('meeting.delete')) : t('documents.deleteDocument')}
                tone="destructive"
                onPress={() => void cancel()}
                loading={cancelling}
                style={styles.grow}
              />
            </SheetActions>
          }
        />
      }
    >
      {loading ? (
        <LoadingPanel />
      ) : !driver ? (
        <ErrorPanel message={error || t('driver.notFound')} onRetry={load} />
      ) : (
        <>
          {!!error && <Banner tone="soon">{error}</Banner>}
          {!folderId ? (
            <SigningFolders title={null} driverId={driver.id} onOpen={(item) => navigation.push('DriverSigningDocuments', { driverId: driver.id, folderId: item.id })} />
          ) : !folder ? (
            <EmptyPanel icon="folder-outline" tone="muted" title={t('signing.folderUnavailable')} body={t('signing.templateMaybeRemoved')} />
          ) : !folder.requests.length && !meetings.drafts.length ? (
            <Reveal>
              {nextCard}
              {meetings.checklist ? (
                <EmptyPanel icon="list-outline" title={t('meeting.notHeldYet')} body={t('meeting.clickNewToFill', { title: folder.title, v1: driver.full_name ?? t('common.theDriver') })} />
              ) : (
                <EmptyPanel icon="paper-plane-outline" title={t('signing.notSentToDriverYet')} body={t('signing.sendTitleToV1', { title: folder.title, v1: driver.full_name ?? t('role.driver') })} />
              )}
            </Reveal>
          ) : (
            <>
            {nextCard && <Reveal>{nextCard}</Reveal>}
            {meetings.drafts.map((draft, index) => (
              <Reveal key={draft.id} index={index}>
                <Surface style={styles.request}>
                  <View style={[styles.requestIcon, { backgroundColor: DK.accentSoft }]}>
                    <Ionicons name="create" size={22} color={DK.accent} />
                  </View>
                  <View style={styles.flex}>
                    <DKText variant="label" numberOfLines={2}>{draft.title}</DKText>
                    <DKText variant="caption" color={DK.accent}>{t('signing.draftNotSignedSep')} {formatIsoDay(draft.updated_at.slice(0, 10))}</DKText>
                  </View>
                  <Pressy onPress={() => startMeeting(draft.id)} accessibilityLabel={t('meeting.continueDraft')} style={styles.resume} pressScale={0.94}>
                    <DKText variant="label" color="#FFFFFF">{t('common.continue')}</DKText>
                  </Pressy>
                  {canSend && (
                    <Pressy
                      onPress={() => { setCancelTarget(null); setCancelMeetingTarget(draft); setCancelOpen(true); }}
                      disabled={cancelling}
                      accessibilityLabel={t('meeting.deleteDraft')}
                      style={[styles.view, styles.cancel]}
                      pressScale={0.92}
                    >
                      <Ionicons name="trash-outline" size={19} color={STATUS.expired.fg} />
                    </Pressy>
                  )}
                </Surface>
              </Reveal>
            ))}
            {folder.requests.map((item, index) => {
              const meeting = meetings.byRequest.get(item.id);
              const cancelled = meeting?.status === 'cancelled';
              const ready = !cancelled && item.status === 'pending' && !!item.docuseal_submitter_slug;
              const done = !cancelled && item.status === 'completed';
              const tone = cancelled ? STATUS.missing : done ? STATUS.ok : ready ? STATUS.soon : STATUS.expired;
              return (
                <Reveal key={item.id} index={index}>
                  <Surface style={styles.request}>
                    <View style={[styles.requestIcon, { backgroundColor: tone.soft }]}>
                      <Ionicons name={cancelled ? 'close' : done ? 'checkmark-done' : ready ? 'time' : 'alert'} size={22} color={tone.fg} />
                    </View>
                    <View style={styles.flex}>
                      <DKText variant="label" numberOfLines={2}>{item.template_title || folder.title}</DKText>
                      <DKText variant="caption" color={done ? DK.muted : tone.fg}>
                        {cancelled
                          ? t('signing.cancelledV1', { v1: meeting?.cancelled_at ? ` ${time(meeting.cancelled_at)}` : '' })
                          : done
                            ? t('signing.signedWith', { v1: time(item.completed_at || item.created_at), v2: meeting?.officer_name ? ` · ${meeting.officer_name}` : '' })
                            : ready
                              ? meeting ? t('signing.officerSignedAwaitingDriver') : t('signing.awaitingSentV1', { v1: time(item.sent_at || item.created_at) })
                              : item.status === 'declined' ? t('signing.driverDeclined') : t('signing.incompleteCanResend')}
                      </DKText>
                    </View>
                    {ready && meeting && canSend && (
                      <Pressy onPress={() => startMeeting(meeting.id)} accessibilityLabel={t('signing.driverSignsOnDevice')} style={styles.resume} pressScale={0.94}>
                        <DKText variant="label" color="#FFFFFF">{t('signing.signNow')}</DKText>
                      </Pressy>
                    )}
                    {(done || (cancelled && item.status === 'completed')) && (
                      <>
                        <Pressy onPress={() => void download(item)} disabled={!!opening} accessibilityLabel={t('signing.downloadSigned')} style={styles.view} pressScale={0.92}>
                          <Ionicons name={opening === `download:${item.id}` ? 'hourglass-outline' : 'download-outline'} size={19} color={DK.accent} />
                        </Pressy>
                        <Pressy onPress={() => void open(item)} disabled={!!opening} accessibilityLabel={t('signing.viewSigned')} style={styles.view} pressScale={0.92}>
                          <Ionicons name="eye-outline" size={19} color={DK.accent} />
                        </Pressy>
                      </>
                    )}
                    {canSend && (!!meeting || !cancelled) && (
                      <Pressy
                        onPress={() => { setCancelTarget(item); setCancelMeetingTarget(meeting ?? null); setCancelOpen(true); }}
                        disabled={sending || cancelling}
                        accessibilityLabel={meeting ? t('meeting.delete') : t('documents.deleteDocument')}
                        accessibilityHint={meeting ? t('meeting.andDocDeleted') : t('signing.docFullyDeleted')}
                        style={[styles.view, styles.cancel]}
                        pressScale={0.92}
                      >
                        <Ionicons name="trash-outline" size={20} color={STATUS.expired.fg} />
                      </Pressy>
                    )}
                  </Surface>
                </Reveal>
              );
            })}
            </>
          )}
        </>
      )}
    </DriverPage>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  grow: { flex: 1 },
  flex2: { flex: 2 },
  footer: { flexDirection: 'row-reverse', gap: 10 },
  cancel: { backgroundColor: STATUS.expired.soft },
  request: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 14 },
  requestIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  view: { width: 44, height: 44, borderRadius: 14, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
  resume: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: DK.accent, alignItems: 'center', justifyContent: 'center' },
});

const ds = StyleSheet.create({
  wrap: { padding: 24, maxWidth: 520, alignSelf: 'center', width: '100%', gap: 12 },
  next: { marginBottom: -12 },
  error: { fontSize: 12.5, color: DESKTOP_COLORS.danger, textAlign: 'center' },
  sendButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 36,
    borderRadius: 7,
    backgroundColor: DESKTOP_COLORS.brandFocusRing,
  },
  sendText: { fontSize: 12.5, color: DESKTOP_COLORS.brand },
  disabled: { opacity: 0.55 },
  table: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 54, borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  rowLast: { borderBottomWidth: 0 },
  rowTitle: { fontSize: 13 },
  rowMeta: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint, marginTop: 2 },
  rowAction: { paddingHorizontal: 8, minHeight: 30, borderRadius: 6, justifyContent: 'center' },
  rowDanger: { fontSize: 12.5, color: DESKTOP_COLORS.danger },
});
