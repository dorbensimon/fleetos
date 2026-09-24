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
import { buildSigningFolders, signingFolderStatus, type SigningFolder } from '../../../lib/signingFolders';
import { DesktopModal } from '../DesktopModal';
import { DText, HoverPressable } from '../primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from '../desktopTheme';
import { recordStyles } from '../record/RecordKit';

type FolderStatus = ReturnType<typeof signingFolderStatus>;
const STATUS_LABEL: Record<FolderStatus, string> = { pending: 'ממתין לחתימה', completed: 'נחתם', failed: 'דורש טיפול', empty: 'לא נשלח' };

const time = (date: string) => new Date(date).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
const day = (date: string) => new Date(date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\./g, '/');

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
      const [templates, requests] = await Promise.all([listSigningTemplates(companyId), listDriverSigningRequests(driverId)]);
      if (generation !== request.current) return;
      setFolders(buildSigningFolders(templates, requests));
      setError('');
    } catch (err: any) {
      if (generation === request.current) setError(err?.message || 'טעינת הטפסים נכשלה');
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

  useEffect(() => {
    if (!openFolderId) return;
    setOpenId(openFolderId);
    onFolderOpened?.();
  }, [openFolderId, onFolderOpened]);

  const openFolder = folders.find((folder) => folder.id === openId) ?? null;

  if (loading) return <DText style={styles.message}>טוען טפסים…</DText>;
  if (error) return <DText style={styles.message}>{error}</DText>;
  if (!folders.length) return <DText style={styles.message}>אין עדיין טפסים לחתימה בחברה</DText>;

  return (
    <>
      {folders.map((folder, index) => {
        const status = signingFolderStatus(folder);
        const signedAt = lastSignedAt(folder);
        const sentAt = lastSentAt(folder);
        const meta = status === 'pending' && sentAt
          ? `נשלח ב־${day(sentAt)}`
          : signedAt
            ? `נחתם ב־${day(signedAt)}`
            : status === 'failed'
              ? 'השליחה לא הצליחה'
              : 'עוד לא נשלח לנהג';
        const color = STATUS_COLOR[status];
        return (
          <HoverPressable
            key={folder.id}
            style={[styles.listRow, index > 0 && styles.listDivider]}
            hoverStyle={recordStyles.rowHover}
            onPress={() => setOpenId(folder.id)}
            accessibilityLabel={`${folder.title}, ${STATUS_LABEL[status]}. פתיחה`}
          >
            <View style={[styles.listIcon, status === 'completed' && styles.listIconDone]}>
              <Ionicons name="create-outline" size={16} color={status === 'completed' ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkMuted} />
            </View>
            <View style={styles.listText}>
              <DText weight="semiBold" style={styles.listTitle} numberOfLines={1}>{folder.title}</DText>
              <DText style={styles.listMeta}>{meta}</DText>
            </View>
            <View style={styles.listStatus}>
              <View style={[styles.listDot, { backgroundColor: color }]} />
              <DText weight="semiBold" style={[styles.listStatusText, { color }]}>{STATUS_LABEL[status]}</DText>
            </View>
            <Ionicons name="chevron-back" size={15} color={DESKTOP_COLORS.inkFaint} />
          </HoverPressable>
        );
      })}
      {openFolder && (
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

  // Same refresh the full signing page runs: pull the live DocuSeal state of
  // requests that may have changed since they were stored.
  useEffect(() => {
    const toSync = folder.requests.filter((item) => (item.status === 'pending' && item.docuseal_submitter_slug) || (item.status === 'completed' && !item.signed_file_path));
    if (!toSync.length) return;
    let active = true;
    Promise.allSettled(toSync.map((item) => syncSigningRequest(item.id))).then(async (results) => {
      if (!active) return;
      if (results.some((result) => result.status === 'rejected')) setMessage('לא ניתן לעדכן כרגע את כל מצבי החתימה. מוצג המידע האחרון שנשמר.');
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
      onOpenSession({ ...session, title: item.template_title || folder.title, requestId: item.id, signedAt: item.completed_at ?? undefined });
      // The document opens full screen; this window must not stay on top of it.
      onClose();
    } catch (err: any) {
      setMessage(err?.message || 'פתיחת המסמך נכשלה');
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
      const session = await getSigningTemplatePreviewSession(folder.template.id);
      onOpenSession({ ...session, title: folder.title });
      onClose();
    } catch (err: any) {
      setMessage(err?.message || 'פתיחת המסמך נכשלה. נסה שוב.');
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
      if (!result.success || result.created !== 1) setMessage(result.message || 'השליחה לא אושרה. נסה שוב.');
    } catch (err: any) {
      setMessage(err?.message || 'השליחה נכשלה. נסה שוב.');
    } finally {
      sendingLock.current = false;
      setSending(false);
    }
  };

  return (
    <DesktopModal visible title={folder.title} onClose={onClose} maxWidth={520}>
      <View style={styles.body}>
        {canSend && folder.template && (
          <View style={styles.actions}>
          {!(completed && !pending) && (
            <HoverPressable
              style={[styles.previewBtn, opening === 'preview' && recordStyles.disabled]}
              hoverStyle={styles.previewHover}
              pressStyle={recordStyles.pressDown}
              disabled={opening === 'preview' || sending}
              onPress={preview}
              accessibilityLabel="צפייה במסמך לפני השליחה"
            >
              <Ionicons name="eye-outline" size={16} color={DESKTOP_COLORS.ink} />
              <DText weight="semiBold" style={styles.previewText}>{opening === 'preview' ? 'פותח…' : 'צפייה במסמך'}</DText>
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
              {sending ? 'שולח…' : pending ? 'שליחה מחדש לחתימה' : completed ? 'צפייה במסמך החתום' : 'שליחה לחתימה'}
            </DText>
          </HoverPressable>
          </View>
        )}
        {!!message && <DText style={styles.error}>{message}</DText>}
        {folder.requests.length === 0 ? (
          <DText style={styles.message}>הטופס עוד לא נשלח לנהג</DText>
        ) : (
          <View style={styles.list}>
            {folder.requests.map((item, index) => {
              const ready = item.status === 'pending' && !!item.docuseal_submitter_slug;
              const openable = item.status === 'completed';
              return (
                <HoverPressable
                  key={item.id}
                  style={[styles.row, index < folder.requests.length - 1 && recordStyles.rowBorder]}
                  hoverStyle={openable ? recordStyles.rowHover : undefined}
                  disabled={opening === item.id || !openable}
                  onPress={() => open(item)}
                >
                  <Ionicons
                    name={item.status === 'completed' ? 'checkmark-circle' : ready ? 'time-outline' : 'alert-circle-outline'}
                    size={16}
                    color={item.status === 'completed' || ready ? DESKTOP_COLORS.brand : DESKTOP_COLORS.danger}
                  />
                  <View style={styles.rowText}>
                    <DText weight="semiBold" style={styles.rowTitle}>{item.template_title || folder.title}</DText>
                    <DText style={styles.rowMeta}>
                      {item.status === 'completed'
                        ? `נחתם ${time(item.completed_at || item.created_at)}`
                        : ready
                        ? `נשלח ${time(item.sent_at || item.created_at)}`
                        : item.status === 'declined'
                        ? 'החתימה נדחתה'
                        : 'השליחה לא אושרה — ניתן לנסות שוב'}
                    </DText>
                  </View>
                  {openable && <DText weight="semiBold" style={styles.rowLink}>{opening === item.id ? 'פותח…' : 'צפייה'}</DText>}
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
});
