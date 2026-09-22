import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  assignSigningTemplate,
  getSigningSession,
  listDriverSigningRequests,
  listSigningTemplates,
  syncSigningRequest,
  type SignatureRequest,
} from '../../../lib/docuseal';
import { buildSigningFolders, signingFolderStatus, type SigningFolder } from '../../../lib/signingFolders';
import { DesktopModal } from '../DesktopModal';
import { DText, HoverPressable, StatusPill } from '../primitives';
import { DESKTOP_COLORS, DesktopTone, webOnly } from '../desktopTheme';
import { FolderTile, recordStyles } from '../record/RecordKit';

type FolderStatus = ReturnType<typeof signingFolderStatus>;
const STATUS_TONE: Record<FolderStatus, DesktopTone> = { pending: 'warn', completed: 'ok', failed: 'bad', empty: 'neutral' };
const STATUS_LABEL: Record<FolderStatus, string> = { pending: 'ממתין לחתימה', completed: 'נחתם', failed: 'דורש טיפול', empty: 'לא נשלח' };

const time = (date: string) => new Date(date).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });

export type SigningSessionTarget = Awaited<ReturnType<typeof getSigningSession>> & { title: string; requestId: string };

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

/**
 * "טפסים לחתימה" on the desktop driver record: one tile per signing
 * template (with its status), opening a centered modal that lists the
 * folder's requests and sends/re-sends it. The signing document itself still
 * opens in the full DocuSeal page — it does not fit a small modal.
 */
export function DriverSigningTiles({
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
  /** Opens this folder's modal from outside (the "דרוש טיפול" banner). */
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
  if (!folders.length) return <DText style={styles.message}>אין עדיין תבניות חתימה בחברה</DText>;

  return (
    <>
      <View style={recordStyles.folderGrid}>
        {folders.map((folder) => {
          const status = signingFolderStatus(folder);
          return (
            <FolderTile
              key={folder.id}
              title={folder.title}
              icon="create-outline"
              onPress={() => setOpenId(folder.id)}
              accessibilityLabel={`${folder.title}, ${STATUS_LABEL[status]}`}
              meta={<StatusPill tone={STATUS_TONE[status]} label={STATUS_LABEL[status]} />}
            />
          );
        })}
      </View>
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
      onOpenSession({ ...session, title: item.template_title || folder.title, requestId: item.id });
    } catch (err: any) {
      setMessage(err?.message || 'פתיחת המסמך נכשלה');
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
  message: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted, paddingVertical: 4 },
  body: { paddingHorizontal: 18, paddingVertical: 16, gap: 12 },
  sendBtn: {
    alignSelf: 'flex-end',
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }),
  },
  sendText: { fontSize: 12.5, color: DESKTOP_COLORS.brand },
  error: { fontSize: 12, color: DESKTOP_COLORS.danger },
  list: { borderWidth: 1, borderColor: DESKTOP_COLORS.borderSoft, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, ...webOnly({ transition: 'background-color 150ms ease' }) },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 13 },
  rowMeta: { fontSize: 12, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  rowLink: { fontSize: 12, color: DESKTOP_COLORS.brand },
});
