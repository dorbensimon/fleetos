import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DocumentRow } from '../../lib/adminApi';
import type { PickedFile } from '../../lib/documents';
import { chooseDocumentSource, pickDocumentSource } from '../../lib/documentActions';
import { formatDate } from '../../lib/theme';
import { ErrorState } from '../ui';
import { DesktopModal } from './DesktopModal';
import { DesktopDateField, DesktopInput, DLtrText, DText, HoverPressable, prefersReducedMotion, supportsFinePointerHoverMotion } from './primitives';
import { DESKTOP_COLORS, DESKTOP_FONT, DESKTOP_TONES, webOnly } from './desktopTheme';
import { DocumentPreview } from './record/DocumentPreview';
import { CARD_SHADOW, pageStyles } from './record/RecordPage';
import { EASE_OUT } from './record/RecordKit';

export type CompanyDocumentDraft = { title: string; date: string; description: string; file: PickedFile };

const titleOf = (doc: DocumentRow) => doc.title?.trim() || doc.file_name || 'מסמך ללא שם';
const kindOf = (mime: string | null | undefined) => (mime?.includes('pdf') ? 'PDF' : mime?.startsWith('image/') ? 'תמונה' : 'קובץ');
const countLabel = (count: number) => (count === 1 ? 'מסמך אחד' : `${count} מסמכים`);
const withoutExtension = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TILE_MIN = 226;
const GAP = 20;

/**
 * The company's standing paperwork (business licence, insurance, bank
 * letters) as a shelf of real first-page miniatures — the desktop take on
 * iOS Files. Every card opens its document; the two labelled buttons under
 * it download or delete, so nothing hides behind hover. The phone layout
 * lives in CompanyDocumentsScreen and is untouched.
 */
export function CompanyDocumentsDesktopView({
  docs,
  loading,
  error,
  onRetry,
  onOpen,
  onDownload,
  onDelete,
  onUpload,
}: {
  docs: DocumentRow[];
  /** First load only — later reloads keep the cards on screen. */
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (doc: DocumentRow) => void;
  onDownload: (doc: DocumentRow) => void;
  onDelete: (doc: DocumentRow) => void;
  /** Resolves to whether the document was saved, which closes the dialog. */
  onUpload: (draft: CompanyDocumentDraft) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [gridWidth, setGridWidth] = useState(0);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((doc) => [doc.title, doc.description, doc.file_name].some((v) => v?.toLowerCase().includes(q)));
  }, [docs, query]);

  const columns = gridWidth ? Math.max(1, Math.floor((gridWidth + GAP) / (TILE_MIN + GAP))) : 4;
  const tileWidth = gridWidth ? (gridWidth - GAP * (columns - 1)) / columns : TILE_MIN;
  const onGridLayout = (event: LayoutChangeEvent) => setGridWidth(Math.floor(event.nativeEvent.layout.width));

  const empty = !loading && !error && docs.length === 0;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <DText weight="extraBold" style={styles.title}>מסמכי החברה</DText>
          <DText style={styles.subtitle}>רישיונות, ביטוחים ואישורים — הכול במקום אחד. לחיצה על מסמך פותחת אותו.</DText>
        </View>
        {!empty && <AddButton onPress={() => setAdding(true)} />}
      </View>

      {docs.length > 0 && (
        <View style={styles.toolbar}>
          <View style={styles.search}>
            <Ionicons name="search" size={17} color={DESKTOP_COLORS.inkFaint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="חיפוש מסמך לפי שם או תיאור"
              placeholderTextColor={DESKTOP_COLORS.inkFaint}
              style={styles.searchInput}
              accessibilityLabel="חיפוש מסמך"
            />
            {!!query && (
              <HoverPressable style={styles.searchClear} hoverStyle={styles.searchClearHover} onPress={() => setQuery('')} accessibilityLabel="ניקוי החיפוש">
                <Ionicons name="close" size={13} color="#FFFFFF" />
              </HoverPressable>
            )}
          </View>
          <DText weight="medium" style={styles.count}>
            {query.trim() ? `${shown.length} מתוך ${countLabel(docs.length)}` : countLabel(docs.length)}
          </DText>
        </View>
      )}

      <View onLayout={onGridLayout}>
        {loading ? (
          <View style={styles.grid}>
            {Array.from({ length: Math.min(columns, 4) }, (_, i) => <SkeletonCard key={i} width={tileWidth} />)}
          </View>
        ) : error ? (
          <View style={styles.stateCard}><ErrorState message={error} onRetry={onRetry} /></View>
        ) : empty ? (
          <EmptyShelf onAdd={() => setAdding(true)} />
        ) : shown.length === 0 ? (
          <View style={styles.noResults}>
            <Ionicons name="search-outline" size={30} color={DESKTOP_COLORS.inkFaint} />
            <DText weight="bold" style={styles.noResultsTitle}>{`לא נמצא מסמך עבור "${query.trim()}"`}</DText>
            <DText style={styles.noResultsText}>כדאי לנסות מילה אחרת מתוך שם המסמך.</DText>
          </View>
        ) : (
          <View style={styles.grid}>
            {shown.map((doc, index) => (
              <DocumentCard key={doc.id} doc={doc} index={index} width={tileWidth} onOpen={onOpen} onDownload={onDownload} onDelete={onDelete} />
            ))}
          </View>
        )}
      </View>

      <AddDocumentDialog visible={adding} onClose={() => setAdding(false)} onSave={onUpload} />
    </ScrollView>
  );
}

function AddButton({ onPress, large }: { onPress: () => void; large?: boolean }) {
  return (
    <HoverPressable
      style={[styles.addBtn, large && styles.addBtnLarge]}
      hoverStyle={styles.addBtnHover}
      pressMotionStyle={pageStyles.pressDown}
      onPress={onPress}
      accessibilityLabel="הוספת מסמך חדש"
    >
      <View style={styles.addBtnIcon}><Ionicons name="add" size={18} color={DESKTOP_COLORS.brand} /></View>
      <DText weight="semiBold" style={styles.addBtnText}>הוספת מסמך</DText>
    </HoverPressable>
  );
}

function enterStyle(index: number) {
  if (Platform.OS !== 'web') return null;
  const reduce = prefersReducedMotion();
  return webOnly({
    animationKeyframes: reduce
      ? { from: { opacity: 0 }, to: { opacity: 1 } }
      : { from: { opacity: 0, transform: [{ translateY: 10 }, { scale: 0.985 }] }, to: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] } },
    animationDuration: reduce ? '200ms' : '420ms',
    animationTimingFunction: reduce ? 'ease' : EASE_OUT,
    animationDelay: `${Math.min(index, 11) * 45}ms`,
    animationFillMode: 'backwards',
  });
}

function DocumentCard({
  doc,
  index,
  width,
  onOpen,
  onDownload,
  onDelete,
}: {
  doc: DocumentRow;
  index: number;
  width: number;
  onOpen: (doc: DocumentRow) => void;
  onDownload: (doc: DocumentRow) => void;
  onDelete: (doc: DocumentRow) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [lifts] = useState(supportsFinePointerHoverMotion);
  const [entry] = useState(() => enterStyle(index));
  const title = titleOf(doc);
  const description = doc.description?.trim();

  return (
    <View style={[styles.card, { width }, hovered && styles.cardHover, entry]}>
      <HoverPressable
        style={styles.cardOpen}
        onPress={() => onOpen(doc)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        accessibilityLabel={`פתיחת המסמך ${title}`}
      >
        <View style={styles.stage}>
          <View style={[styles.sheet, lifts && hovered && styles.sheetLifted]}>
            <DocumentPreview doc={doc} width={116} height={150} />
          </View>
          <View style={styles.kind}>
            <DText weight="bold" style={styles.kindText}>{kindOf(doc.mime_type)}</DText>
          </View>
          <View style={[styles.openHint, hovered && styles.openHintOn]} pointerEvents="none">
            <Ionicons name="eye-outline" size={14} color="#FFFFFF" />
            <DText weight="semiBold" style={styles.openHintText}>פתיחה</DText>
          </View>
        </View>
        <View style={styles.cardBody}>
          <DText weight="bold" style={styles.cardTitle} numberOfLines={2}>{title}</DText>
          <View style={styles.dateRow}>
            <Ionicons name="calendar-clear-outline" size={14} color={DESKTOP_COLORS.inkFaint} />
            <DLtrText style={styles.dateText}>{formatDate(doc.document_date ?? doc.created_at)}</DLtrText>
          </View>
          {!!description && <DText style={styles.description} numberOfLines={2}>{description}</DText>}
        </View>
      </HoverPressable>

      <View style={styles.cardFooter}>
        <CardAction icon="download-outline" label="הורדה" onPress={() => onDownload(doc)} a11y={`הורדת המסמך ${title}`} />
        <View style={styles.footerDivider} />
        <CardAction icon="trash-outline" label="מחיקה" danger onPress={() => onDelete(doc)} a11y={`מחיקת המסמך ${title}`} />
      </View>
    </View>
  );
}

function CardAction({ icon, label, onPress, danger, a11y }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean; a11y: string }) {
  const color = danger ? DESKTOP_TONES.bad.fg : DESKTOP_COLORS.brand;
  return (
    <HoverPressable
      style={styles.cardAction}
      hoverStyle={danger ? styles.cardActionDangerHover : styles.cardActionHover}
      pressMotionStyle={pageStyles.pressDown}
      onPress={onPress}
      accessibilityLabel={a11y}
    >
      <Ionicons name={icon} size={17} color={color} />
      <DText weight="semiBold" style={[styles.cardActionText, { color }]}>{label}</DText>
    </HoverPressable>
  );
}

function SkeletonCard({ width }: { width: number }) {
  return (
    <View style={[styles.card, { width }]} accessibilityLabel="טוען מסמכים">
      <View style={[styles.stage, styles.skeletonPulse]}>
        <View style={styles.skeletonSheet} />
      </View>
      <View style={styles.cardBody}>
        <View style={[styles.skeletonLine, styles.skeletonPulse, { width: '70%' }]} />
        <View style={[styles.skeletonLine, styles.skeletonPulse, { width: '38%', height: 10 }]} />
      </View>
      <View style={[styles.cardFooter, { height: 48 }]} />
    </View>
  );
}

function EmptyShelf({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={[styles.empty, enterStyle(0)]}>
      <View style={styles.emptyArt} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.emptyPaper, styles.emptyPaperBack]} />
        <View style={[styles.emptyPaper, styles.emptyPaperMid]} />
        <View style={[styles.emptyPaper, styles.emptyPaperFront]}>
          <View style={[styles.emptyPaperLine, { width: '62%' }]} />
          <View style={[styles.emptyPaperLine, { width: '80%' }]} />
          <View style={[styles.emptyPaperLine, { width: '48%' }]} />
        </View>
      </View>
      <DText weight="extraBold" style={styles.emptyTitle}>עדיין אין כאן מסמכים</DText>
      <DText style={styles.emptyText}>
        מוסיפים כאן את המסמכים הקבועים של החברה, כמו רישיון עסק, פוליסת ביטוח או אישור ניהול חשבון.
      </DText>
      <AddButton onPress={onAdd} large />
    </View>
  );
}

function AddDocumentDialog({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (draft: CompanyDocumentDraft) => Promise<boolean>;
}) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [date, setDate] = useState<string | null>(todayIso);
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({ file: false, title: false, date: false });
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const zoneRef = useRef<View>(null);

  useEffect(() => {
    if (!visible) return;
    setFile(null);
    setTitle('');
    setTitleTouched(false);
    setDate(todayIso());
    setDescription('');
    setErrors({ file: false, title: false, date: false });
    setSaving(false);
    setDragOver(false);
  }, [visible]);

  const choose = (picked: PickedFile) => {
    setFile(picked);
    setErrors((e) => ({ ...e, file: false }));
    // The file name is usually a good start for the document's name.
    if (!titleTouched) {
      setTitle(withoutExtension(picked.name));
      setErrors((e) => ({ ...e, title: false }));
    }
  };

  // Drag and drop straight from the computer's folders (web only).
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const node = zoneRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const over = (event: DragEvent) => { event.preventDefault(); setDragOver(true); };
    const leave = (event: DragEvent) => { if (!node.contains(event.relatedTarget as Node | null)) setDragOver(false); };
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
    // choose reads titleTouched; re-bind when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, titleTouched]);

  const browse = () =>
    chooseDocumentSource('בחירת מסמך', async (source) => {
      const picked = await pickDocumentSource(source);
      if (picked) choose(picked);
    });

  const close = () => { if (!saving) onClose(); };

  const save = async () => {
    const next = { file: !file, title: !title.trim(), date: !date };
    setErrors(next);
    if (next.file || next.title || next.date || !file || !date) return;
    setSaving(true);
    const saved = await onSave({ title: title.trim(), date, description: description.trim(), file });
    setSaving(false);
    if (saved) onClose();
  };

  return (
    <DesktopModal visible={visible} title="הוספת מסמך" onClose={close} maxWidth={560}>
      <View style={styles.form}>
        <View ref={zoneRef}>
          <HoverPressable
            style={[styles.drop, !!file && styles.dropChosen, dragOver && styles.dropActive, errors.file && styles.dropError]}
            hoverStyle={styles.dropHover}
            onPress={browse}
            disabled={saving}
            accessibilityLabel={file ? `נבחר הקובץ ${file.name}. לחיצה להחלפה` : 'בחירת קובץ מהמחשב'}
          >
            {file ? (
              <View style={styles.chosen}>
                <View style={styles.chosenIcon}>
                  <Ionicons name={file.mimeType.startsWith('image/') ? 'image-outline' : 'document-text-outline'} size={22} color={DESKTOP_COLORS.brand} />
                </View>
                <View style={styles.chosenText}>
                  <DText weight="semiBold" style={styles.chosenName} numberOfLines={1}>{file.name}</DText>
                  <DText style={styles.chosenHint}>הקובץ מוכן. לחיצה כאן מחליפה אותו.</DText>
                </View>
                <Ionicons name="checkmark-circle" size={24} color={DESKTOP_TONES.ok.fg} />
              </View>
            ) : (
              <>
                <View style={[styles.dropIcon, dragOver && styles.dropIconActive]}>
                  <Ionicons name="cloud-upload-outline" size={26} color={DESKTOP_COLORS.brand} />
                </View>
                <DText weight="semiBold" style={styles.dropTitle}>{dragOver ? 'משחררים כאן את הקובץ' : 'גוררים לכאן את הקובץ'}</DText>
                {!dragOver && (
                  <DText style={styles.dropText}>
                    {'או '}
                    <DText weight="semiBold" style={styles.dropLink}>לוחצים לבחירה מהמחשב</DText>
                    {' · PDF או תמונה'}
                  </DText>
                )}
              </>
            )}
          </HoverPressable>
          {errors.file && <DText style={styles.fieldError}>יש לבחור את קובץ המסמך</DText>}
        </View>

        <View style={styles.field}>
          <DText weight="semiBold" style={styles.label}>שם המסמך</DText>
          <DesktopInput
            large
            value={title}
            onChangeText={(v) => { setTitle(v); setTitleTouched(true); if (v.trim()) setErrors((e) => ({ ...e, title: false })); }}
            placeholder="למשל: רישיון עסק 2026"
            hasError={errors.title}
            editable={!saving}
          />
          {errors.title && <DText style={styles.fieldError}>יש לתת למסמך שם</DText>}
        </View>

        <View style={styles.field}>
          <DText weight="semiBold" style={styles.label}>תאריך המסמך</DText>
          <DesktopDateField large value={date} onChange={(iso) => { setDate(iso); if (iso) setErrors((e) => ({ ...e, date: false })); }} placeholder="בחירת תאריך" hasError={errors.date} allowClear={false} />
          {errors.date && <DText style={styles.fieldError}>יש לבחור תאריך</DText>}
        </View>

        <View style={styles.field}>
          <DText weight="semiBold" style={styles.label}>
            {'תיאור '}
            <DText style={styles.optional}>(לא חובה)</DText>
          </DText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="מה יש במסמך? למשל: בתוקף לשנה, נשלח מהביטוח"
            placeholderTextColor={DESKTOP_COLORS.inkFaint}
            editable={!saving}
            multiline
            style={styles.textarea}
          />
        </View>

        <View style={styles.dialogActions}>
          <HoverPressable
            style={[pageStyles.primaryBtn, styles.dialogBtn, saving && pageStyles.disabled]}
            hoverStyle={pageStyles.primaryBtnHover}
            pressMotionStyle={pageStyles.pressDown}
            onPress={() => void save()}
            disabled={saving}
            accessibilityLabel="שמירת המסמך"
          >
            <DText weight="semiBold" style={styles.dialogBtnPrimaryText}>{saving ? 'שומר…' : 'שמירת המסמך'}</DText>
          </HoverPressable>
          <HoverPressable
            style={[pageStyles.plainBtn, styles.dialogBtn]}
            hoverStyle={pageStyles.plainBtnHover}
            pressMotionStyle={pageStyles.pressDown}
            onPress={close}
            disabled={saving}
            accessibilityLabel="ביטול"
          >
            <DText weight="semiBold" style={styles.dialogBtnText}>ביטול</DText>
          </HoverPressable>
        </View>
      </View>
    </DesktopModal>
  );
}

const SHEET_SHADOW = '0 1px 2px rgba(22,34,46,0.06), 0 6px 16px rgba(22,34,46,0.08)';
const SHEET_SHADOW_LIFTED = '0 2px 4px rgba(22,34,46,0.06), 0 18px 34px rgba(22,34,46,0.16)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DESKTOP_COLORS.canvas },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 32, paddingTop: 34, paddingBottom: 64, gap: 22 },

  header: { flexDirection: 'row-reverse', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' },
  headerText: { flex: 1, minWidth: 280, gap: 6 },
  title: { fontSize: 34, lineHeight: 40, letterSpacing: -0.8, color: DESKTOP_COLORS.ink },
  subtitle: { fontSize: 16, lineHeight: 24, color: DESKTOP_COLORS.inkMuted },

  addBtn: {
    height: 48,
    paddingRight: 8,
    paddingLeft: 20,
    borderRadius: 14,
    backgroundColor: DESKTOP_COLORS.brand,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    ...webOnly({
      boxShadow: '0 1px 2px rgba(0,136,204,0.25), 0 8px 20px rgba(0,136,204,0.22)',
      transition: 'background-color 150ms ease, transform 120ms ease-out',
    }),
  },
  addBtnLarge: { height: 52, marginTop: 6 },
  addBtnHover: { backgroundColor: DESKTOP_COLORS.brandHover },
  addBtnIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  addBtnText: { fontSize: 16, color: '#FFFFFF' },

  toolbar: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  search: {
    width: 380,
    maxWidth: '100%',
    height: 46,
    borderRadius: 13,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    ...webOnly({ boxShadow: CARD_SHADOW }),
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    fontFamily: DESKTOP_FONT.regular,
    fontSize: 15.5,
    color: DESKTOP_COLORS.ink,
    textAlign: 'right',
    ...webOnly({ outlineStyle: 'none' }),
  },
  searchClear: { width: 20, height: 20, borderRadius: 10, backgroundColor: DESKTOP_COLORS.inkFaint, alignItems: 'center', justifyContent: 'center' },
  searchClearHover: { backgroundColor: DESKTOP_COLORS.inkMuted },
  count: { fontSize: 14.5, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },

  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'stretch', gap: GAP },

  card: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    overflow: 'hidden',
    ...webOnly({ boxShadow: CARD_SHADOW, transition: `box-shadow 300ms ${EASE_OUT}, border-color 200ms ease` }),
  },
  cardHover: {
    borderColor: '#D3DBE1',
    ...webOnly({ boxShadow: '0 2px 4px rgba(22,34,46,0.04), 0 14px 32px rgba(22,34,46,0.09)' }),
  },
  cardOpen: { flex: 1 },
  stage: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2F5',
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.borderSoft,
    ...webOnly({ backgroundImage: 'radial-gradient(120% 90% at 50% 0%, #FFFFFF 0%, #F1F4F7 55%, #E8EDF1 100%)' }),
  },
  sheet: {
    borderRadius: 6,
    ...webOnly({
      boxShadow: SHEET_SHADOW,
      transform: 'translateY(0px) scale(1)',
      transition: `transform 450ms ${EASE_OUT}, box-shadow 450ms ${EASE_OUT}`,
      willChange: 'transform',
    }),
  },
  sheetLifted: webOnly({ transform: 'translateY(-7px) scale(1.045)', boxShadow: SHEET_SHADOW_LIFTED }),
  kind: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 7,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(22,34,46,0.06)',
    ...webOnly({ backdropFilter: 'blur(10px) saturate(160%)' }),
  },
  kindText: { fontSize: 11, letterSpacing: 0.3, color: DESKTOP_COLORS.inkMuted },
  openHint: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(22,34,46,0.78)',
    opacity: 0,
    ...webOnly({ backdropFilter: 'blur(8px)', transform: 'translateY(4px)', transition: `opacity 200ms ease, transform 300ms ${EASE_OUT}` }),
  },
  openHintOn: { opacity: 1, ...webOnly({ transform: 'translateY(0px)' }) },
  openHintText: { fontSize: 12.5, color: '#FFFFFF' },

  cardBody: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, gap: 6 },
  cardTitle: { fontSize: 16.5, lineHeight: 22, letterSpacing: -0.15, color: DESKTOP_COLORS.ink },
  dateRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  dateText: { fontSize: 14, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  description: { fontSize: 14, lineHeight: 20, color: DESKTOP_COLORS.inkMuted },

  cardFooter: { flexDirection: 'row-reverse', alignItems: 'stretch', borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  footerDivider: { width: 1, backgroundColor: DESKTOP_COLORS.borderSoft },
  cardAction: {
    flex: 1,
    height: 48,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }),
  },
  cardActionHover: { backgroundColor: 'rgba(0,136,204,0.07)' },
  cardActionDangerHover: { backgroundColor: DESKTOP_TONES.bad.bg },
  cardActionText: { fontSize: 14.5 },

  skeletonPulse: webOnly({
    animationKeyframes: { '0%': { opacity: 1 }, '50%': { opacity: 0.55 }, '100%': { opacity: 1 } },
    animationDuration: '1400ms',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  }),
  skeletonSheet: { width: 116, height: 150, borderRadius: 6, backgroundColor: '#FFFFFF' },
  skeletonLine: { height: 14, borderRadius: 7, backgroundColor: '#E8EDF1' },

  stateCard: { paddingVertical: 40, borderRadius: 20, backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border },
  noResults: { alignItems: 'center', gap: 6, paddingVertical: 56 },
  noResultsTitle: { fontSize: 18, color: DESKTOP_COLORS.ink, textAlign: 'center' },
  noResultsText: { fontSize: 15, color: DESKTOP_COLORS.inkMuted, textAlign: 'center' },

  empty: {
    alignItems: 'center',
    paddingVertical: 56,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    gap: 10,
    ...webOnly({ boxShadow: CARD_SHADOW, backgroundImage: 'radial-gradient(80% 70% at 50% 0%, rgba(0,136,204,0.06) 0%, rgba(255,255,255,0) 70%)' }),
  },
  emptyArt: { width: 180, height: 150, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyPaper: {
    position: 'absolute',
    width: 96,
    height: 124,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    ...webOnly({ boxShadow: SHEET_SHADOW }),
  },
  emptyPaperBack: { ...webOnly({ transform: 'translateX(-34px) rotate(-10deg)' }), backgroundColor: '#F4F6F8' },
  emptyPaperMid: { ...webOnly({ transform: 'translateX(34px) rotate(9deg)' }), backgroundColor: '#F8FAFB' },
  emptyPaperFront: { paddingTop: 22, paddingHorizontal: 14, gap: 9, alignItems: 'flex-end' },
  emptyPaperLine: { height: 7, borderRadius: 4, backgroundColor: '#E1E6EA' },
  emptyTitle: { fontSize: 22, letterSpacing: -0.4, color: DESKTOP_COLORS.ink, textAlign: 'center' },
  emptyText: { fontSize: 16, lineHeight: 24, color: DESKTOP_COLORS.inkMuted, textAlign: 'center', maxWidth: 440 },

  form: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 22, gap: 18 },
  drop: {
    minHeight: 150,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9D2DA',
    backgroundColor: DESKTOP_COLORS.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 18,
    ...webOnly({ transition: `background-color 150ms ease, border-color 150ms ease, transform 200ms ${EASE_OUT}` }),
  },
  dropHover: { borderColor: DESKTOP_COLORS.brand, backgroundColor: '#F2F8FC' },
  dropActive: { borderColor: DESKTOP_COLORS.brand, backgroundColor: 'rgba(0,136,204,0.08)', ...webOnly({ transform: 'scale(1.015)' }) },
  dropChosen: { minHeight: 84, borderStyle: 'solid', borderColor: 'rgba(0,136,204,0.35)', backgroundColor: '#F2F8FC' },
  dropError: { borderColor: DESKTOP_TONES.bad.fg },
  dropIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    ...webOnly({ boxShadow: SHEET_SHADOW, transition: `transform 300ms ${EASE_OUT}` }),
  },
  dropIconActive: webOnly({ transform: 'translateY(-4px) scale(1.06)' }),
  dropTitle: { fontSize: 16.5, color: DESKTOP_COLORS.ink, textAlign: 'center' },
  dropText: { fontSize: 14.5, color: DESKTOP_COLORS.inkMuted, textAlign: 'center' },
  dropLink: { fontSize: 14.5, color: DESKTOP_COLORS.brand },
  chosen: { alignSelf: 'stretch', flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  chosenIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', ...webOnly({ boxShadow: SHEET_SHADOW }) },
  chosenText: { flex: 1, minWidth: 0, gap: 2 },
  chosenName: { fontSize: 15.5, color: DESKTOP_COLORS.ink },
  chosenHint: { fontSize: 13.5, color: DESKTOP_COLORS.inkMuted },

  field: { gap: 7 },
  label: { fontSize: 15, color: DESKTOP_COLORS.ink },
  optional: { fontSize: 14, color: DESKTOP_COLORS.inkFaint },
  fieldError: { fontSize: 14, color: DESKTOP_TONES.bad.fg, marginTop: 6 },
  textarea: {
    minHeight: 92,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
    backgroundColor: DESKTOP_COLORS.surface,
    fontFamily: DESKTOP_FONT.regular,
    fontSize: 15.5,
    lineHeight: 22,
    color: DESKTOP_COLORS.ink,
    textAlign: 'right',
    textAlignVertical: 'top',
  },
  dialogActions: { flexDirection: 'row-reverse', gap: 12, marginTop: 4 },
  dialogBtn: { flex: 1, height: 50, borderRadius: 13, justifyContent: 'center' },
  dialogBtnPrimaryText: { fontSize: 16, color: '#FFFFFF' },
  dialogBtnText: { fontSize: 16, color: DESKTOP_COLORS.ink },
});
