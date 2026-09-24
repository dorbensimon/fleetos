import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DocumentRow } from '../../../lib/adminApi';
import { ExpiryState, expiryState, formatDate, parseDateValue } from '../../../lib/theme';
import type { PickedFile } from '../../../lib/documents';
import {
  chooseDocumentSource,
  confirmDeleteDocument,
  documentDisplayName,
  downloadDocumentWithAlert,
  openDocumentExternally,
  pickDocumentSource,
} from '../../../lib/documentActions';
import { DesktopModal } from '../DesktopModal';
import { DesktopDateField, DLtrText, DText, HoverPressable, prefersReducedMotion } from '../primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from '../desktopTheme';
import { DocumentPreview } from './DocumentPreview';

/**
 * Document folders as a calm list (one row per folder: name, status, date,
 * file count) and the folder window that opens from a row. Used by the
 * desktop vehicle record; the folder window has two layouts:
 *
 * - `versions` — expiry folders (licence, insurance, inspections): the newest
 *   document is "the current one" and decides the folder's expiry; older
 *   ones fold away under "מסמכים קודמים" as history.
 * - `gallery` — free-form folders: every file as an equal miniature.
 */

// Same curve as RecordKit's EASE_OUT; not imported, since RecordKit imports this file.
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

export type FolderLayout = 'versions' | 'gallery';

const newestFirst = (docs: DocumentRow[]) => [...docs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

function daysUntil(date: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = parseDateValue(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function expiryStatusText(state: ExpiryState, expiry: string | null): string {
  if (state === 'expired') return 'פג תוקף';
  if (state === 'soon' && expiry) {
    const days = daysUntil(expiry);
    return days <= 0 ? 'פג היום' : days === 1 ? 'מחר' : `בעוד ${days} ימים`;
  }
  if (state === 'ok') return 'בתוקף';
  return 'לא הועלה';
}

/** The status a folder shows: the expiry of its newest document. */
export function folderStatus(docs: DocumentRow[]): { state: ExpiryState; expiry: string | null; count: number } {
  const latest = newestFirst(docs)[0] ?? null;
  if (!latest) return { state: 'missing', expiry: null, count: 0 };
  return { state: latest.expiry_date ? expiryState(latest.expiry_date) : 'optional', expiry: latest.expiry_date, count: docs.length };
}

const STATE_COLOR: Partial<Record<ExpiryState, string>> = {
  ok: DESKTOP_TONES.ok.fg,
  soon: DESKTOP_TONES.warn.fg,
  expired: DESKTOP_TONES.bad.fg,
};

const countLabel = (count: number) => (count === 0 ? 'עדיין אין קובץ' : count === 1 ? 'קובץ אחד' : `${count} קבצים`);

export function FolderListRow({
  title,
  icon,
  docs,
  onPress,
  first,
  plain,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  docs: DocumentRow[];
  onPress: () => void;
  first?: boolean;
  /** A folder without expiry dates: no status, just the file count and the latest upload. */
  plain?: boolean;
}) {
  const { state, expiry, count } = folderStatus(docs);
  const color = STATE_COLOR[state] ?? DESKTOP_COLORS.inkFaint;
  const datePrefix = state === 'expired' ? 'מאז ' : 'עד ';
  const showStatus = !plain && state !== 'optional';
  const latestUpload = plain ? newestFirst(docs)[0]?.created_at ?? null : null;

  return (
    <HoverPressable
      style={[styles.row, !first && styles.rowDivider]}
      hoverStyle={styles.rowHover}
      onPress={onPress}
      accessibilityLabel={`${title}. ${showStatus ? expiryStatusText(state, expiry) : ''}. פתיחת התיקייה`}
    >
      <View style={[styles.rowIcon, plain && count > 0 && styles.rowIconFilled]}>
        <Ionicons name={icon} size={16} color={plain && count > 0 ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkMuted} />
      </View>
      <View style={styles.rowText}>
        <DText weight="semiBold" style={styles.rowTitle} numberOfLines={1}>{title}</DText>
        <View style={styles.rowMeta}>
          {!!expiry && (
            <>
              <DText style={styles.rowMetaText}>{datePrefix}</DText>
              <DLtrText style={styles.rowMetaText}>{formatDate(expiry)}</DLtrText>
              <DText style={styles.rowMetaText}> · </DText>
            </>
          )}
          <DText style={styles.rowMetaText}>{plain && count === 0 ? 'עדיין אין קבצים' : countLabel(count)}</DText>
          {!!latestUpload && (
            <>
              <DText style={styles.rowMetaText}> · עודכן ב־</DText>
              <DLtrText style={styles.rowMetaText}>{formatDate(latestUpload)}</DLtrText>
            </>
          )}
        </View>
      </View>
      {showStatus && (
        <View style={styles.status}>
          <View style={[styles.statusDot, { backgroundColor: color }]} />
          <DText weight="semiBold" style={[styles.statusText, { color }]}>{expiryStatusText(state, expiry)}</DText>
        </View>
      )}
      <Ionicons name="chevron-back" size={15} color={DESKTOP_COLORS.inkFaint} />
    </HoverPressable>
  );
}

/** Pointer devices reveal a tile's actions on hover; touch screens always show them. */
function canHover(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
}

/**
 * The upload area at the bottom of a folder window, in two plain steps:
 * choose a file (drag it onto the dashed box, or click the box), then press
 * "העלאה". Folders with an expiry ask for the date in between.
 */
export function FolderUploadBar({
  requiresExpiry,
  expiryDate,
  onExpiryChange,
  onUpload,
  onClose,
  uploading,
  replacesCurrent,
  extraFields,
}: {
  requiresExpiry: boolean;
  expiryDate: string | null;
  onExpiryChange: (iso: string | null) => void;
  /** Uploads the chosen file; resolves to whether it uploaded, which clears the choice. */
  onUpload: (file: PickedFile) => Promise<boolean>;
  /** Shows a "סגירה" button next to "העלאה". */
  onClose?: () => void;
  uploading: boolean;
  /** Versions folders: say that the new file becomes the current one. */
  replacesCurrent?: boolean;
  /** Folders with their own date fields (e.g. a last-inspection date) render them here instead of the expiry picker. */
  extraFields?: React.ReactNode;
}) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zoneRef = useRef<View>(null);

  const choose = (picked: PickedFile) => {
    setFile(picked);
    setError(null);
  };

  // Drag and drop straight from the computer's folders (web only).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = zoneRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const over = (event: DragEvent) => {
      event.preventDefault();
      setDragOver(true);
    };
    const leave = (event: DragEvent) => {
      if (!node.contains(event.relatedTarget as Node | null)) setDragOver(false);
    };
    const drop = (event: DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      const dropped = event.dataTransfer?.files?.[0];
      if (dropped) choose({ uri: URL.createObjectURL(dropped), name: dropped.name, mimeType: dropped.type || 'application/octet-stream' });
    };
    node.addEventListener('dragover', over);
    node.addEventListener('dragleave', leave);
    node.addEventListener('drop', drop);
    return () => {
      node.removeEventListener('dragover', over);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    };
  }, []);

  const browse = () =>
    chooseDocumentSource('בחירת מסמך', async (source) => {
      const picked = await pickDocumentSource(source);
      if (picked) choose(picked);
    });

  const submit = async () => {
    if (!file) return setError('קודם בוחרים קובץ: גוררים אותו לריבוע או לוחצים עליו.');
    if (requiresExpiry && !extraFields && !expiryDate) return setError('בוחרים עד מתי המסמך בתוקף.');
    setError(null);
    if (await onUpload(file)) setFile(null);
  };

  return (
    <View style={styles.upload}>
      <View ref={zoneRef}>
        <HoverPressable
          style={[styles.dropZone, !!file && styles.dropZoneChosen, dragOver && styles.dropZoneActive]}
          hoverStyle={styles.dropZoneHover}
          pressStyle={styles.pressDown}
          onPress={browse}
          disabled={uploading}
          accessibilityLabel={file ? `נבחר הקובץ ${file.name}. לחיצה להחלפה` : 'בחירת קובץ מהמחשב'}
        >
          {file ? (
            <View style={styles.chosen}>
              <Ionicons name="document-attach-outline" size={20} color={DESKTOP_COLORS.brand} />
              <DText weight="semiBold" style={styles.chosenName} numberOfLines={1}>{file.name}</DText>
              <DText weight="semiBold" style={styles.dropLink}>החלפה</DText>
            </View>
          ) : (
            <DText style={styles.dropText}>
              {dragOver ? 'משחררים כאן את הקובץ' : 'גררו לכאן קובץ, או '}
              {!dragOver && <DText weight="semiBold" style={styles.dropLink}>בחרו קובץ מהמחשב</DText>}
            </DText>
          )}
          {replacesCurrent && !file && <DText style={styles.dropNote}>{'המסמך החדש יהפוך לנוכחי, והנוכחי יעבור ל"מסמכים קודמים"'}</DText>}
        </HoverPressable>
      </View>

      {extraFields ?? (requiresExpiry && (
        <View style={styles.uploadDate}>
          <DText style={styles.uploadLabel}>בתוקף עד</DText>
          <DesktopDateField value={expiryDate} onChange={(iso) => { onExpiryChange(iso); setError(null); }} placeholder="בחירת תאריך" large />
        </View>
      ))}

      {!!error && <DText style={styles.uploadError}>{error}</DText>}

      <View style={styles.actions}>
        <HoverPressable style={[styles.primaryBtn, styles.actionBtn, uploading && styles.disabled]} hoverStyle={styles.primaryBtnHover} pressStyle={styles.pressDown} onPress={() => void submit()} disabled={uploading}>
          {uploading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />}
          <DText weight="semiBold" style={styles.primaryBtnText}>{uploading ? 'מעלה…' : 'העלאה'}</DText>
        </HoverPressable>
        {onClose && (
          <HoverPressable style={[styles.closeBtn, styles.actionBtn]} hoverStyle={styles.closeBtnHover} pressStyle={styles.pressDown} onPress={onClose}>
            <DText weight="semiBold" style={styles.closeBtnText}>סגירה</DText>
          </HoverPressable>
        )}
      </View>
    </View>
  );
}

/** One file in a gallery folder: its miniature, name and upload date. Download and delete appear on hover. */
function GalleryTile({ doc, index, onDelete }: { doc: DocumentRow; index: number; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false);
  const showActions = hovered || !canHover();
  const reduceMotion = prefersReducedMotion();
  return (
    <HoverPressable
      style={[styles.tile, !reduceMotion && styles.tileEnter, !reduceMotion && { animationDelay: `${Math.min(index, 11) * 35}ms` } as object]}
      hoverStyle={styles.tileHover}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => void openDocumentExternally(doc)}
      accessibilityLabel={`פתיחת ${documentDisplayName(doc)}`}
    >
      <View style={[styles.tilePreview, hovered && !reduceMotion && styles.tilePreviewHover]}>
        <DocumentPreview doc={doc} width={78} height={102} />
        <View style={[styles.tileActions, showActions && styles.tileActionsOn]} pointerEvents={showActions ? 'auto' : 'none'}>
          <TileAction icon="download-outline" label="הורדה" onPress={() => void downloadDocumentWithAlert(doc)} />
          <TileAction icon="trash-outline" label="מחיקה" danger onPress={onDelete} />
        </View>
      </View>
      <DText weight="semiBold" style={styles.tileName} numberOfLines={2}>{documentDisplayName(doc)}</DText>
      <DText style={styles.tileMeta}>הועלה ב־</DText>
      <DLtrText style={styles.tileMeta}>{formatDate(doc.created_at)}</DLtrText>
    </HoverPressable>
  );
}

function TileAction({ icon, label, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <HoverPressable style={styles.tileAction} hoverStyle={danger ? styles.iconBtnDangerHover : styles.tileActionHover} pressStyle={styles.pressDown} onPress={onPress} accessibilityLabel={label}>
      <Ionicons name={icon} size={15} color={danger ? DESKTOP_TONES.bad.fg : DESKTOP_COLORS.ink} />
    </HoverPressable>
  );
}

function SmallAction({ icon, label, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <HoverPressable style={styles.iconBtn} hoverStyle={danger ? styles.iconBtnDangerHover : styles.rowHover} pressStyle={styles.pressDown} onPress={onPress} accessibilityLabel={label}>
      <Ionicons name={icon} size={16} color={danger ? DESKTOP_TONES.bad.fg : DESKTOP_COLORS.inkMuted} />
    </HoverPressable>
  );
}

function docDateLine(doc: DocumentRow, current: boolean): { prefix: string; date: string } {
  if (!doc.expiry_date) return { prefix: 'הועלה ב־', date: formatDate(doc.created_at) };
  if (current) return { prefix: expiryState(doc.expiry_date) === 'expired' ? 'פג תוקף ב־' : 'בתוקף עד ', date: formatDate(doc.expiry_date) };
  return { prefix: 'היה בתוקף עד ', date: formatDate(doc.expiry_date) };
}

function DateLine({ doc, current }: { doc: DocumentRow; current: boolean }) {
  const { prefix, date } = docDateLine(doc, current);
  return (
    <View style={styles.rowMeta}>
      <DText style={styles.fileMeta}>{prefix}</DText>
      <DLtrText style={styles.fileMeta}>{date}</DLtrText>
    </View>
  );
}

export function FolderDocumentsModal({
  title,
  docs,
  layout,
  onClose,
  onDeleted,
  upload,
}: {
  title: string;
  docs: DocumentRow[];
  layout: FolderLayout;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
  upload: React.ReactNode;
}) {
  const sorted = newestFirst(docs);
  const [olderOpen, setOlderOpen] = useState(false);
  const remove = (doc: DocumentRow) => confirmDeleteDocument(doc, onDeleted);

  const subtitle = layout === 'gallery'
    ? (sorted.length ? `${countLabel(sorted.length)}. לחיצה על קובץ פותחת אותו.` : '')
    : sorted.length > 1 ? 'המסמך האחרון קובע את התוקף. הקודמים נשמרים כהיסטוריה.' : sorted.length === 1 ? 'המסמך האחרון קובע את התוקף.' : '';

  return (
    <DesktopModal visible title={title} onClose={onClose} maxWidth={layout === 'gallery' ? 640 : 560}>
      <View style={styles.body}>
        {!!subtitle && <DText style={styles.subtitle}>{subtitle}</DText>}

        {sorted.length === 0 ? (
          <DText style={styles.subtitle}>עדיין לא הועלו קבצים לתיקייה הזו.</DText>
        ) : layout === 'gallery' ? (
          <View style={styles.gallery}>
            {sorted.map((doc, index) => (
              <GalleryTile key={doc.id} doc={doc} index={index} onDelete={() => remove(doc)} />
            ))}
          </View>
        ) : (
          <>
            <View style={styles.current}>
              <HoverPressable hoverStyle={styles.previewHover} onPress={() => openDocumentExternally(sorted[0])} accessibilityLabel="צפייה במסמך הנוכחי">
                <DocumentPreview doc={sorted[0]} width={76} height={98} />
              </HoverPressable>
              <View style={styles.currentText}>
                <CurrentTag doc={sorted[0]} />
                <DText weight="bold" style={styles.currentName} numberOfLines={1}>{documentDisplayName(sorted[0])}</DText>
                <DateLine doc={sorted[0]} current />
                <View style={styles.currentActions}>
                  <HoverPressable style={styles.softBtn} hoverStyle={styles.softBtnHover} pressStyle={styles.pressDown} onPress={() => void openDocumentExternally(sorted[0])}>
                    <Ionicons name="eye-outline" size={15} color={DESKTOP_COLORS.brand} />
                    <DText weight="semiBold" style={styles.softBtnText}>צפייה</DText>
                  </HoverPressable>
                  <HoverPressable style={styles.plainBtn} hoverStyle={styles.rowHover} pressStyle={styles.pressDown} onPress={() => void downloadDocumentWithAlert(sorted[0])}>
                    <Ionicons name="download-outline" size={15} color={DESKTOP_COLORS.inkMuted} />
                    <DText weight="semiBold" style={styles.plainBtnText}>הורדה</DText>
                  </HoverPressable>
                  <SmallAction icon="trash-outline" label="מחיקת המסמך" danger onPress={() => remove(sorted[0])} />
                </View>
              </View>
            </View>

            {sorted.length > 1 && (
              <>
                <HoverPressable
                  style={styles.olderToggle}
                  hoverStyle={styles.rowHover}
                  onPress={() => setOlderOpen((v) => !v)}
                  accessibilityState={{ expanded: olderOpen }}
                >
                  <DText weight="semiBold" style={styles.olderLabel}>מסמכים קודמים</DText>
                  <View style={styles.countPill}><DText weight="semiBold" style={styles.countPillText}>{sorted.length - 1}</DText></View>
                  <View style={styles.flex} />
                  <Ionicons name={olderOpen ? 'chevron-up' : 'chevron-down'} size={16} color={DESKTOP_COLORS.inkMuted} />
                </HoverPressable>
                {olderOpen && (
                  <View style={styles.olderList}>
                    {sorted.slice(1).map((doc, index) => (
                      <View key={doc.id} style={[styles.olderRow, index > 0 && styles.rowDivider]}>
                        <HoverPressable hoverStyle={styles.previewHover} onPress={() => openDocumentExternally(doc)} accessibilityLabel={`צפייה ב${documentDisplayName(doc)}`}>
                          <DocumentPreview doc={doc} width={40} height={52} />
                        </HoverPressable>
                        <View style={styles.rowText}>
                          <DText style={styles.olderName} numberOfLines={1}>{documentDisplayName(doc)}</DText>
                          <DateLine doc={doc} current={false} />
                        </View>
                        <HoverPressable style={styles.linkBtn} hoverStyle={styles.softBtnHover} onPress={() => void openDocumentExternally(doc)}>
                          <DText weight="semiBold" style={styles.softBtnText}>צפייה</DText>
                        </HoverPressable>
                        <SmallAction icon="download-outline" label="הורדה" onPress={() => void downloadDocumentWithAlert(doc)} />
                        <SmallAction icon="trash-outline" label="מחיקה" danger onPress={() => remove(doc)} />
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </>
        )}

        {upload}
      </View>
    </DesktopModal>
  );
}

function CurrentTag({ doc }: { doc: DocumentRow }) {
  const state = doc.expiry_date ? expiryState(doc.expiry_date) : 'optional';
  const color = STATE_COLOR[state] ?? DESKTOP_COLORS.inkMuted;
  const label = state === 'optional' ? 'המסמך הנוכחי' : state === 'expired' ? 'המסמך הנוכחי · פג תוקף' : `המסמך הנוכחי · ${expiryStatusText(state, doc.expiry_date)}`;
  return <DText weight="semiBold" style={[styles.currentTag, { color }]}>{label}</DText>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressDown: { transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.6 },

  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 16, paddingVertical: 8, ...webOnly({ transition: 'background-color 150ms ease' }) },
  rowDivider: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  rowIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: DESKTOP_COLORS.canvas, alignItems: 'center', justifyContent: 'center' },
  rowIconFilled: { backgroundColor: 'rgba(0,136,204,0.10)' },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { fontSize: 14.5 },
  rowMeta: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap' },
  rowMetaText: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  status: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontSize: 13 },

  body: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 22, gap: 14 },
  subtitle: { fontSize: 14.5, color: DESKTOP_COLORS.inkMuted },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 22, borderRadius: 12, backgroundColor: DESKTOP_COLORS.surfaceMuted },
  emptyText: { fontSize: 15, color: DESKTOP_COLORS.inkMuted },

  current: { flexDirection: 'row-reverse', gap: 16, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: DESKTOP_COLORS.border, backgroundColor: '#FBFCFD' },
  currentText: { flex: 1, minWidth: 0, gap: 2 },
  currentTag: { fontSize: 13.5 },
  currentName: { fontSize: 16.5 },
  currentActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 10 },
  fileMeta: { fontSize: 14, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  previewHover: webOnly({ filter: 'brightness(0.97)' }),

  softBtn: { height: 36, paddingHorizontal: 14, borderRadius: 9, backgroundColor: 'rgba(0,136,204,0.09)', flexDirection: 'row-reverse', alignItems: 'center', gap: 6, ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  softBtnHover: { backgroundColor: 'rgba(0,136,204,0.15)' },
  softBtnText: { fontSize: 14.5, color: DESKTOP_COLORS.brand },
  plainBtn: { height: 36, paddingHorizontal: 14, borderRadius: 9, backgroundColor: DESKTOP_COLORS.canvas, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  plainBtnText: { fontSize: 14.5, color: DESKTOP_COLORS.ink },
  linkBtn: { height: 32, paddingHorizontal: 10, borderRadius: 8, justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease' }) },
  iconBtn: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  iconBtnDangerHover: { backgroundColor: DESKTOP_TONES.bad.bg },

  olderToggle: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 8, borderRadius: 10, ...webOnly({ transition: 'background-color 150ms ease' }) },
  olderLabel: { fontSize: 15, color: DESKTOP_COLORS.inkMuted },
  countPill: { minWidth: 24, height: 22, paddingHorizontal: 7, borderRadius: 11, backgroundColor: DESKTOP_COLORS.canvas, alignItems: 'center', justifyContent: 'center' },
  countPillText: { fontSize: 13, color: DESKTOP_COLORS.ink },
  olderList: { borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 12, overflow: 'hidden', maxHeight: 290, ...webOnly({ overflowY: 'auto' }) },
  olderRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  olderName: { fontSize: 15 },

  gallery: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, maxHeight: 360, marginHorizontal: -6, ...webOnly({ overflowY: 'auto' }) },
  tile: { width: '24%', flexGrow: 0, alignItems: 'center', paddingTop: 10, paddingBottom: 8, paddingHorizontal: 6, borderRadius: 12, ...webOnly({ transition: 'background-color 150ms ease' }) },
  tileHover: { backgroundColor: DESKTOP_COLORS.canvas },
  tileEnter: webOnly({
    animationKeyframes: { from: { opacity: 0, transform: [{ translateY: 6 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } },
    animationDuration: '320ms',
    animationTimingFunction: EASE_OUT,
    animationFillMode: 'backwards',
  }),
  tilePreview: { marginBottom: 8, ...webOnly({ transition: `transform 200ms ${EASE_OUT}` }) },
  tilePreviewHover: webOnly({ transform: 'scale(1.04)' }),
  tileActions: { position: 'absolute', top: 4, left: 4, flexDirection: 'column', gap: 4, opacity: 0, ...webOnly({ transition: 'opacity 150ms ease' }) },
  tileActionsOn: { opacity: 1 },
  tileAction: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    ...webOnly({ boxShadow: '0 1px 4px rgba(22,34,46,0.18)', transition: 'background-color 150ms ease, transform 120ms ease-out' }),
  },
  tileActionHover: { backgroundColor: '#FFFFFF' },
  tileName: { fontSize: 14.5, lineHeight: 19, textAlign: 'center', color: DESKTOP_COLORS.ink },
  tileMeta: { fontSize: 13, lineHeight: 18, color: DESKTOP_COLORS.inkMuted, textAlign: 'center', ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },

  upload: { gap: 12, marginTop: 4 },
  dropZone: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 84,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9D2DA',
    ...webOnly({ transition: 'background-color 150ms ease, border-color 150ms ease, transform 120ms ease-out' }),
  },
  dropZoneHover: { borderColor: DESKTOP_COLORS.brand, backgroundColor: '#F5FAFD' },
  dropZoneActive: { borderColor: DESKTOP_COLORS.brand, backgroundColor: 'rgba(0,136,204,0.08)', ...webOnly({ transform: 'scale(1.01)' }) },
  dropZoneChosen: { borderStyle: 'solid', borderColor: 'rgba(0,136,204,0.35)', backgroundColor: '#F5FAFD' },
  dropText: { fontSize: 15.5, color: DESKTOP_COLORS.inkMuted, textAlign: 'center' },
  dropLink: { fontSize: 15.5, color: DESKTOP_COLORS.brand },
  dropNote: { fontSize: 13.5, color: DESKTOP_COLORS.inkMuted, textAlign: 'center' },
  chosen: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, maxWidth: '100%' },
  chosenName: { fontSize: 15.5, color: DESKTOP_COLORS.ink, flexShrink: 1 },
  uploadDate: { gap: 6 },
  uploadLabel: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },
  uploadError: { fontSize: 14, color: DESKTOP_TONES.bad.fg },
  actions: { flexDirection: 'row-reverse', gap: 12, marginTop: 4 },
  actionBtn: { flex: 1, height: 48, borderRadius: 12, justifyContent: 'center' },
  primaryBtn: { height: 44, paddingHorizontal: 18, borderRadius: 10, backgroundColor: DESKTOP_COLORS.brand, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  primaryBtnHover: { backgroundColor: DESKTOP_COLORS.brandHover },
  primaryBtnText: { fontSize: 16, color: '#FFFFFF' },
  closeBtn: { backgroundColor: '#EEF1F4', flexDirection: 'row-reverse', alignItems: 'center', ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  closeBtnHover: { backgroundColor: '#E5E9ED' },
  closeBtnText: { fontSize: 16, color: DESKTOP_COLORS.ink },
});
