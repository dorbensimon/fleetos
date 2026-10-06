import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  assignSigningTemplate,
  getSigningSession,
  getSigningTemplatePreviewSession,
  listDriverSigningRequests,
  listSigningTemplates,
  syncSigningRequest,
  type SignatureRequest,
} from '../../../lib/docuseal';
import { buildSigningFolders, signingFolderStatus, type SigningFolder, requestTitle } from '../../../lib/signingFolders';
import { DesktopModal } from '../DesktopModal';
import { DText, HoverPressable } from '../primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from '../desktopTheme';
import { recordStyles } from '../record/RecordKit';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/types';
import { checklistPreviewTarget, useFolderMeetings } from '../../checklist/useFolderMeetings';
import { cancelMeeting, formatIsoDay, isChecklistTemplate, type MeetingRow } from '../../../lib/checklistForms';
import { useNextMeeting } from '../../checklist/useNextMeeting';
import { NextMeetingCard } from '../../checklist/NextMeetingCard';
import { showAlert } from '../../../lib/platformAlert';
import { eraseSigningRequest, eraseWarning } from '../../../lib/signingSend';
import { t, dirIcon, getLocale } from '../../../lib/i18n';
import { errorMessage } from '../../../lib/requestError';
import { listCompanyFolders, type CompanyFolder } from '../../../lib/folderCatalog';
import { AddCatalogFolderSheet, EmptyCatalogFolderSheet } from '../signing/FolderCatalogSheets';
import { CreateDocumentSheet, type FormFolder } from '../signing/CreateDocumentSheet';

type FolderStatus = ReturnType<typeof signingFolderStatus>;
const STATUS_LABEL: Record<FolderStatus, string> = { get pending() { return t('signing.pendingSignature'); }, get completed() { return t('common.signedDone'); }, get failed() { return t('status.needsAttention'); }, get empty() { return t('signing.notSentShort'); } };

const time = (date: string) => new Date(date).toLocaleString(getLocale(), { dateStyle: 'short', timeStyle: 'short' });
const day = (date: string) => new Date(date).toLocaleDateString(getLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\./g, '/');

/** When the folder's most recent signed copy was signed, or null if none was. */
function lastSignedAt(folder: SigningFolder) {
  let latest: string | null = null;
  for (const item of folder.requests) {
    if (item.status !== 'completed') continue;
    const at = item.completed_at || item.created_at;
    if (!latest || new Date(at) > new Date(latest)) latest = at;
  }
  return latest;
}

export type SigningSessionTarget = Awaited<ReturnType<typeof getSigningSession>> & { title: string; requestId?: string; signedAt?: string };

/** Loads the driver's signing folders (company templates + the driver's requests). */
export function useDriverSigningFolders(companyId: string | null | undefined, driverId: string) {
  const [folders, setFolders] = useState<SigningFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef(0);

  const reload = useCallback(async () => {
    if (!companyId) return;
    const generation = ++request.current;
    try {
      const [templates, requests, catalog] = await Promise.all([
        listSigningTemplates(companyId),
        listDriverSigningRequests(driverId),
        // The company's catalog folders (empty ones show too). Extra: the file still loads without them.
        listCompanyFolders(companyId).then((result) => result.folders).catch(() => [] as CompanyFolder[]),
      ]);
      if (generation !== request.current) return;
      setFolders(buildSigningFolders(templates, requests, catalog));
      setError('');
    } catch (err: any) {
      if (generation === request.current) setError(errorMessage(err, t('signing.formsLoadFailed')));
    } finally {
      if (generation === request.current) setLoading(false);
    }
  }, [companyId, driverId]);

  useEffect(() => {
    reload();
    return () => { request.current += 1; };
  }, [reload]);

  return { folders, loading, error, reload };
}

/** When the folder's pending request was sent, or null if nothing is waiting. */
function lastSentAt(folder: SigningFolder) {
  const pending = folder.requests.find((item) => item.status === 'pending' && !!item.docuseal_submitter_slug);
  return pending ? pending.sent_at || pending.created_at : null;
}

const STATUS_COLOR: Record<FolderStatus, string> = {
  pending: DESKTOP_TONES.warn.fg,
  completed: DESKTOP_TONES.ok.fg,
  failed: DESKTOP_TONES.bad.fg,
  empty: DESKTOP_COLORS.inkFaint,
};

/**
 * "טפסים לחתימה" on the desktop driver record: one list row per signing
 * template, with its status in words. A row opens a centered window that
 * lists the folder's requests and sends / re-sends it. The signing document
 * itself still opens in the full DocuSeal page — it does not fit a small window.
 */
export function DriverSigningList({
  companyId,
  driverId,
  canSend,
  folders,
  loading,
  error,
  onChanged,
  openFolderId,
  onFolderOpened,
  onOpenSession,
}: {
  companyId: string;
  driverId: string;
  canSend: boolean;
  folders: SigningFolder[];
  loading: boolean;
  error: string;
  onChanged: () => Promise<void>;
  /** Opens this folder's window from outside (the "דרוש טיפול" notice). */
  openFolderId?: string | null;
  onFolderOpened?: () => void;
  onOpenSession: (target: SigningSessionTarget) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creatingFor, setCreatingFor] = useState<FormFolder | null>(null);

  useEffect(() => {
    if (!openFolderId) return;
    setOpenId(openFolderId);
    onFolderOpened?.();
  }, [openFolderId, onFolderOpened]);

  const openFolder = folders.find((folder) => folder.id === openId) ?? null;
  const emptyCatalog = openFolder?.emptyCatalog ?? null;

  if (loading) return <DText style={styles.message}>{t('signing.loadingForms')}</DText>;
  if (error) return <DText style={styles.message}>{error}</DText>;
  if (!folders.length) return <DText style={styles.message}>{t('signing.noFormsYet')}</DText>;

  return (
    <>
      {folders.map((folder, index) => {
        const status = signingFolderStatus(folder);
        const signedAt = lastSignedAt(folder);
        const sentAt = lastSentAt(folder);
        const checklist = folder.emptyCatalog ? folder.emptyCatalog.kind === 'checklist' : isChecklistTemplate(folder.template);
        const meta = folder.emptyCatalog
          ? t('folders.noFormYet')
          : status === 'pending' && sentAt
          ? checklist ? t('signing.officerSignedOn', { sentAt: day(sentAt) }) : t('signing.sentOn', { sentAt: day(sentAt) })
          : signedAt
            ? t('signing.signedOn', { signedAt: day(signedAt) })
            : status === 'failed'
              ? t('signing.sendUnsuccessful')
              : checklist ? t('meeting.notHeldYet') : t('signing.notSentToDriverYet');
        const color = STATUS_COLOR[status];
        return (
          <HoverPressable
            key={folder.id}
            style={[styles.listRow, index > 0 && styles.listDivider]}
            hoverStyle={recordStyles.rowHover}
            onPress={() => setOpenId(folder.id)}
            accessibilityLabel={t('signing.itemOpenLabel', { title: folder.title, v1: STATUS_LABEL[status] })}
          >
            <View style={[styles.listIcon, status === 'completed' && styles.listIconDone]}>
              <Ionicons name={checklist ? 'list-outline' : 'create-outline'} size={16} color={status === 'completed' ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkMuted} />
            </View>
            <View style={styles.listText}>
              <DText weight="semiBold" style={styles.listTitle} numberOfLines={1}>{folder.title}</DText>
              <DText style={styles.listMeta}>{meta}</DText>
            </View>
            <View style={styles.listStatus}>
              <View style={[styles.listDot, { backgroundColor: color }]} />
              <DText weight="semiBold" style={[styles.listStatusText, { color: folder.emptyCatalog ? DESKTOP_COLORS.brand : color }]}>
                {folder.emptyCatalog ? (canSend ? t('folders.createForm') : t('folders.noFormShort')) : checklist && status === 'empty' ? t('meeting.none') : STATUS_LABEL[status]}
              </DText>
            </View>
            <Ionicons name={dirIcon('chevron-back')} size={15} color={DESKTOP_COLORS.inkFaint} />
          </HoverPressable>
        );
      })}
      {emptyCatalog && canSend && (
        <EmptyCatalogFolderSheet
          companyId={companyId}
          folder={emptyCatalog}
          onCreate={() => setCreatingFor({ catalogId: emptyCatalog.id, title: emptyCatalog.title, kind: emptyCatalog.kind, defaultRepeatMonths: emptyCatalog.default_repeat_months })}
          onClosed={() => setOpenId(null)}
          onChanged={() => void onChanged()}
        />
      )}
      {creatingFor && (
        <CreateDocumentSheet
          companyId={companyId}
          folder={creatingFor}
          onClosed={() => setCreatingFor(null)}
          onCreated={() => void onChanged()}
        />
      )}
      {openFolder && !emptyCatalog && (
        <SigningFolderModal
          companyId={companyId}
          driverId={driverId}
          canSend={canSend}
          folder={openFolder}
          onClose={() => setOpenId(null)}
          onChanged={onChanged}
          onOpenSession={onOpenSession}
        />
      )}
    </>
  );
}

/** "+ הוסף תיקייה" beside the driver file's forms: adds a catalog folder to every driver of the company. */
export function AddFolderButton({ companyId, onChanged }: { companyId: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <HoverPressable
        style={styles.addFolder}
        hoverStyle={styles.addFolderHover}
        pressStyle={recordStyles.pressDown}
        onPress={() => setOpen(true)}
        accessibilityLabel={t('folders.addButton')}
      >
        <Ionicons name="add" size={16} color={DESKTOP_COLORS.brand} />
        <DText weight="semiBold" style={styles.addFolderText}>{t('folders.addButton')}</DText>
      </HoverPressable>
      {open && <AddCatalogFolderSheet companyId={companyId} onClosed={() => setOpen(false)} onAdded={() => onChanged()} />}
    </>
  );
}

function SigningFolderModal({
  companyId,
  driverId,
  canSend,
  folder,
  onClose,
  onChanged,
  onOpenSession,
}: {
  companyId: string;
  driverId: string;
  canSend: boolean;
  folder: SigningFolder;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onOpenSession: (target: SigningSessionTarget) => void;
}) {
  const [sending, setSending] = useState(false);
  const [opening, setOpening] = useState('');
  const [message, setMessage] = useState('');
  const sendingLock = useRef(false);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const meetings = useFolderMeetings(driverId, folder.template, folder.requests);
  const next = useNextMeeting(companyId, folder.template, driverId);
  const startMeeting = (meetingId?: string) => {
    if (!folder.template) return;
    onClose();
    navigation.navigate('ChecklistMeeting', meetingId ? { driverId, meetingId } : { driverId, templateId: folder.template.id });
  };
  const askCancel = (meeting: MeetingRow) => {
    const draft = meeting.status === 'draft';
    showAlert(
      draft ? t('meeting.deleteDraftQuestion') : t('meeting.deleteQuestion'),
      draft ? t('meeting.draftMarksDeleted') : t('meeting.deleteWarning'),
      [
        { text: t('common.keep'), style: 'cancel' },
        {
          text: draft ? t('meeting.deleteDraft') : t('meeting.delete'),
          style: 'destructive',
          onPress: () => {
            setOpening(`cancel:${meeting.id}`);
            cancelMeeting(companyId, meeting.id)
              .then(async () => {
                await Promise.all([meetings.reload(), next.reload()]);
                await onChanged();
              })
              .catch((err: Error) => setMessage(errorMessage(err, t('common.deleteFailedRetry'))))
              .finally(() => setOpening(''));
          },
        },
      ],
    );
  };

  const askErase = (item: SignatureRequest) => {
    showAlert(t('documents.deleteQuestion'), eraseWarning(item.status, null), [
      { text: t('common.keep'), style: 'cancel' },
      {
        text: t('documents.deleteDocument'),
        style: 'destructive',
        onPress: () => {
          setOpening(`erase:${item.id}`);
          eraseSigningRequest(companyId, item.id)
            .then(onChanged)
            .catch((err: Error) => setMessage(errorMessage(err, t('common.deleteFailedRetry'))))
            .finally(() => setOpening(''));
        },
      },
    ]);
  };

  // Same refresh the full signing page runs: pull the live DocuSeal state of
  // requests that may have changed since they were stored.
  useEffect(() => {
    const toSync = folder.requests.filter((item) => (item.status === 'pending' && item.docuseal_submitter_slug) || (item.status === 'completed' && !item.signed_file_path));
    if (!toSync.length) return;
    let active = true;
    Promise.allSettled(toSync.map((item) => syncSigningRequest(item.id))).then(async (results) => {
      if (!active) return;
      if (results.some((result) => result.status === 'rejected')) setMessage(t('signing.statusRefreshFailed'));
      await onChanged();
    });
    return () => { active = false; };
    // Only when the modal opens for a folder — a refresh must not re-trigger itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder.id]);

  const pending = folder.requests.find((item) => item.status === 'pending' && !!item.docuseal_submitter_slug);
  const completed = folder.requests.find((item) => item.status === 'completed');

  const open = async (item: SignatureRequest) => {
    setOpening(item.id);
    try {
      const session = await getSigningSession(item.id);
      onOpenSession({ ...session, title: requestTitle(item) || folder.title, requestId: item.id, signedAt: item.completed_at ?? undefined });
      // The document opens full screen; this window must not stay on top of it.
      onClose();
    } catch (err: any) {
      setMessage(errorMessage(err, t('common.openDocumentFailed')));
    } finally {
      setOpening('');
    }
  };

  // The blank form as the driver will get it, so the admin can check it before sending.
  const preview = async () => {
    if (!folder.template || opening) return;
    setOpening('preview');
    setMessage('');
    try {
      const session = meetings.checklist
        ? await checklistPreviewTarget(folder.template, folder.title)
        : await getSigningTemplatePreviewSession(folder.template.id);
      onOpenSession({ ...session, title: folder.title });
      onClose();
    } catch (err: any) {
      setMessage(errorMessage(err, t('common.openDocumentFailedRetry')));
    } finally {
      setOpening('');
    }
  };

  const send = async () => {
    if (!canSend || !folder.template || sendingLock.current) return;
    sendingLock.current = true;
    setSending(true);
    setMessage('');
    try {
      const result = await assignSigningTemplate(companyId, folder.template.id, [driverId]);
      await onChanged();
      if (!result.success || result.created !== 1) setMessage(result.message || t('signing.sendNotApprovedRetry'));
    } catch (err: any) {
      setMessage(errorMessage(err, t('signing.sendFailedRetry')));
    } finally {
      sendingLock.current = false;
      setSending(false);
    }
  };

  return (
    <DesktopModal visible title={folder.title} onClose={onClose} maxWidth={520}>
      <View style={styles.body}>
        {next.row && <NextMeetingCard row={next.row} repeatMonths={next.repeatMonths} canEdit={canSend} onMove={next.move} />}
        {canSend && folder.template && meetings.checklist && (
          <View style={styles.actions}>
            <HoverPressable
              style={[styles.previewBtn, opening === 'preview' && recordStyles.disabled]}
              hoverStyle={styles.previewHover}
              pressStyle={recordStyles.pressDown}
              disabled={opening === 'preview'}
              onPress={preview}
              accessibilityLabel={t('signing.viewBlankForm')}
            >
              <Ionicons name="eye-outline" size={16} color={DESKTOP_COLORS.ink} />
              <DText weight="semiBold" style={styles.previewText}>{opening === 'preview' ? t('common.opening') : t('signing.viewForm')}</DText>
            </HoverPressable>
            <HoverPressable style={styles.sendBtn} hoverStyle={recordStyles.rowHover} pressStyle={recordStyles.pressDown} onPress={() => startMeeting()}>
              <Ionicons name="add-circle-outline" size={16} color={DESKTOP_COLORS.brand} />
              <DText weight="semiBold" style={styles.sendText}>{t('meeting.new')}</DText>
            </HoverPressable>
          </View>
        )}
        {canSend && folder.template && !meetings.checklist && (
          <View style={styles.actions}>
          {!(completed && !pending) && (
            <HoverPressable
              style={[styles.previewBtn, opening === 'preview' && recordStyles.disabled]}
              hoverStyle={styles.previewHover}
              pressStyle={recordStyles.pressDown}
              disabled={opening === 'preview' || sending}
              onPress={preview}
              accessibilityLabel={t('signing.viewBeforeSending')}
            >
              <Ionicons name="eye-outline" size={16} color={DESKTOP_COLORS.ink} />
              <DText weight="semiBold" style={styles.previewText}>{opening === 'preview' ? t('common.opening') : t('signing.viewDocument')}</DText>
            </HoverPressable>
          )}
          <HoverPressable
            style={[styles.sendBtn, sending && recordStyles.disabled]}
            hoverStyle={recordStyles.rowHover}
            pressStyle={recordStyles.pressDown}
            disabled={sending}
            onPress={() => (completed && !pending ? open(completed) : send())}
          >
            <Ionicons name={completed && !pending ? 'document-text-outline' : 'send-outline'} size={14} color={DESKTOP_COLORS.brand} />
            <DText weight="semiBold" style={styles.sendText}>
              {sending ? t('common.sending') : pending ? t('signing.resendForSignature') : completed ? t('signing.viewSigned') : t('signing.sendForSignature')}
            </DText>
          </HoverPressable>
          </View>
        )}
        {!!message && <DText style={styles.error}>{message}</DText>}
        {meetings.drafts.length > 0 && (
          <View style={styles.list}>
            {meetings.drafts.map((draft, index) => (
              <View key={draft.id} style={[styles.row, index < meetings.drafts.length - 1 && recordStyles.rowBorder]}>
                <Ionicons name="create-outline" size={16} color={DESKTOP_COLORS.brand} />
                <View style={styles.rowText}>
                  <DText weight="semiBold" style={styles.rowTitle}>{draft.title}</DText>
                  <DText style={styles.rowMeta}>{t('signing.draftNotSignedSep')} {formatIsoDay(draft.updated_at.slice(0, 10))}</DText>
                </View>
                {canSend && (
                  <HoverPressable onPress={() => askCancel(draft)} disabled={!!opening} accessibilityLabel={t('meeting.deleteDraft')} style={styles.rowAction} hoverStyle={recordStyles.rowHover}>
                    <DText weight="semiBold" style={styles.rowDanger}>{t('common.deleteAction')}</DText>
                  </HoverPressable>
                )}
                <HoverPressable onPress={() => startMeeting(draft.id)} accessibilityLabel={t('meeting.continueDraft')} style={styles.rowAction} hoverStyle={recordStyles.rowHover}>
                  <DText weight="semiBold" style={styles.rowLink}>{t('common.continue')}</DText>
                </HoverPressable>
              </View>
            ))}
          </View>
        )}
        {folder.requests.length === 0 ? (
          meetings.drafts.length ? null : <DText style={styles.message}>{meetings.checklist ? t('meeting.noneWithDriverYet') : t('signing.formNotSentYet')}</DText>
        ) : (
          <View style={styles.list}>
            {folder.requests.map((item, index) => {
              const meeting = meetings.byRequest.get(item.id);
              const cancelled = meeting?.status === 'cancelled';
              const ready = !cancelled && item.status === 'pending' && !!item.docuseal_submitter_slug;
              const openable = item.status === 'completed';
              return (
                <HoverPressable
                  key={item.id}
                  style={[styles.row, index < folder.requests.length - 1 && recordStyles.rowBorder]}
                  hoverStyle={openable ? recordStyles.rowHover : undefined}
                  // Not `disabled` when unopenable: a disabled row swallows its delete button's click.
                  disabled={opening === item.id}
                  onPress={() => { if (openable) open(item); }}
                >
                  <Ionicons
                    name={item.status === 'completed' ? 'checkmark-circle' : ready ? 'time-outline' : 'alert-circle-outline'}
                    size={16}
                    color={item.status === 'completed' || ready ? DESKTOP_COLORS.brand : DESKTOP_COLORS.danger}
                  />
                  <View style={styles.rowText}>
                    <DText weight="semiBold" style={styles.rowTitle}>{requestTitle(item) || folder.title}</DText>
                    <DText style={styles.rowMeta}>
                      {cancelled
                        ? t('common.cancelled')
                        : item.status === 'completed'
                        ? t('signing.signedWith', { v1: time(item.completed_at || item.created_at), v2: meeting?.officer_name ? ` · ${meeting.officer_name}` : '' })
                        : ready && meeting
                        ? t('signing.officerSignedAwaitingDriver')
                        : ready
                        ? t('signing.sentWhen', { v1: time(item.sent_at || item.created_at) })
                        : item.status === 'declined'
                        ? t('signing.declined')
                        : t('signing.notApprovedCanRetry')}
                    </DText>
                  </View>
                  {meeting && canSend && (
                    <HoverPressable onPress={() => askCancel(meeting)} disabled={!!opening} accessibilityLabel={t('meeting.delete')} style={styles.rowAction} hoverStyle={recordStyles.rowHover}>
                      <DText weight="semiBold" style={styles.rowDanger}>{t('common.deleteAction')}</DText>
                    </HoverPressable>
                  )}
                  {!meeting && canSend && (
                    <HoverPressable onPress={() => askErase(item)} disabled={!!opening} accessibilityLabel={t('documents.deleteDocument')} style={styles.rowAction} hoverStyle={recordStyles.rowHover}>
                      <DText weight="semiBold" style={styles.rowDanger}>{opening === `erase:${item.id}` ? t('common.deleting') : t('common.deleteAction')}</DText>
                    </HoverPressable>
                  )}
                  {ready && meeting && canSend && (
                    <HoverPressable onPress={() => startMeeting(meeting.id)} accessibilityLabel={t('signing.driverSignsNowHere')} style={styles.rowAction} hoverStyle={recordStyles.rowHover}>
                      <DText weight="semiBold" style={styles.rowLink}>{t('signing.signNow')}</DText>
                    </HoverPressable>
                  )}
                  {openable && <DText weight="semiBold" style={styles.rowLink}>{opening === item.id ? t('common.opening') : t('common.view')}</DText>}
                </HoverPressable>
              );
            })}
          </View>
        )}
      </View>
    </DesktopModal>
  );
}

const styles = StyleSheet.create({
  message: { fontSize: 13.5, color: DESKTOP_COLORS.inkMuted, paddingVertical: 14, paddingHorizontal: 16 },
  listRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 16, paddingVertical: 8, ...webOnly({ transition: 'background-color 150ms ease' }) },
  listDivider: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  listIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: DESKTOP_COLORS.canvas, alignItems: 'center', justifyContent: 'center' },
  listIconDone: { backgroundColor: 'rgba(0,136,204,0.10)' },
  listText: { flex: 1, minWidth: 0, gap: 1 },
  listTitle: { fontSize: 14.5 },
  listMeta: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  listStatus: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  listDot: { width: 7, height: 7, borderRadius: 4 },
  listStatusText: { fontSize: 13 },
  body: { paddingHorizontal: 18, paddingVertical: 16, gap: 12 },
  sendBtn: {
    flex: 1,
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,136,204,0.09)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }),
  },
  actions: { flexDirection: 'row-reverse', gap: 10 },
  previewBtn: {
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    backgroundColor: DESKTOP_COLORS.surface,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }),
  },
  previewHover: { backgroundColor: DESKTOP_COLORS.canvas },
  previewText: { fontSize: 14.5, color: DESKTOP_COLORS.ink },
  sendText: { fontSize: 14.5, color: DESKTOP_COLORS.brand },
  error: { fontSize: 13.5, color: DESKTOP_COLORS.danger },
  list: { borderWidth: 1, borderColor: DESKTOP_COLORS.borderSoft, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, ...webOnly({ transition: 'background-color 150ms ease' }) },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14.5 },
  rowMeta: { fontSize: 13, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  rowLink: { fontSize: 13.5, color: DESKTOP_COLORS.brand },
  rowDanger: { fontSize: 13.5, color: DESKTOP_COLORS.danger },
  rowAction: { paddingHorizontal: 8, minHeight: 32, borderRadius: 8, justifyContent: 'center' },
  addFolder: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(47,91,255,0.09)',
    ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }),
  },
  addFolderHover: { backgroundColor: 'rgba(47,91,255,0.16)' },
  addFolderText: { fontSize: 13.5, color: DESKTOP_COLORS.brand },
});
